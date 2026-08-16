import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/core/auth/session";
import {
  isMeritTrack,
  isYearScoped,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
  signedNet,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import { ChevronLeftIcon } from "@/components/icons";
import { signedPoints } from "@/components/merit/kind-badge";
import { NoAcademicYearNotice } from "@/components/ui/no-academic-year-notice";
import { formatDate, formatDateTime, isSameKstDate } from "@/lib/datetime";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import { getStudentHeader, getStudentMerit } from "@/modules/merit/award.service";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "상벌점 확인서" };

/**
 * 상담·가정통신용 인쇄 화면.
 *
 * 앱 셸(사이드바·탭)이 종이에 같이 찍히면 못 쓰므로 `print:` 유틸리티로
 * 화면 요소를 인쇄에서 뺀다. 별도 레이아웃을 만들지 않는 이유: (app) 레이아웃이
 * 세션 가드와 강제 비밀번호 변경 가로채기를 들고 있어서, 벗어나면 그 보호를
 * 다시 구현해야 한다.
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
    /*
     * **404는 없는 학생에게만 준다.** 학년도가 아직 없는 것은 전혀 다른 상태이고,
     * 다른 상벌점 화면은 모두 안내를 띄운다. 여기만 404를 내면 학년도를 만들지
     * 않은 관리자가 "확인서 링크가 깨졌다"고 읽고 원인을 엉뚱한 데서 찾는다.
     */
    if (!noCurrentYear) notFound();

    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <BackLink studentId={studentId} track={track} />
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
        <BackLink studentId={studentId} track={track} />
        <PrintButton />
      </div>

      <article className="rounded-card border border-line bg-surface p-8 print:rounded-none print:border-0 print:p-0">
        <header className="border-b border-line pb-4">
          <p className="text-[12px] font-semibold text-mut">
            경북소프트웨어마이스터고등학교
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            {MERIT_TRACK_LABELS[track]} 상벌점 확인서
          </h1>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-line py-4 text-sm">
          <Row label="이름" value={header.name} />
          <Row label="학생코드" value={header.studentCode} />
          <Row
            label="학급"
            value={
              header.grade !== null && header.classNo !== null
                ? `${header.grade}학년 ${header.classNo}반${header.number !== null ? ` ${header.number}번` : ""}`
                : "소속 미배정"
            }
          />
          <Row label="집계 범위" value={scope} />
          {/*
            명단에서 빠진 학생이면 그 사실을 확인서 본문에 적는다. 화면 배지는
            종이에 안 찍히는데, 이 확인서가 존재하는 이유가 바로 "이미 명단에 없는
            학생의 기록을 선도관리위원회에 낸다"는 쓰임이다 — 받아 든 사람이
            "소속 미배정"만 보고 반 배정을 안 한 재학생으로 읽으면 안 된다.
          */}
          {header.removedAt && (
            <Row label="명단 제외일" value={formatDate(header.removedAt)} />
          )}
        </dl>

        {/*
          합계 4칸. **뷰포트가 아니라 자기가 놓인 자리의 폭을 본다** —
          MeritTotalsCards와 같은 이유이고 같은 기준(@md=448px)이다.

          `grid-cols-4`로 고정하면 375px에서 칸 하나의 내용 폭이 32px까지
          내려가는데(article의 p-8 32px×2까지 빼고 나면), 거기에 `+120` 같은
          순점수가 20px 굵은 글씨로 49px를 차지해 칸 테두리를 뚫고 나온다
          (Tailwind의 grid 트랙은 minmax(0,1fr)이라 잘리지도 않는다).
          종이(A4 ≈ 794px)에서는 언제나 448px를 넘으므로 4칸 그대로 찍힌다.
        */}
        <div className="@container">
          <div className="grid grid-cols-2 gap-3 py-4 @md:grid-cols-4">
            <Total label="상점" value={view.totals.merit} />
            <Total label="벌점" value={view.totals.demerit} />
            <Total label="상쇄점" value={view.totals.offset} />
            <Total label="순점수" value={view.totals.net} signed strong />
          </div>
        </div>
        <p className="pb-4 text-[11.5px] text-mut">
          순점수 = 상점 + 상쇄점 − 벌점. 취소된 기록은 합계에서 빠집니다.
        </p>

        {active.length === 0 ? (
          <p className="border-t border-line py-8 text-center text-[13px] text-mut">
            해당 범위에 부여된 상벌점이 없습니다.
          </p>
        ) : (
          <table className="w-full border-t border-line text-left text-[13px]">
            <thead>
              <tr className="border-b border-line2 text-[11.5px] text-mut">
                {/* 발생일이다. 입력일이 다른 줄에는 * 표시가 붙고 아래 각주가 설명한다. */}
                <th className="py-2 font-semibold">발생일</th>
                <th className="py-2 font-semibold">구분</th>
                <th className="py-2 font-semibold">항목</th>
                <th className="py-2 text-right font-semibold">점수</th>
                <th className="py-2 text-right font-semibold">부여</th>
              </tr>
            </thead>
            <tbody>
              {active.map((award) => (
                <tr key={award.id} className="border-b border-line2 last:border-0">
                  <td className="py-2 whitespace-nowrap text-mut">
                    {formatDate(award.occurredOn)}
                    {!isSameKstDate(award.occurredOn, award.createdAt) && (
                      <span title={`입력 ${formatDate(award.createdAt)}`}>*</span>
                    )}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {MERIT_KIND_LABELS[award.kind as MeritKind] ?? award.kind}
                  </td>
                  <td className="py-2 text-ink">
                    {award.label}
                    {award.note && (
                      <span className="block text-[11.5px] text-mut">{award.note}</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-bold">
                    {signedPoints(award.kind, award.points)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap text-mut">
                    {award.awardedByName}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/*
          종이에는 툴팁이 없다. 발생일과 입력일이 갈리는 줄이 하나라도 있으면
          각주로 그 사실과 날짜를 적어 둔다 — 확인서를 받아 든 사람이 "왜 이 날짜냐"를
          물어볼 데가 없기 때문이다.
        */}
        {backdated.length > 0 && (
          <p className="mt-4 text-[11.5px] text-mut">
            * 표시한 항목은 일이 일어난 뒤에 입력된 기록입니다 (표의 날짜는 발생일).
            {backdated.map((award) => (
              <span key={award.id} className="ml-1">
                {formatDate(award.occurredOn)} → 입력 {formatDate(award.createdAt)}
                {";"}
              </span>
            ))}
          </p>
        )}

        <footer className="mt-6 border-t border-line pt-3 text-[11.5px] text-mut">
          출력 시각 {formatDateTime(new Date())} · 발급 {actor.name}
        </footer>
      </article>
    </div>
  );
}

/** 학년도가 없어 확인서를 못 그리는 경우에도 돌아갈 길은 남는다. */
function BackLink({ studentId, track }: { studentId: string; track: MeritTrack }) {
  return (
    <Link
      href={`/merit/students/${studentId}?track=${track}`}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-mut transition-colors hover:text-pri"
    >
      <ChevronLeftIcon size={15} />
      학생 상벌점
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[68px] shrink-0 text-mut">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Total({
  label,
  value,
  signed,
  strong,
}: {
  label: string;
  value: number;
  signed?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="rounded-btn border border-line px-3 py-2 text-center">
      <div className="text-[11.5px] text-mut">{label}</div>
      <div className={strong ? "text-[20px] font-extrabold text-ink" : "text-[18px] font-bold text-ink"}>
        {signed ? signedNet(value) : value}
      </div>
    </div>
  );
}
