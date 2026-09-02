import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/session";
import {
  ENROLLMENT_STATUS_LABELS,
  isEnrollmentStatus,
} from "@/core/authz/enrollment-status";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { signedPoints } from "@/components/merit/kind-badge";
import { BackLink } from "@/components/ui/back-link";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableFrame, tableCellPadding } from "@/components/ui/table";
import { MeritTotalsCards } from "@/components/merit/merit-totals";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatDate, formatDateTime, isSameKstDate } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getStudentHeader, getStudentMerit } from "@/modules/merit/award.service";
import { PrintButton } from "./print-button";
import { honorificName } from "@/core/authz/roles";

export const metadata: Metadata = { title: "상벌점 확인서" };

export default async function MeritPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("merit:read:any");

  const { studentId } = await params;
  const raw = await searchParams;
  const track: MeritTrack = isMeritTrack(raw.track) ? raw.track : "SCHOOL";
  const year =
    typeof raw.year === "string" && /^\d{4}$/.test(raw.year) ? Number(raw.year) : undefined;

  let view: Awaited<ReturnType<typeof getStudentMerit>> | null = null;
  let header: Awaited<ReturnType<typeof getStudentHeader>> = null;
  let noCurrentYear = false;
  try {
    [view, header] = await Promise.all([
      getStudentMerit(actor, studentId, track, year),
      getStudentHeader(actor, studentId),
    ]);
  } catch (error) {
    if (!(error instanceof AcademicYearError)) throw error;
    noCurrentYear = true;
  }

  if (!view || !header) {
    if (!noCurrentYear) notFound();

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <StudentBackLink studentId={studentId} track={track} />
        <NoAcademicYearNotice />
      </div>
    );
  }

  const active = view.awards.filter((a) => a.status === "ACTIVE");
  const backdated = active.filter((a) => !isSameKstDate(a.occurredOn, a.createdAt));
  const scope = isYearScoped(track)
    ? `${view.year}학년도`
    : "입학부터 전체 누적";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <StudentBackLink studentId={studentId} track={track} />
        <PrintButton />
      </div>

      <article className={cardClass("page", "print:rounded-none print:border-0 print:p-0")}>
        <header className="border-b border-line pb-4">
          <p className="text-xs font-medium text-mut">
            경북소프트웨어마이스터고등학교
          </p>
          <h1 className="mt-1 text-title font-semibold text-ink">
            {MERIT_TRACK_LABELS[track]} 상벌점 확인서
          </h1>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-line py-4 text-sm">
          <Row label="이름" value={header.name} />
          <Row label="학생코드" value={header.studentCode} mono />
          <Row
            label="학급"
            value={
              header.grade !== null && header.classNo !== null
                ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                : "소속 미배정"
            }
          />
          <Row label="집계 범위" value={scope} />
          {header.removed && (
            <Row
              label="학적"
              value={
                isEnrollmentStatus(header.status)
                  ? ENROLLMENT_STATUS_LABELS[header.status]
                  : "재적 없음"
              }
            />
          )}
        </dl>

        <div className="@container py-4">
          <MeritTotalsCards totals={view.totals} />
        </div>
        <p className="pb-4 text-xs text-mut">
          순점수 = 상점 + 상쇄점 − 벌점. 취소된 기록은 합계에서 빠집니다.
        </p>

        {active.length === 0 ? (
          <EmptyState variant="inside">
            해당 범위에 부여된 상벌점이 없습니다.
          </EmptyState>
        ) : (
          <TableFrame
            minWidth={520}
            gutter={false}
            headers={PRINT_HEADERS}
            cols={PRINT_COLS}
          >
            <tbody>
              {active.map((award) => (
                <tr key={award.id} className="border-b border-line2 last:border-0">
                  <td className={printCell(0)}>
                    <span className="whitespace-nowrap tabular-nums text-mut">
                      {formatDate(award.occurredOn)}
                      {!isSameKstDate(award.occurredOn, award.createdAt) && (
                        <span title={`입력 ${formatDate(award.createdAt)}`}>*</span>
                      )}
                    </span>
                  </td>
                  <td className={`${printCell(1)} whitespace-nowrap`}>
                    {MERIT_KIND_LABELS[award.kind as MeritKind] ?? award.kind}
                  </td>
                  <td className={`${printCell(2)} text-ink`}>
                    {award.label}
                    {award.note && (
                      <span className="block text-xs text-mut">{award.note}</span>
                    )}
                  </td>
                  <td className={`${printCell(3)} text-right font-medium`}>
                    {signedPoints(award.kind, award.points)}
                  </td>
                  <td className={`${printCell(4)} text-right whitespace-nowrap text-mut`}>
                    {honorificName(award.awardedByName, "ADMIN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableFrame>
        )}

        {backdated.length > 0 && (
          <p className="mt-4 text-xs text-mut">
            * 표시한 항목은 일이 일어난 뒤에 입력된 기록입니다 (표의 날짜는 발생일).
            {backdated.map((award) => (
              <span key={award.id} className="ml-1 tabular-nums">
                {formatDate(award.occurredOn)} → 입력 {formatDate(award.createdAt)}
                {";"}
              </span>
            ))}
          </p>
        )}

        <footer className="mt-6 border-t border-line pt-3 text-xs text-mut">
          출력 시각 <span className="tabular-nums">{formatDateTime(new Date())}</span> ·
          발급 {honorificName(actor.name, "ADMIN")}
        </footer>
      </article>
    </div>
  );
}

function StudentBackLink({ studentId, track }: { studentId: string; track: MeritTrack }) {
  return (
    <BackLink href={`/students/${studentId}?tab=merit&track=${track}`}>
      학생 상벌점
    </BackLink>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-[68px] shrink-0 text-mut">{label}</dt>
      <dd className={`font-medium text-ink${mono ? " font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

const PRINT_HEADERS = [
  "발생일",
  "구분",
  "항목",
  <span key="points" className="block text-right">
    점수
  </span>,
  <span key="by" className="block text-right">
    부여
  </span>,
];

const PRINT_COLS = ["w-[96px]", "w-[64px]", undefined, "w-[64px]", "w-[104px]"];

function printCell(index: number): string {
  return `${tableCellPadding(index, PRINT_HEADERS.length, false)} py-2.5`;
}
