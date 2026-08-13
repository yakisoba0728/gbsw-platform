"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import writeXlsxFile from "write-excel-file/browser";
import { Button } from "@/components/ui/button";
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";
import { formatInviteCode } from "@/lib/invite-code";
import { toStyledSheetData } from "@/lib/xlsx-sheet";
import {
  ROSTER_COLUMN_WIDTHS,
  ROSTER_COLUMNS,
  ROSTER_INFO_COLUMNS,
} from "@/modules/enrollment/roster.export";
import type { RosterRow } from "@/modules/enrollment/roster.parse";
import type { RosterPlan } from "@/modules/enrollment/roster.plan";
import { APPLY_INITIAL, PREVIEW_INITIAL } from "./action-state";
import { applyRosterAction, exportRosterAction, previewRosterAction } from "./actions";

/**
 * 빈 서식 예시 두 줄. 학생코드를 비워 둔다 — 빈 학생코드가 "신규"라는 뜻을
 * 서식 자체로 보여준다. 이 서식은 학생이 아직 없거나 새로 만들 때만 쓴다;
 * 기존 학생은 "전체 명단 내려받기"로 받은 파일을 고쳐서 올린다.
 */
const TEMPLATE_ROWS: (string | number | null)[][] = [
  [...ROSTER_COLUMNS],
  ["", "김example", "2010-03-05", 1, 3, 1, "재학"],
  ["", "이example", "2008-11-20", null, null, null, "졸업"],
];

async function downloadTemplate() {
  const sheetData = toStyledSheetData(TEMPLATE_ROWS);
  await writeXlsxFile(sheetData, {
    columns: ROSTER_COLUMN_WIDTHS.slice(0, ROSTER_COLUMNS.length).map((width) => ({ width })),
    stickyRowsCount: 1,
  }).toFile("학생명단서식.xlsx");
}

async function downloadInvites(
  invites: {
    name: string;
    code: string;
    grade: number | null;
    classNo: number | null;
    number: number | null;
  }[],
  year: number,
) {
  const rows: (string | number | null)[][] = [
    ["이름", "초대코드", "학년", "반", "번호"],
    ...invites.map((i) => [i.name, formatInviteCode(i.code), i.grade, i.classNo, i.number]),
  ];
  const sheetData = toStyledSheetData(rows);
  await writeXlsxFile(sheetData, { stickyRowsCount: 1 }).toFile(`초대코드목록_${year}학년도.xlsx`);
}

