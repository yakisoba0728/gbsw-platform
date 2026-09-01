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

/**
 * 상담·가정통신용 인쇄 화면. 앱 셸이 종이에 같이 찍히면 못 쓰므로 `print:`로 뺀다.
 * 별도 레이아웃을 두지 않는 것은 (app) 레이아웃의 세션 가드를 잃지 않기 위해서다.
 */
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
    // 현재 학년도가 없으면 두 조회가 모두 던진다 — 학생이 있는지조차 모른다.
    noCurrentYear = true;
  }

  if (!view || !header) {
    // 404는 없는 학생에게만 준다 — 학년도가 없는 것은 다른 상태이고 안내를 띄운다.
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

      {/* 종이에서는 카드 테두리·여백을 푼다 — 인쇄기가 자기 여백을 이미 준다. */}
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
          {/* 서식의 「이름」 항목이라 맨이름이다 — 이 줄은 사람을 부르는 자리가
              아니라 기재란이다. 발급자(아래 footer)는 부르는 자리라 호칭을 붙인다. */}
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
          {/* 화면의 꼬리표는 종이에 안 찍힌다 — 명단에서 빠진 사실은 본문에 적는다.
              날짜가 아니라 학적을 적는 이유: 학적에 「언제 바뀌었나」가 없다. */}
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

        {/* 합계 4칸. 뷰포트가 아니라 놓인 자리의 폭을 본다 — MeritTotalsCards와 같은 기준이다.
            종이(A4 ≈ 794px)는 언제나 448px를 넘으므로 4칸 그대로 찍힌다. */}
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

        {/* 종이에는 툴팁이 없다 — 두 날짜가 갈린 줄은 각주로 적는다. */}
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

/** 학년도가 없어 확인서를 못 그리는 경우에도 돌아갈 길은 남는다. */
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
  /** 대조해서 읽는 값(학생코드·날짜)에 준다. */
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-[68px] shrink-0 text-mut">{label}</dt>
      <dd className={`font-medium text-ink${mono ? " font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

/** 발생일이다. 입력일이 다른 줄에는 * 표시가 붙고 아래 각주가 설명한다. */
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

/**
 * 확인서의 셀 여백. 카드가 이미 `p-8`을 갖고 있어 표의 바깥 여백은 끈다 —
 * 그대로 두면 표의 첫 글자만 20px 더 들어가 위 문단과 왼쪽 끝이 어긋난다.
 */
function printCell(index: number): string {
  return `${tableCellPadding(index, PRINT_HEADERS.length, false)} py-2.5`;
}
