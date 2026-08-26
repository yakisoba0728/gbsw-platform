import type { BadgeTone } from "@/components/ui/badge";
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
