"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import writeXlsxFile from "write-excel-file/browser";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
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
import { bulkDeleteThreshold, type RosterPlan } from "@/modules/enrollment/roster.plan";
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
  //
  // 삭제 대상(missingFromFile)의 studentProfileId를 반드시 지문에 넣는다 —
  // 안 그러면 "행 수·첫줄·끝줄 이름"만 같고 삭제 대상이 다른 두 업로드가 같은
  // 지문으로 잡혀 PreviewCard가 다시 마운트되지 않는다. 그러면 이전 업로드에서
  // 체크했던 deletionConfirmed(삭제 확인 체크박스) 상태가 그대로 남아, 관리자가
  // 다른 학생의 삭제를 다시 확인하지 않고도 확정 버튼이 눌리는 사고로 이어진다.
  // 전교생 규모에서는 가운데 줄 하나만 바꿔도 행 수·첫/끝 이름이 그대로인 경우가
  // 흔하다 — 되돌릴 수 없는 동작이라 이 틈을 남겨두면 안 된다.
  const previewFingerprint =
    previewState.plan &&
    `${previewState.year}:${previewState.rows.length}:` +
      `${previewState.rows[0]?.name ?? ""}:${previewState.rows.at(-1)?.name ?? ""}:` +
      previewState.plan.missingFromFile.map((s) => s.studentProfileId).join(",");

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
        <Note tone="error" className="mt-3">
          {exportError}
        </Note>
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
        <Note tone="error" className="mt-4">
          {state.error}
        </Note>
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
  // 삭제 확인 체크박스. 서버가 삭제 대상 id 집합·건수를 다시 대조해 강제하지만
  // (applyRosterPlan, I-2·I-3), 화면에서도 막아야 관리자가 배너를 안 읽고 실수로
  // 확정을 누르는 걸 줄인다.
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  // 대량 삭제(I-3) 확인용으로 관리자가 직접 입력하는 건수. 문자열로 들고 있다가
  // 제출 시에만 숫자와 대조한다 — 입력 중간값("1", "10" 앞자리)도 그대로 보여줘야
  // 한다.
  const [typedDeleteCount, setTypedDeleteCount] = useState("");

  const applied = applyState.saved !== null && !applyState.error;
  const issueCount = plan.errorRows.length + plan.needsAttention.length;
  const deleteCount = plan.missingFromFile.length;
  // "10명 또는 전체 학생의 10% 중 큰 쪽" — roster.plan.ts와 정확히 같은 계산이어야
  // 화면이 입력칸을 보여주는 조건과 서버가 건수를 요구하는 조건이 어긋나지 않는다.
  const bulkThreshold = bulkDeleteThreshold(plan.totalStudents);
  const requiresCountConfirmation = deleteCount > bulkThreshold;
  const countConfirmationMatches = Number(typedDeleteCount) === deleteCount;

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold text-ink">미리보기</h2>
        <p className="mt-0.5 text-[12px] text-mut">{year}학년도 기준입니다.</p>
        {notices.map((notice) => (
          // 경고색이지만 알림은 필요하다 — 파일 전체에 걸리는 주의(학생코드 열
          // 없음 등)라 놓치면 잘못된 확정으로 이어진다. Note는 error에만 role을
          // 자동으로 붙이므로 여기서 명시한다.
          <Note key={notice} tone="warn" role="alert" className="mt-2">
            {notice}
          </Note>
        ))}
      </header>

      {/* 미리보기 맨 위에, 접지 않고 펼친 채로 보여준다. 위험색(rose)이 아니라
          경고색(amber)을 쓴다 — 되돌릴 수 있는 동작이다(다음 명단에 다시 넣으면
          돌아온다). 그래도 건수 직접 입력 확인은 그대로 둔다 — 되돌릴 수 있어도
          전교생이 목록에서 한꺼번에 사라지는 건 여전히 큰 사고다. */}
      {deleteCount > 0 && (
        <div className="border-b-4 border-amber-ink bg-amber-soft px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold text-amber-ink">
              명단에서 빠지는 학생
            </h3>
            <span className="rounded-full bg-amber-ink px-2.5 py-1 text-[11px] font-bold text-white">
              {deleteCount}명
            </span>
          </div>
          <p className="mt-1 text-[12.5px] font-semibold text-amber-ink">
            명단에 없는 학생입니다. 확정하면 계정이 비활성화되고 목록·로그인에서
            빠집니다 — 학적·소속·상벌점 기록은 그대로 남고, 다음 명단에 다시
            포함하면 계정이 자동으로 되살아납니다.
          </p>
          <ul className="mt-3 divide-y divide-line2">
            {plan.missingFromFile.map((s) => (
              <li
                key={s.studentProfileId}
                className="flex items-center justify-between py-2 text-[13px]"
              >
                <span className="font-semibold text-ink">
                  {s.name}
                  <span className="ml-1.5 font-mono text-[11.5px] font-normal text-mut">
                    {s.studentCode}
                  </span>
                </span>
                <span className="text-mut">
                  {seatLabel(s)} · {statusLabel(s.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
      </div>

      <div className="border-t border-line px-5 py-4">
        {/* 이 두 배너는 role="alert"가 빠져 있었다 — 하필 되돌릴 수 없는 동작을
            다루는 화면이라, 화면을 못 보는 사람에게 실패가 전달되지 않으면 그대로
            다음 단추를 누른다. Note tone="error"가 자동으로 붙인다. */}
        {plan.hasBlockingError && (
          <Note tone="error" className="mb-3">
            오류나 확인 필요 항목이 남아 있어 확정할 수 없습니다. 파일을 고쳐 다시
            올려 주세요.
          </Note>
        )}
        {applyState.error && (
          <Note tone="error" className="mb-3">
            {applyState.error}
          </Note>
        )}

        {applied ? (
          // 확정에 성공하면 폼이 통째로 사라져 포커스가 <body>로 떨어진다 —
          // 이 결과만은 알림으로도 전달돼야 한다. Note는 error에만 role을
          // 자동으로 붙이므로 여기서 명시한다.
          <Note tone="success" role="status">
            {/* Minor-4: 제외 건수가 반영 건수 안에 묻히면 몇 명이 빠졌는지 이
                문구만 보고는 알 수 없다 — 제외가 있을 때만 따로 덧붙인다. */}
            {applyState.deleted && applyState.deleted > 0
              ? `${applyState.saved}건 반영, ${applyState.deleted}명 명단에서 제외했습니다.`
              : `${applyState.saved}건 반영했습니다.`}
          </Note>
        ) : (
          <form action={applyAction} className="flex flex-col gap-3">
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            <input type="hidden" name="year" value={year} />
            {/* 서버(applyRosterPlan)가 미리보기 이후 다시 세운 삭제 대상 집합과
                대조하지만(I-2), 체크한 시점에 화면이 본 id 목록을 실어 보내야 그
                대조가 성립한다. 체크 전에는 빈 배열 — 빈 배열 자체가 "확인 안
                함"이므로 별도의 boolean 필드는 없다. */}
            <input
              type="hidden"
              name="confirmedDeletionIds"
              value={JSON.stringify(
                deletionConfirmed ? plan.missingFromFile.map((s) => s.studentProfileId) : [],
              )}
            />
            {/* 대량 삭제(I-3)에서만 서버가 이 값을 본다 — 임계 이하에서는 빈
                문자열을 보내고 서버도 무시한다. */}
            <input type="hidden" name="deletionCount" value={typedDeleteCount} />
            {deleteCount > 0 && (
              <label className="flex items-start gap-2 text-[13px] font-semibold text-amber-ink">
                <input
                  type="checkbox"
                  checked={deletionConfirmed}
                  onChange={(e) => setDeletionConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-amber-ink"
                />
                <span>
                  위 {deleteCount}명을 명단에서 뺍니다. 계정이 비활성화되지만
                  되돌릴 수 있습니다.
                </span>
              </label>
            )}
            {requiresCountConfirmation && (
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-amber-ink">
                <span>
                  {deleteCount}명은 대량 제외입니다. 잘못된 파일을 올렸을 때 마지막
                  방어선이 되도록, 뺄 인원 수를 직접 입력해야 확정할 수 있습니다.
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={typedDeleteCount}
                  onChange={(e) => setTypedDeleteCount(e.target.value)}
                  placeholder="뺄 인원 수"
                  className="w-40 rounded-btn border border-amber-ink bg-surface px-3 py-2 text-[13px] font-semibold text-ink"
                />
              </label>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={
                  applying ||
                  plan.hasBlockingError ||
                  (deleteCount > 0 && !deletionConfirmed) ||
                  (requiresCountConfirmation && !countConfirmationMatches)
                }
              >
                {applying
                  ? "반영하는 중…"
                  : deleteCount > 0
                    ? `확정 (${deleteCount}명 제외)`
                    : "확정"}
              </Button>
            </div>
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
