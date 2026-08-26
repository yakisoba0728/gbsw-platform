import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  isPassStatus,
  isPassType,
  PASS_STATUS_LABELS,
  PASS_TYPE_LABELS,
} from "@/core/authz/pass-type";
import {
  formatDateTimeShort,
  formatMonthDay,
  formatTimeShort,
} from "@/lib/datetime";
import { PASS_STATUS_TONES } from "@/modules/pass/pass.labels";
import type { PassWithStudent } from "@/modules/pass/pass.repo";

/** 세 역할 화면이 함께 쓰는 한 장. 손대는 버튼은 호출부가 children으로 넣는다. */
export function PassCard({
  pass,
  children,
}: {
  pass: PassWithStudent;
  children?: React.ReactNode;
}) {
  const type = isPassType(pass.type) ? PASS_TYPE_LABELS[pass.type] : pass.type;
  const status = isPassStatus(pass.status) ? pass.status : null;

  return (
    <li className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-ink">
            <Link
              href={`/pass/${pass.id}`}
              className="font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink"
            >
              {type}
            </Link>
            {status && (
              <Badge tone={PASS_STATUS_TONES[status]}>
                {PASS_STATUS_LABELS[status]}
              </Badge>
            )}
          </p>
          <p className="mt-1 text-caption text-mut tabular-nums">
            {passPeriod(pass)}
          </p>
          <p className="mt-0.5 text-caption text-mut">
            {pass.destination}
            <span className="mx-1.5 text-mut2" aria-hidden>
              ·
            </span>
            {pass.reason}
          </p>
          {pass.decisionNote && (
            <p className="mt-1 text-xs text-rose">반려 사유: {pass.decisionNote}</p>
          )}
          {pass.consentByProxy && pass.consentedByName && (
            <p className="mt-1 text-xs text-mut">
              보호자 확인 대행 · {pass.consentedByName}
            </p>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

/**
 * 외출은 시각까지, 외박은 날짜만 적는다. 외박의 endAt은 종료일 **다음 날** 자정
 * 이므로 화면에는 하루를 빼서 적어야 한다 — 안 그러면 8/29까지 신청한 학생이
 * 8/30까지로 읽는다.
 */
export function passPeriod(pass: { type: string; startAt: Date; endAt: Date }): string {
  if (pass.type === "OVERNIGHT") {
    return `${formatMonthDay(pass.startAt)} ~ ${formatMonthDay(lastDayOf(pass))}`;
  }
  return `${formatDateTimeShort(pass.startAt)} ~ ${formatDateTimeShort(pass.endAt)}`;
}

/**
 * 화면에 적을 마지막 순간. 외박의 `endAt`은 종료일 **다음 날** 자정이라
 * 그대로 그리면 「오전 12:00」이 되고 날짜도 하루 밀린다.
 */
function lastDayOf(pass: { endAt: Date }): Date {
  return new Date(pass.endAt.getTime() - 1);
}

/**
 * 「언제까지인가」 한 조각. 외출은 시각이 알맹이라 시각을, 외박은 그날 밤을
 * 통째로 쓰므로 날짜를 적는다 — `passPeriod`와 같은 눈금을 쓴다.
 */
export function passEndLabel(pass: { type: string; endAt: Date }): string {
  return pass.type === "OVERNIGHT"
    ? formatMonthDay(lastDayOf(pass))
    : formatTimeShort(pass.endAt);
}