function seatLabel(row: {
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string {
  if (row.grade === null || row.classNo === null || row.number === null) return "—";
  return `${row.grade}학년 ${row.classNo}반 ${row.number}번`;
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return ENROLLMENT_STATUS_LABELS[status as EnrollmentStatus] ?? status;
}

/** 학적변동·신규 배정 줄에 라벨만 보이면 몇 학년 몇 반 몇 번인지 알 수 없다 (I7). */
function statusWithSeatLabel(row: {
  status: string | null;
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string {
  return `${statusLabel(row.status)} · ${seatLabel(row)}`;
}

/*
 * 두 폼(미리보기·확정)은 형제로 둔다 — HTML은 <form> 중첩을 허용하지 않는다.
 * 각 폼이 자기 결과(useActionState)를 직접 렌더한다. 부모가 자식의 성공 여부를
 * 끌어올려 render 중에 setState하면 "다른 컴포넌트 렌더 중 업데이트" 오류가 난다.
 */
export function ImportForm() {
  const [previewState, previewAction, previewing] = useActionState(
    previewRosterAction,
    PREVIEW_INITIAL,
  );

  // 새로 올린 파일마다 지문을 만든다 — 이전 확정 결과(성공 배너·초대코드 표)가
  // 새 미리보기 위에 그대로 남아있지 않도록, 내용이 바뀌면 PreviewCard를 통째로
  // 새로 마운트해 안의 확정 폼 상태(applyState)를 초기화한다.
  const previewFingerprint =
    previewState.plan &&
    `${previewState.year}:${previewState.rows.length}:${previewState.rows[0]?.name ?? ""}:${previewState.rows.at(-1)?.name ?? ""}`;

  return (
    <>
      <UploadCard state={previewState} action={previewAction} pending={previewing} />
      {previewState.plan && previewState.year !== null && (
        <PreviewCard
          key={previewFingerprint}
          year={previewState.year}
          rows={previewState.rows}
          plan={previewState.plan}
          notices={previewState.notices}
        />
      )}
    </>
  );
}

function UploadCard({
  state,
  action,
  pending,
}: {
  state: typeof PREVIEW_INITIAL;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [exporting, startExport] = useTransition();
  const [exportError, setExportError] = useState<string | null>(null);

  function downloadRoster() {
    setExportError(null);
    startExport(async () => {
      const result = await exportRosterAction();
      if (result.error || result.year === null) {
        setExportError(result.error ?? "명단을 내려받지 못했습니다.");
        return;
      }
      const sheetData = toStyledSheetData(result.rows, {
        infoColumnCount: ROSTER_INFO_COLUMNS.length,
      });
      await writeXlsxFile(sheetData, {
        columns: ROSTER_COLUMN_WIDTHS.map((width) => ({ width })),
        stickyRowsCount: 1,
      }).toFile(`학생명단_${result.year}학년도.xlsx`);
    });
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-ink">명단 파일 올리기</h2>
          <p className="mt-0.5 text-[12px] text-mut">
            전체 명단을 내려받아 고친 뒤 그대로 다시 올리세요. 파일이 곧 전교생
            완성본입니다 — 줄을 지우면 그 학생의 이번 학년도 배정이 사라집니다.
          </p>
          <p className="mt-1 text-[12px] font-semibold text-rose">
            첫 열(학생코드)은 학생을 알아보는 유일한 기준입니다. 지우거나 고치지
            마세요 — 비워 두면 같은 학생도 새 학생으로 등록됩니다.
          </p>
          <p className="mt-1 text-[12px] text-mut">
            이름·생년월일은 여기서 고쳐도 반영되지 않습니다 — 학생 상세 화면에서만
            고칠 수 있습니다. 이 파일에서는 등록된 값과 대조하는 용도로만 씁니다.
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button type="button" size="sm" onClick={downloadRoster} disabled={exporting}>
            {exporting ? "받는 중…" : "전체 명단 내려받기"}
          </Button>
          <button
            type="button"
            onClick={() => {
              void downloadTemplate();
            }}
            className="text-[12px] font-semibold text-pri hover:underline"
          >
            빈 서식 내려받기 (신규 등록용)
          </button>
        </div>
      </div>

      {exportError && (
        <p
          role="alert"
          className="mt-3 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {exportError}
        </p>
      )}

      <form action={action} className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx"
          required
          aria-label="명단 파일"
          className="flex-1 text-sm text-ink file:mr-3 file:rounded-btn file:border file:border-line file:bg-soft file:px-3.5 file:py-2 file:text-[12.5px] file:font-semibold file:text-ink"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "읽는 중…" : "미리보기"}
        </Button>
      </form>

      {state.error && (
        <p
          role="alert"
          className="mt-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
        >
          {state.error}
        </p>
      )}
    </section>
  );
}

function PreviewCard({
  year,
  rows,
  plan,
  notices,
}: {
  year: number;
  rows: RosterRow[];
  plan: RosterPlan;
  notices: string[];
}) {
  const [applyState, applyAction, applying] = useActionState(
    applyRosterAction,
    APPLY_INITIAL,
  );

  const applied = applyState.saved !== null && !applyState.error;
  const issueCount = plan.errorRows.length + plan.needsAttention.length;

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">미리보기</h2>
        <p className="mt-0.5 text-[12px] text-mut">{year}학년도 기준입니다.</p>
        {notices.map((notice) => (
          <p
            key={notice}
            role="alert"
            className="mt-2 rounded-btn bg-amber-soft px-3 py-2.5 text-[12.5px] font-semibold text-amber-ink"
          >
            {notice}
          </p>
        ))}
      </header>

      <div className="divide-y divide-line2">
        <IssueGroup
          title="오류 · 확인 필요"
          count={issueCount}
          tone="rose"
          defaultOpen={issueCount > 0}
        >
          {plan.errorRows.map((r) => (
            <IssueRow key={`err-${r.line}`} line={r.line} name={r.name} reason={r.errors.join(" · ")} />
          ))}
          {plan.needsAttention.map((r) => (
            <IssueRow key={`att-${r.line}`} line={r.line} name={r.name} reason={r.reason} />
          ))}
        </IssueGroup>

        <PlannedGroup title="신규" count={plan.newStudents.length} defaultOpen={false}>
          {plan.newStudents.map((r) => (
            <PlannedRowItem
              key={`new-${r.line}`}
              name={r.name}
              detail={r.status === "ENROLLED" ? seatLabel(r) : "코드 발급 안 함"}
            />
          ))}
        </PlannedGroup>

        <PlannedGroup title="재배정" count={plan.reassign.length} defaultOpen={false}>
          {plan.reassign.map((r) => (
            <PlannedRowItem
              key={`reassign-${r.line}`}
              name={r.name}
              beforeName={r.beforeName}
              detail={seatLabel(r)}
            />
          ))}
        </PlannedGroup>

        <PlannedGroup
          title="새 학년도 배정"
          count={plan.newAssignment.length}
          defaultOpen={false}
        >
          {plan.newAssignment.map((r) => (
            <PlannedRowItem
              key={`newassign-${r.line}`}
              name={r.name}
              detail={statusWithSeatLabel(r)}
            />
          ))}
        </PlannedGroup>

        <PlannedGroup title="학적변동" count={plan.statusChange.length} defaultOpen={false}>
          {plan.statusChange.map((r) => (
            <PlannedRowItem
              key={`status-${r.line}`}
              name={r.name}
              beforeName={r.beforeName}
              detail={statusWithSeatLabel(r)}
            />
          ))}
        </PlannedGroup>

        <details open={plan.missingFromFile.length > 0} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 select-none">
            <span className="text-sm font-bold text-ink">명단에 없는 재학생</span>
            <span className="rounded-full bg-amber-soft px-2.5 py-1 text-[11px] font-bold text-amber-ink">
              {plan.missingFromFile.length}건
            </span>
          </summary>
          {plan.missingFromFile.length > 0 && (
            <div className="px-5 pb-4">
              <p className="rounded-btn bg-amber-soft px-3 py-2.5 text-[12.5px] font-semibold text-amber-ink">
                확정하면 이 학생들의 {year}학년도 배정이 사라집니다.
              </p>
              <ul className="mt-2 divide-y divide-line2">
                {plan.missingFromFile.map((s) => (
                  <li
                    key={s.studentProfileId}
                    className="flex items-center justify-between py-2 text-[13px]"
                  >
                    <span className="font-semibold text-ink">{s.name}</span>
                    <span className="text-mut">
                      {seatLabel(s)} · {statusLabel(s.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      </div>

      <div className="border-t border-line px-5 py-4">
        {plan.hasBlockingError && (
          <p className="mb-3 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose">
            오류나 확인 필요 항목이 남아 있어 확정할 수 없습니다. 파일을 고쳐 다시
            올려 주세요.
          </p>
        )}
        {applyState.error && (
          <p className="mb-3 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose">
            {applyState.error}
          </p>
        )}

        {applied ? (
          <p className="rounded-btn bg-green-soft px-3 py-2.5 text-[13px] font-semibold text-green">
            {applyState.saved}건 반영했습니다.
          </p>
        ) : (
          <form action={applyAction} className="flex justify-end">
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            <input type="hidden" name="year" value={year} />
            <Button
              type="submit"
              size="sm"
              disabled={applying || plan.hasBlockingError}
            >
              {applying ? "반영하는 중…" : "확정"}
            </Button>
          </form>
        )}
      </div>

      {applied && applyState.invites.length > 0 && (
        <InvitesResult invites={applyState.invites} year={year} />
      )}

      {applied && (
        <div className="border-t border-line px-5 py-4">
          <Link
            href="/admin/students"
            className="text-[12.5px] font-semibold text-pri hover:underline"
          >
            학생 관리로 돌아가기
          </Link>
        </div>
      )}
    </section>
  );
}

function InvitesResult({
  invites,
  year,
}: {
  invites: {
    name: string;
    code: string;
    grade: number | null;
    classNo: number | null;
    number: number | null;
  }[];
  year: number;
}) {
  return (
    <div className="border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-ink">발급된 초대코드</h3>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void downloadInvites(invites, year);
          }}
        >
          코드 목록 xlsx 받기
        </Button>
      </div>
      <p className="mt-1 text-[12px] text-mut">
        코드는{" "}
        <Link href="/admin/invites" className="font-semibold text-pri hover:underline">
          초대 관리
        </Link>
        에서도 다시 확인할 수 있습니다. 한 번에 내려받으려면 지금 받아 두세요.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-line2 text-[12px] text-mut">
              <th className="py-2 pr-3 font-semibold">이름</th>
              <th className="py-2 pr-3 font-semibold">소속</th>
              <th className="py-2 font-semibold">초대코드</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.code} className="border-b border-line2 last:border-0">
                <td className="py-2 pr-3 font-semibold text-ink">{invite.name}</td>
                <td className="py-2 pr-3 text-mut">{seatLabel(invite)}</td>
                <td className="py-2 font-mono text-[12.5px] text-ink">
                  {formatInviteCode(invite.code)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  tone: "rose";
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 select-none">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="rounded-full bg-rose-soft px-2.5 py-1 text-[11px] font-bold text-rose">
          {count}건
        </span>
      </summary>
      {count > 0 && <ul className="divide-y divide-line2 px-5 pb-4">{children}</ul>}
    </details>
  );
}

function IssueRow({ line, name, reason }: { line: number; name: string; reason: string }) {
  return (
    <li className="py-2 text-[13px]">
      <span className="font-semibold text-rose">{line}행</span>{" "}
      <span className="font-semibold text-ink">{name || "(이름 없음)"}</span>
      <span className="block text-mut">{reason}</span>
    </li>
  );
}

function PlannedGroup({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 select-none">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="rounded-full bg-mut-soft px-2.5 py-1 text-[11px] font-bold text-mut">
          {count}건
        </span>
      </summary>
      {count > 0 && <ul className="divide-y divide-line2 px-5 pb-4">{children}</ul>}
    </details>
  );
}

/** beforeName: 학생코드로 이어진 DB 쪽 이름. 파일의 이름(name)만 보여주면 무엇에
 * 이어졌는지 화면만으로는 확인할 길이 없다 — 등록명을 나란히 보여준다. */
function PlannedRowItem({
  name,
  beforeName,
  detail,
}: {
  name: string;
  beforeName?: string | null;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between py-2 text-[13px]">
      <span className="font-semibold text-ink">
        {name}
        {beforeName && <span className="ml-1.5 font-normal text-mut">(등록명: {beforeName})</span>}
      </span>
      <span className="text-mut">{detail}</span>
    </li>
  );
}
