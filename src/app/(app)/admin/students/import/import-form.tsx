"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { SectionCard } from "@/components/ui/section-card";
import { DataTable, type Column } from "@/components/ui/table";
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
import { ROSTER_FILE_MAX_BYTES } from "@/modules/enrollment/roster.schema";
import { APPLY_INITIAL, PREVIEW_INITIAL } from "./action-state";
import { applyRosterAction, exportRosterAction, previewRosterAction } from "./actions";
import { previewFingerprintFor } from "./preview-fingerprint";

/** 빈 서식 예시 두 줄. 학생코드를 비워 둬 그 자체로 "신규"를 보여준다. */
const TEMPLATE_ROWS: (string | number | null)[][] = [
  [...ROSTER_COLUMNS],
  ["", "김example", "2010-03-05", 1, 3, 1, "재학"],
  ["", "이example", "2008-11-20", null, null, null, "졸업"],
];

/** xlsx writer는 단추를 눌렀을 때만 불러온다. 브라우저 전용이라 서버 번들에 못 넣는다. */
async function loadXlsxWriter() {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  return writeXlsxFile;
}

async function downloadTemplate() {
  const writeXlsxFile = await loadXlsxWriter();
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
  const writeXlsxFile = await loadXlsxWriter();
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

/** 학적 라벨만으로는 몇 학년 몇 반 몇 번인지 알 수 없다. */
function statusWithSeatLabel(row: {
  status: string | null;
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string {
  return `${statusLabel(row.status)} · ${seatLabel(row)}`;
}

/* 두 폼(미리보기·확정)은 형제로 둔다 — <form> 중첩은 HTML이 허용하지 않는다. */
export function ImportForm() {
  const [previewState, previewAction, previewing] = useActionState(
    previewRosterAction,
    PREVIEW_INITIAL,
  );

  // 미리보기 전체에 지문을 만들어 내용이 바뀌면 PreviewCard를 새로 마운트한다.
  // 줄 수·첫/끝 이름만 보면 중간 줄이 바뀌어도 확정 폼 상태가 남을 수 있다.
  const previewFingerprint =
    previewState.plan && previewState.year !== null
      ? previewFingerprintFor({
          year: previewState.year,
          rows: previewState.rows,
          plan: previewState.plan,
          notices: previewState.notices,
          rosterFingerprint: previewState.rosterFingerprint,
          previewToken: previewState.previewToken,
        })
      : undefined;

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
          rosterFingerprint={previewState.rosterFingerprint}
          previewToken={previewState.previewToken}
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
  // 상한을 넘는 파일은 서버 액션에 닿기 전에 next.config.ts의 bodySizeLimit에 잘려
  // 안내 대신 오류 경계가 뜬다. 고른 순간 여기서 막아 제출 자체를 못 하게 한다.
  const [fileError, setFileError] = useState<string | null>(null);

  function downloadRoster() {
    setExportError(null);
    startExport(async () => {
      const result = await exportRosterAction();
      if (result.error || result.year === null) {
        setExportError(result.error ?? "명단을 내보내지 못했습니다.");
        return;
      }
      const writeXlsxFile = await loadXlsxWriter();
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
    <SectionCard
      variant="panel"
      title="명단 반영"
      hint="파일이 곧 전교생 완성본입니다. 줄을 지우면 그 학생이 명단에서 빠집니다."
      aside={
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={downloadRoster}
            disabled={exporting}
          >
            {exporting ? "내보내는 중…" : "전체 명단 내보내기"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void downloadTemplate();
            }}
          >
            빈 서식 내보내기
          </Button>
        </div>
      }
    >
      <p className="text-caption font-medium text-rose">
        학생코드 열은 학생을 알아보는 유일한 기준입니다. 비우면 같은 학생도 새
        학생으로 등록됩니다.
      </p>
      <p className="mt-1 text-caption text-mut">
        이름·생년월일은 여기서 고쳐도 반영되지 않습니다.
      </p>

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
          onChange={(e) => {
            const file = e.target.files?.[0];
            setFileError(
              file && file.size > ROSTER_FILE_MAX_BYTES ? "파일이 너무 큽니다." : null,
            );
          }}
          // 브라우저가 그리는 버튼이라 `Button`을 못 쓴다 — `file:` 접두 클래스로만
          // 꾸밀 수 있어서 secondary sm 규격(h-9 lg:h-8 · px-3 · text-caption ·
          // border-line-strong)을 손으로 맞춘다. 옆의 미리보기 버튼과 같은 높이다.
          className="flex-1 text-sm text-ink file:mr-3 file:h-9 file:rounded-btn file:border file:border-line-strong file:bg-surface file:px-3 file:text-caption file:font-medium file:text-ink lg:file:h-8"
        />
        {/* 이 화면을 연 목적은 확정이다 — 여기까지는 전부 그 앞의 단계다. */}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending || fileError !== null}
        >
          {pending ? "읽는 중…" : "미리보기"}
        </Button>
      </form>

      {/* 고른 파일이 너무 크면 그 안내가 먼저다 — 제출을 막았으므로 state.error는
          직전 시도의 남은 문구다. */}
      {(fileError ?? state.error) && (
        <Note tone="error" className="mt-4">
          {fileError ?? state.error}
        </Note>
      )}
    </SectionCard>
  );
}

function PreviewCard({
  year,
  rows,
  plan,
  notices,
  rosterFingerprint,
  previewToken,
}: {
  year: number;
  rows: RosterRow[];
  plan: RosterPlan;
  notices: string[];
  rosterFingerprint: string | null;
  previewToken: string | null;
}) {
  const [applyState, applyAction, applying] = useActionState(
    applyRosterAction,
    APPLY_INITIAL,
  );
  // 교사가 직접 적는 인원 수. 입력 중간값도 그대로 보여야 해서 문자열로 든다.
  const [typedDeleteCount, setTypedDeleteCount] = useState("");

  const applied = applyState.saved !== null && !applyState.error;
  const issueCount = plan.errorRows.length + plan.needsAttention.length;
  const deleteCount = plan.missingFromFile.length;
  const countConfirmationMatches = Number(typedDeleteCount) === deleteCount;

  return (
    <SectionCard
      title="미리보기"
      hint={`${year}학년도 기준입니다.`}
      controls={
        // 파일 전체에 걸리는 주의라 놓치면 잘못된 확정으로 이어진다. Note는
        // error에만 role을 자동으로 붙이므로 여기서 명시한다.
        notices.map((notice) => (
          <Note key={notice} tone="warn" role="alert" className="mt-2">
            {notice}
          </Note>
        ))
      }
      flush
    >
      {/* 미리보기 맨 위에 펼친 채로 둔다. 다음 명단에 다시 넣으면 돌아오므로
          위험색이 아니라 경고색을 쓴다. */}
      {deleteCount > 0 && (
        <div className="border-b border-amber-line bg-amber-soft px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-amber-ink">
              명단에서 빠지는 학생
            </h3>
            <Badge tone="pending" dot={false}>
              {deleteCount}명
            </Badge>
          </div>
          {/* 이 경로는 되돌릴 수 없는 물리 삭제다. 임시 제외처럼 읽히면 안 된다. */}
          <p className="mt-1.5 text-caption font-medium text-amber-ink">
            확정하면 계정과 학생 기록이 DB에서 영구히 물리 삭제됩니다. 연결된
            초대코드·학부모 연결·상벌점 이력도 cascade로 함께 사라지며 복원 기능은
            없습니다. 자퇴·전출은 줄을 지우지 말고 학적 칸을 바꿔 기록해 주세요.
          </p>
          <ul className="mt-3 divide-y divide-line2">
            {plan.missingFromFile.map((s) => (
              <li
                key={s.studentProfileId}
                className="flex items-center justify-between py-2 text-caption"
              >
                <span className="font-medium text-ink">
                  {s.name}
                  <span className="ml-1.5 font-mono text-xs font-normal text-mut">
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
          defaultOpen={issueCount > 0}
        >
          {plan.errorRows.map((r) => (
            <IssueRow key={`err-${r.line}`} line={r.line} name={r.name} reason={r.errors.join(" · ")} />
          ))}
          {/* 명단에서 빠진 학생은 파일 줄이 없어 line이 전부 0이다 — 키에 학생을
              함께 넣지 않으면 둘 이상일 때 겹친다. */}
          {plan.needsAttention.map((r) => (
            <IssueRow
              key={`att-${r.line}-${r.studentProfileId ?? ""}`}
              line={r.line}
              name={r.name}
              reason={r.reason}
            />
          ))}
        </IssueGroup>

        <PlannedGroup title="신규" count={plan.newStudents.length} defaultOpen={false}>
          {plan.newStudents.map((r) => (
            <PlannedRowItem
              key={`new-${r.line}`}
              name={r.name}
              detail={r.status === "ENROLLED" ? seatLabel(r) : "초대코드 없음"}
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
        {plan.hasBlockingError && (
          <Note tone="error" className="mb-3">
            오류·확인 필요 항목이 남아 있어 확정할 수 없습니다. 파일을 고쳐 다시
            올려 주세요.
          </Note>
        )}
        {applyState.error && (
          <Note tone="error" className="mb-3">
            {applyState.error}
          </Note>
        )}

        {applied ? (
          <>
            {/* 확정하면 폼이 사라져 포커스가 <body>로 떨어진다. 두 배너를 한
                영역으로 묶어 한 번에 읽히게 한다. */}
            <div role="status">
              <Note tone="success">
                {applyState.deleted && applyState.deleted > 0
                  ? `${applyState.saved}건 반영, ${applyState.deleted}명 명단에서 뺐습니다.`
                  : `${applyState.saved}건 반영했습니다.`}
              </Note>

              {applyState.excludedNew.length > 0 && (
                <Note tone="warn" className="mt-3">
                  {applyState.excludedNew.length}건은 재학이 아닌 신규 줄이라 계정과
                  초대코드를 만들지 않았습니다. 학적을 재학으로 바꿔 다시 올리세요.
                </Note>
              )}
            </div>

            {applyState.excludedNew.length > 0 && (
              <ul className="mt-2 divide-y divide-line2">
                {applyState.excludedNew.map((row) => (
                  <li
                    key={row.line}
                    className="flex items-center justify-between py-2 text-caption"
                  >
                    <span className="font-medium text-ink">
                      <span className="tabular-nums text-amber-ink">{row.line}행</span>{" "}
                      {row.name || "(이름 없음)"}
                    </span>
                    <span className="text-mut">{statusLabel(row.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form action={applyAction} className="flex flex-col gap-3">
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="rosterFingerprint" value={rosterFingerprint ?? ""} />
            <input type="hidden" name="previewToken" value={previewToken ?? ""} />
            {/* 화면이 본 삭제 대상을 늘 실어 보낸다. 동의 표시가 아니라 서버가
                다시 세운 집합과 대조할 근거다. */}
            <input
              type="hidden"
              name="confirmedDeletionIds"
              value={JSON.stringify(plan.missingFromFile.map((s) => s.studentProfileId))}
            />
            {/* 한 명이라도 빠지면 서버가 이 값을 요구한다. */}
            <input type="hidden" name="deletionCount" value={typedDeleteCount} />
            {deleteCount > 0 && (
              <label className="flex flex-col gap-1.5 text-caption font-medium text-amber-ink">
                <span>
                  확정하면 위 {deleteCount}명의 계정과 학생 기록이 DB에서 영구히
                  물리 삭제됩니다. 연결된 초대코드·학부모 연결·상벌점 이력은 cascade로
                  함께 사라지고 복원 기능은 없습니다. 확인을 위해 인원 수를 직접 입력해 주세요.
                </span>
                {/* 폭은 바깥에서 준다 — cn()이 w-full을 못 덮는다. */}
                <div className="w-40">
                  <Input
                    size="sm"
                    type="number"
                    inputMode="numeric"
                    value={typedDeleteCount}
                    onChange={(e) => setTypedDeleteCount(e.target.value)}
                    placeholder="빠지는 인원 수"
                  />
                </div>
              </label>
            )}
            <div className="flex justify-end">
              {/* 초록(실행)이 아니라 붉은 채움이다 — 누르면 계정과 학생 기록이
                  DB에서 영구히 사라지고 복원 기능이 없다. 화면의 주된 동작이라
                  무게는 primary와 같게 두되 색으로 말린다. */}
              <Button
                type="submit"
                variant="danger-solid"
                size="sm"
                disabled={
                  applying ||
                  plan.hasBlockingError ||
                  (deleteCount > 0 && !countConfirmationMatches)
                }
              >
                {applying
                  ? "반영 중…"
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
            className="text-caption font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            학생 관리로 돌아가기
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

function InvitesResult({
  invites,
  year,
}: {
  invites: IssuedInvite[];
  year: number;
}) {
  return (
    // 표는 카드 안쪽 여백 밖에 둔다 — 표의 첫·끝 열 px-5가 곧 카드 여백이라
    // 밖에서 한 번 더 주면 세로줄이 어긋난다.
    <div className="border-t border-line py-4">
      <div className="px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">발급된 초대코드</h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void downloadInvites(invites, year);
            }}
          >
            내보내기
          </Button>
        </div>
        <p className="mt-1 text-caption text-mut">
          한 파일로 받으려면 지금 내보내세요. 코드는{" "}
          <Link
            href="/admin/invites"
            className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
          >
            초대 관리
          </Link>
          에서도 다시 볼 수 있습니다.
        </p>
      </div>

      {/* 같은 내용을 내는 다른 초대 표 둘(초대 관리·학부모 초대)은 폰에서 카드로
          접힌다. 여기만 옆으로 스크롤되고 있었다. */}
      <DataTable
        minWidth={520}
        narrow="cards"
        rows={invites}
        rowKey={(invite) => invite.code}
        columns={INVITE_COLUMNS}
        className="mt-3"
      />
    </div>
  );
}

type IssuedInvite = {
  name: string;
  code: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

const INVITE_COLUMNS: readonly Column<IssuedInvite>[] = [
  {
    key: "name",
    header: "이름",
    card: "title",
    cell: (invite) => <span className="font-medium text-ink">{invite.name}</span>,
  },
  {
    key: "seat",
    header: "소속",
    card: "meta",
    cell: (invite) => <span className="text-mut">{seatLabel(invite)}</span>,
  },
  {
    key: "code",
    header: "초대코드",
    card: "trailing",
    cell: (invite) => (
      <span className="font-mono text-caption text-ink">
        {formatInviteCode(invite.code)}
      </span>
    ),
  },
];

function IssueGroup({
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
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 select-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          size={16}
          className="shrink-0 text-mut transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{title}</span>
        <Badge tone={count > 0 ? "demerit" : "neutral"}>{count}건</Badge>
      </summary>
      {count > 0 && <ul className="divide-y divide-line2 px-5 pb-4">{children}</ul>}
    </details>
  );
}

function IssueRow({ line, name, reason }: { line: number; name: string; reason: string }) {
  return (
    <li className="py-2 text-caption">
      {/* line 0은 파일에 대응하는 줄이 없다는 표시다 (roster.plan.ts) — 0행이라고
          적으면 없는 줄을 찾게 된다. */}
      {line > 0 ? (
        <span className="tabular-nums text-rose">{line}행</span>
      ) : (
        <span className="font-medium text-rose">명단에 없음</span>
      )}{" "}
      <span className="font-medium text-ink">{name || "(이름 없음)"}</span>
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
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 select-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          size={16}
          className="shrink-0 text-mut transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 text-sm font-medium text-ink">{title}</span>
        <Badge tone="neutral">{count}건</Badge>
      </summary>
      {count > 0 && <ul className="divide-y divide-line2 px-5 pb-4">{children}</ul>}
    </details>
  );
}

/** beforeName은 학생코드로 이어진 등록명이다. 파일의 이름과 나란히 보여준다. */
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
    <li className="flex items-center justify-between py-2 text-caption">
      <span className="font-medium text-ink">
        {name}
        {beforeName && (
          <span className="ml-1.5 font-normal text-mut">(등록명: {beforeName})</span>
        )}
      </span>
      <span className="text-mut">{detail}</span>
    </li>
  );
}
