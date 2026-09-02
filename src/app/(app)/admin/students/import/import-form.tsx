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
import { formatSeat } from "@/lib/student-number";
import {
  APPLY_INITIAL,
  PREVIEW_INITIAL,
  applySuccessMessage,
} from "./action-state";
import { applyRosterAction, exportRosterAction, previewRosterAction } from "./actions";
import { previewFingerprintFor } from "./preview-fingerprint";

// 이 화면의 이름은 파일 대조 값이므로 호칭을 붙이지 않는다.
const TEMPLATE_ROWS: (string | number | null)[][] = [
  [...ROSTER_COLUMNS],
  ["", "김example", "2010-03-05", 1, 3, 1, "재학"],
  ["", "이example", "2008-11-20", null, null, null, "졸업"],
];

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
  return formatSeat(row) ?? "—";
}

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return ENROLLMENT_STATUS_LABELS[status as EnrollmentStatus] ?? status;
}

function statusWithSeatLabel(row: {
  status: string | null;
  grade: number | null;
  classNo: number | null;
  number: number | null;
}): string {
  return `${statusLabel(row.status)} · ${seatLabel(row)}`;
}

export function ImportForm() {
  const [previewState, previewAction, previewing] = useActionState(
    previewRosterAction,
    PREVIEW_INITIAL,
  );

  // 중간 행만 바뀐 미리보기라도 삭제 확인 상태를 새로 받는다.
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
          className="flex-1 text-sm text-ink file:mr-3 file:h-9 file:rounded-btn file:border file:border-line-strong file:bg-surface file:px-3 file:text-caption file:font-medium file:text-ink lg:file:h-8"
        />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending || fileError !== null}
        >
          {pending ? "읽는 중…" : "미리보기"}
        </Button>
      </form>

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
  const [typedDeleteCount, setTypedDeleteCount] = useState("");

  const successMessage = applySuccessMessage(applyState);
  const applied = successMessage !== null && !applyState.error;
  const issueCount = plan.errorRows.length + plan.needsAttention.length;
  const deleteCount = plan.missingFromFile.length;
  const countConfirmationMatches = Number(typedDeleteCount) === deleteCount;

  return (
    <SectionCard
      title="미리보기"
      hint={`${year}학년도 기준입니다.`}
      controls={
        notices.map((notice) => (
          <Note key={notice} tone="warn" role="alert" className="mt-2">
            {notice}
          </Note>
        ))
      }
      flush
    >
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
          <p className="mt-1.5 text-caption font-medium text-amber-ink">
            확정하면 이 학생들의 계정과 기록이 영구히 사라집니다. 자퇴·전출은 줄을
            지우지 말고 학적 칸을 바꾸세요.
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
        <PreviewGroup
          title="오류 · 확인 필요"
          count={issueCount}
          defaultOpen={issueCount > 0}
          hasIssues
        >
          {plan.errorRows.map((r) => (
            <IssueRow key={`err-${r.line}`} line={r.line} name={r.name} reason={r.errors.join(" · ")} />
          ))}
          {plan.needsAttention.map((r) => (
            <IssueRow
              key={`att-${r.line}-${r.studentProfileId ?? ""}`}
              line={r.line}
              name={r.name}
              reason={r.reason}
            />
          ))}
        </PreviewGroup>

        <PreviewGroup title="신규" count={plan.newStudents.length} defaultOpen={false}>
          {plan.newStudents.map((r) => (
            <PlannedRowItem
              key={`new-${r.line}`}
              name={r.name}
              detail={r.status === "ENROLLED" ? seatLabel(r) : "초대코드 없음"}
            />
          ))}
        </PreviewGroup>

        <PreviewGroup title="재배정" count={plan.reassign.length} defaultOpen={false}>
          {plan.reassign.map((r) => (
            <PlannedRowItem
              key={`reassign-${r.line}`}
              name={r.name}
              beforeName={r.beforeName}
              detail={seatLabel(r)}
            />
          ))}
        </PreviewGroup>

        <PreviewGroup
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
        </PreviewGroup>

        <PreviewGroup title="학적변동" count={plan.statusChange.length} defaultOpen={false}>
          {plan.statusChange.map((r) => (
            <PlannedRowItem
              key={`status-${r.line}`}
              name={r.name}
              beforeName={r.beforeName}
              detail={statusWithSeatLabel(r)}
            />
          ))}
        </PreviewGroup>
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
            <div role="status">
              <Note tone="success">
                {successMessage}
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
            <input
              type="hidden"
              name="confirmedDeletionIds"
              value={JSON.stringify(plan.missingFromFile.map((s) => s.studentProfileId))}
            />
            <input type="hidden" name="deletionCount" value={typedDeleteCount} />
            {deleteCount > 0 && (
              <label className="flex flex-col gap-1.5 text-caption font-medium text-amber-ink">
                <span>
                  확정하면 위 {deleteCount}명의 계정과 학생 기록이 DB에서 영구히
                  물리 삭제됩니다. 연결된 초대코드·학부모 연결·상벌점 이력은 cascade로
                  함께 사라지고 복원 기능은 없습니다. 확인을 위해 인원 수를 직접 입력해 주세요.
                </span>
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

function IssueRow({ line, name, reason }: { line: number; name: string; reason: string }) {
  return (
    <li className="py-2 text-caption">
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

function PreviewGroup({
  title,
  count,
  defaultOpen,
  hasIssues = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen: boolean;
  hasIssues?: boolean;
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
        <Badge tone={hasIssues && count > 0 ? "demerit" : "neutral"}>{count}건</Badge>
      </summary>
      {count > 0 && <ul className="divide-y divide-line2 px-5 pb-4">{children}</ul>}
    </details>
  );
}

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
