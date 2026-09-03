import type { BadgeTone } from "@/components/ui/badge";
import { isPassStatus, PASS_STATUS_LABELS, type PassStatus } from "@/core/authz/pass-type";
import {
  formatDateTimeShort,
  formatMonthDayTime,
  formatTimeShort,
} from "@/lib/datetime";
import type { Role } from "@/core/authz/roles";
import { requiresConsent } from "./pass.policy";
import type { Verdict } from "./verify.service";

export const PASS_STATUS_TONES: Record<PassStatus, BadgeTone> = {
  REQUESTED: "pending",
  CONSENTED: "info",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

export function passStatusLabel(pass: { type: string; status: string }): string {
  if (pass.status === "REQUESTED") {
    return requiresConsent(pass.type) ? "보호자 확인 대기" : "교사 승인 대기";
  }
  if (pass.status === "CONSENTED") return "교사 승인 대기";
  return isPassStatus(pass.status) ? PASS_STATUS_LABELS[pass.status] : pass.status;
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  VALID: "나가도 됨",
  NOT_YET: "아직 시작 전",
  EXPIRED: "기간 지남",
  NOT_APPROVED: "승인 전",
  NO_PASS: "출입증 없음",
  STALE: "코드가 지났음",
  UNKNOWN: "알 수 없는 코드",
};

export const VERDICT_HINTS: Record<Verdict, string> = {
  VALID: "내보내도 됩니다.",
  NOT_YET: "시작 시각 전입니다.",
  EXPIRED: "유효 기간이 끝났습니다.",
  NOT_APPROVED: "아직 선생님이 승인하지 않았습니다.",
  NO_PASS: "신청된 외출·외박이 없습니다.",
  STALE: "학생 화면을 새로 고쳐 다시 보여 달라고 하세요.",
  UNKNOWN: "우리 학생증 코드가 아닙니다.",
};

export const VERDICT_TONES: Record<Verdict, BadgeTone> = {
  VALID: "approved",
  NOT_YET: "pending",
  EXPIRED: "cancelled",
  NOT_APPROVED: "pending",
  NO_PASS: "rejected",
  STALE: "pending",
  UNKNOWN: "rejected",
};

export function passPeriod(pass: { type: string; startAt: Date; endAt: Date }): string {
  const end =
    pass.type === "OVERNIGHT"
      ? formatDateTimeShort(pass.endAt)
      : formatTimeShort(pass.endAt);
  return `${formatDateTimeShort(pass.startAt)} ~ ${end}`;
}

export function passEndLabel(pass: { type: string; endAt: Date }): string {
  return pass.type === "OVERNIGHT"
    ? formatMonthDayTime(pass.endAt)
    : formatTimeShort(pass.endAt);
}

export function requesterRole(pass: {
  requestedByUserId: string | null;
  studentProfile: { user: { id: string } };
}): Role | null {
  if (!pass.requestedByUserId) return null;
  return pass.requestedByUserId === pass.studentProfile.user.id ? "STUDENT" : "ADMIN";
}

export function consenterRole(pass: { consentByProxy: boolean }): Role {
  return pass.consentByProxy ? "ADMIN" : "PARENT";
}
