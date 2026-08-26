import type { BadgeTone } from "@/components/ui/badge";
import {
  formatDateTimeShort,
  formatMonthDayTime,
  formatTimeShort,
} from "@/lib/datetime";
import type { PassStatus } from "@/core/authz/pass-type";
import type { Verdict } from "./verify.service";

/** 화면 전용 표기. 저장값은 영문 그대로 두고 색과 문구만 여기서 정한다. */

export const PASS_STATUS_TONES: Record<PassStatus, BadgeTone> = {
  REQUESTED: "pending",
  CONSENTED: "info",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

/** 정문에서 팔 뻗은 거리로 읽는 한 마디. */
export const VERDICT_LABELS: Record<Verdict, string> = {
  VALID: "유효",
  NOT_YET: "아직 시작 전",
  EXPIRED: "기간 지남",
  NOT_APPROVED: "승인 전",
  REJECTED: "반려됨",
  CANCELLED: "취소됨",
  STALE: "코드가 지났음",
  UNKNOWN: "알 수 없는 코드",
};

/** 배지 아래 한 줄. **무엇을 하면 되는지**를 적는다. */
export const VERDICT_HINTS: Record<Verdict, string> = {
  VALID: "내보내도 됩니다.",
  NOT_YET: "시작 시각 전입니다.",
  EXPIRED: "유효 기간이 끝났습니다.",
  NOT_APPROVED: "아직 선생님이 승인하지 않았습니다.",
  REJECTED: "반려된 신청입니다.",
  CANCELLED: "취소된 출입증입니다.",
  STALE: "학생 화면을 새로 고쳐 다시 보여 달라고 하세요.",
  UNKNOWN: "우리 출입증 코드가 아닙니다.",
};

export const VERDICT_TONES: Record<Verdict, BadgeTone> = {
  VALID: "approved",
  NOT_YET: "pending",
  EXPIRED: "cancelled",
  NOT_APPROVED: "pending",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  STALE: "pending",
  UNKNOWN: "rejected",
};

/**
 * 유효 창 한 줄. 시작은 두 유형 모두 날짜와 시각을 적고, **종료에 날짜를 다시
 * 적는 것은 외박뿐이다.**
 *
 * 외출을 「26. 8. 26. 오후 2:00 ~ 오후 6:00」으로 줄이는 근거는 둘이다 —
 * 외출은 스키마가 날짜를 하나만 받아 양끝이 같은 날임이 보장되므로 종료 날짜가
 * 담는 정보가 없고, 되풀이가 사라지면 **날짜가 두 번 보이는 것 자체가 「날을
 * 넘긴다」는 신호**가 된다.
 *
 * **`(app)` 밖의 판독 화면도 이 규칙을 쓴다** — 화면마다 손으로 그리면 한 곳이
 * 어긋난 채 굳는다(실제로 그랬다).
 */
export function passPeriod(pass: { type: string; startAt: Date; endAt: Date }): string {
  const end =
    pass.type === "OVERNIGHT"
      ? formatDateTimeShort(pass.endAt)
      : formatTimeShort(pass.endAt);
  return `${formatDateTimeShort(pass.startAt)} ~ ${end}`;
}

/**
 * 「언제까지인가」 한 조각. `passPeriod`와 같은 눈금이되 더 좁다 — 지금 나가 있는
 * 학생 옆에 오른쪽 정렬로 서는 자리라, 외박도 연도는 빼고 날짜와 시각만 적는다.
 */
export function passEndLabel(pass: { type: string; endAt: Date }): string {
  return pass.type === "OVERNIGHT"
    ? formatMonthDayTime(pass.endAt)
    : formatTimeShort(pass.endAt);
}
