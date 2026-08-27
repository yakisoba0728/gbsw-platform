import type { BadgeTone } from "@/components/ui/badge";
import {
  formatDateTimeShort,
  formatMonthDayTime,
  formatTimeShort,
} from "@/lib/datetime";
import type { PassStatus } from "@/core/authz/pass-type";
import type { Role } from "@/core/authz/roles";
import type { Verdict } from "./verify.service";

/** 화면 전용 표기. 저장값은 영문 그대로 두고 색과 문구만 여기서 정한다. */

export const PASS_STATUS_TONES: Record<PassStatus, BadgeTone> = {
  REQUESTED: "pending",
  CONSENTED: "info",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

/**
 * 정문에서 팔 뻗은 거리로 읽는 한 마디. **판정의 주어는 학생이다** —
 * 「이 출입증이 유효한가」가 아니라 「이 학생이 지금 나가도 되는가」다.
 */
export const VERDICT_LABELS: Record<Verdict, string> = {
  VALID: "나가도 됨",
  NOT_YET: "아직 시작 전",
  EXPIRED: "기간 지남",
  NOT_APPROVED: "승인 전",
  NO_PASS: "출입증 없음",
  UNKNOWN: "알 수 없는 코드",
};

/** 배지 아래 한 줄. **무엇을 하면 되는지**를 적는다. */
export const VERDICT_HINTS: Record<Verdict, string> = {
  VALID: "내보내도 됩니다.",
  NOT_YET: "시작 시각 전입니다.",
  EXPIRED: "유효 기간이 끝났습니다.",
  NOT_APPROVED: "아직 선생님이 승인하지 않았습니다.",
  NO_PASS: "신청된 외출·외박이 없습니다.",
  UNKNOWN: "우리 학생증 코드가 아닙니다.",
};

export const VERDICT_TONES: Record<Verdict, BadgeTone> = {
  VALID: "approved",
  NOT_YET: "pending",
  EXPIRED: "cancelled",
  NOT_APPROVED: "pending",
  NO_PASS: "rejected",
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

/**
 * 신청자의 역할. **Pass 행에 역할 열이 없다** — 신청은 학생 본인이 내거나(신청 흐름)
 * 교사가 바로 부여한 것(직접 부여) 둘 중 하나뿐이라, 신청자 id가 그 학생의 계정과
 * 같은지로 가른다. 화면마다 유도하면 규칙이 갈리므로 여기 한 곳에 둔다.
 */
export function requesterRole(pass: {
  requestedByUserId: string | null;
  studentProfile: { user: { id: string } };
}): Role | null {
  // 계정이 지워지면 id가 null이 된다. 그때는 누구였는지 알 길이 없으므로
  // 「님」으로 떨어뜨린다 — 교사였을 수도 있는 사람에게 억지로 역할을 씌우지 않는다.
  if (!pass.requestedByUserId) return null;
  return pass.requestedByUserId === pass.studentProfile.user.id ? "STUDENT" : "ADMIN";
}

/**
 * 보호자 확인을 한 사람의 역할. 「대행」 표시가 곧 교사가 대신 눌렀다는 뜻이라
 * 그 값 하나로 갈린다.
 */
export function consenterRole(pass: { consentByProxy: boolean }): Role {
  return pass.consentByProxy ? "ADMIN" : "PARENT";
}
