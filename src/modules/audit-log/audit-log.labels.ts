import type { BadgeTone } from "@/components/ui/badge";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
} from "@/core/authz/merit-track";
import { isPassType, PASS_TYPE_LABELS } from "@/core/authz/pass-type";
import { honorificName, isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatDate, formatMonthDay } from "@/lib/datetime";

export const AUDIT_ACTIONS = [
  "auth:login",
  "auth:login-failed",
  "auth:logout",
  "account:bootstrap",
  "account:change-password",
  "registration:complete",
  "invite:create",
  "invite:create:parent",
  "invite:revoke",
  "invite:auto-revoke",
  "invite:revoke:roster",
  "user:update",
  "user:activate",
  "user:deactivate",
  "user:reset-password",
  "user:delete",
  "user:soft-delete",
  "academic-year:create",
  "academic-year:set-current",
  "enrollment:update",
  "enrollment:import",
  "roster:preview",
  "roster:export",
  "merit:rule:create",
  "merit:rule:update",
  "merit:rule:deactivate",
  "merit:rule:delete",
  "merit:threshold:update",
  "merit:award",
  "merit:cancel",
  "pass:request",
  "pass:consent",
  "pass:approve",
  "pass:reject",
  "pass:issue",
  "pass:cancel",
  "community:create",
  "community:update",
  "community:delete",
  "community:post:create",
  "community:post:update",
  "community:post:delete",
  "community:comment:create",
  "community:comment:delete",
  "community:attachment:create",
  "community:attachment:delete",
  "authz:denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

const ACTION_LABELS: Record<AuditAction, string> = {
  "auth:login": "로그인",
  "auth:login-failed": "로그인 실패",
  "auth:logout": "로그아웃",
  "account:bootstrap": "최초 교사 계정 생성",
  "account:change-password": "비밀번호 변경",
  "registration:complete": "가입 완료",
  "invite:create": "초대코드 발급",
  "invite:create:parent": "학부모 코드 발급",
  "invite:revoke": "초대코드 폐기",
  "invite:auto-revoke": "초대코드 자동 폐기",
  "invite:revoke:roster": "초대코드 폐기 (명단 제외)",
  "user:update": "계정 정보 수정",
  "user:activate": "계정 활성화",
  "user:deactivate": "계정 비활성화",
  "user:reset-password": "비밀번호 초기화",
  "user:delete": "계정 완전 삭제",
  "user:soft-delete": "명단 제외",
  "academic-year:create": "학년도 추가",
  "academic-year:set-current": "현재 학년도 변경",
  "enrollment:update": "소속·학적 수정",
  "enrollment:import": "명단 반영",
  "roster:preview": "명단 미리보기",
  "roster:export": "명단 내보내기",
  "merit:rule:create": "상벌점 규정 추가",
  "merit:rule:update": "상벌점 규정 수정",
  "merit:rule:deactivate": "상벌점 규정 삭제",
  "merit:rule:delete": "상벌점 규정 삭제",
  "merit:threshold:update": "벌점 기준 변경",
  "merit:award": "상벌점 부여",
  "merit:cancel": "상벌점 취소",
  "pass:request": "출입증 신청",
  "pass:consent": "보호자 확인",
  "pass:approve": "출입증 승인",
  "pass:reject": "출입증 반려",
  "pass:issue": "출입증 부여",
  "pass:cancel": "출입증 취소",
  "community:create": "게시판 생성",
  "community:update": "게시판 수정",
  "community:delete": "게시판 제거",
  "community:post:create": "글 작성",
  "community:post:update": "글 수정",
  "community:post:delete": "글 삭제",
  "community:comment:create": "댓글 작성",
  "community:comment:delete": "댓글 삭제",
  "community:attachment:create": "첨부 등록",
  "community:attachment:delete": "첨부 삭제",
  "authz:denied": "권한 거부",
};

const ACTION_TONES: Record<AuditAction, BadgeTone> = {
  "auth:login": "neutral",
  "auth:login-failed": "cancelled",
  "auth:logout": "neutral",
  "account:bootstrap": "approved",
  "account:change-password": "neutral",
  "registration:complete": "approved",
  "invite:create": "approved",
  "invite:create:parent": "approved",
  "invite:revoke": "cancelled",
  "invite:auto-revoke": "cancelled",
  "invite:revoke:roster": "cancelled",
  "user:update": "info",
  "user:activate": "approved",
  "user:deactivate": "cancelled",
  "user:reset-password": "pending",
  "user:delete": "rejected",
  "user:soft-delete": "cancelled",
  "academic-year:create": "approved",
  "academic-year:set-current": "info",
  "enrollment:update": "info",
  "enrollment:import": "info",
  "roster:preview": "info",
  "roster:export": "info",
  "merit:rule:create": "approved",
  "merit:rule:update": "info",
  "merit:rule:deactivate": "rejected",
  "merit:rule:delete": "rejected",
  "merit:threshold:update": "info",
  "merit:award": "info",
  "merit:cancel": "cancelled",
  "pass:request": "pending",
  "pass:consent": "info",
  "pass:approve": "approved",
  "pass:reject": "rejected",
  "pass:issue": "approved",
  "pass:cancel": "cancelled",
  "community:create": "approved",
  "community:update": "info",
  "community:delete": "rejected",
  "community:post:create": "approved",
  "community:post:update": "info",
  "community:post:delete": "cancelled",
  "community:comment:create": "approved",
  "community:comment:delete": "cancelled",
  "community:attachment:create": "info",
  "community:attachment:delete": "cancelled",
  "authz:denied": "rejected",
};

export function auditActionLabel(action: string): string {
  return isAuditAction(action) ? ACTION_LABELS[action] : action;
}

export function auditActionTone(action: string): BadgeTone {
  return isAuditAction(action) ? ACTION_TONES[action] : "neutral";
}

const TARGET_LABELS: Record<string, string> = {
  User: "계정",
  Invite: "초대코드",
  StudentProfile: "학생",
  AcademicYear: "학년도",
  MeritRule: "상벌점 규정",
  MeritThreshold: "벌점 기준",
  MeritAward: "상벌점",
  Pass: "출입증",
  Community: "게시판",
  CommunityPost: "글",
  CommunityComment: "댓글",
  CommunityAttachment: "첨부",
};

export function auditTargetLabel(targetType: string): string {
  return TARGET_LABELS[targetType] ?? targetType;
}

const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  birthDate: "생년월일",
  grade: "학년",
  classNo: "반",
  number: "번호",
  status: "학적",
  label: "항목명",
  points: "점수",
  category: "분류",
  description: "설명",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function changedSummary(changed: unknown): string | null {
  if (!Array.isArray(changed) || changed.length === 0) return null;
  const labels = changed
    .filter((v): v is string => typeof v === "string")
    .map(fieldLabel);
  if (labels.length === 0) return null;
  return `${labels.join(" · ")} 바뀜`;
}

function yearLabel(metadata: Record<string, unknown>): string | null {
  return typeof metadata.year === "number" ? `${metadata.year}학년도` : null;
}

function enrollmentUpdateSummary(metadata: Record<string, unknown>): string | null {
  const parts = [yearLabel(metadata), changedSummary(metadata.changed)].filter(
    (p): p is string => p !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function setCurrentYearSummary(metadata: Record<string, unknown>): string | null {
  return typeof metadata.from === "number" ? `${metadata.from}학년도에서 변경` : null;
}

function roleSummary(metadata: Record<string, unknown>): string | null {
  const role = metadata.role;
  if (typeof role !== "string") return null;
  return isRole(role) ? ROLE_LABELS[role] : role;
}

const IMPORT_COUNT_LABELS: ReadonlyArray<readonly [key: string, label: string]> = [
  ["newStudents", "신규"],
  ["newAssignment", "신규배정"],
  ["reassign", "재배정"],
  ["statusChange", "학적변동"],
  ["invitesIssued", "초대발급"],
  ["excludedNew", "신규제외"],
  ["deleted", "삭제"],
  ["softDeleted", "제외"],
  ["restored", "복구"],
];

function importSummary(metadata: Record<string, unknown>): string | null {
  const parts = [yearLabel(metadata)];
  for (const [key, label] of IMPORT_COUNT_LABELS) {
    const value = metadata[key];
    if (typeof value === "number" && value !== 0) parts.push(`${label} ${value}`);
  }
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

function exportSummary(metadata: Record<string, unknown>): string | null {
  const parts = [yearLabel(metadata)];
  if (typeof metadata.count === "number") parts.push(`${metadata.count}명`);
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

function rosterPreviewSummary(metadata: Record<string, unknown>): string | null {
  const parts = [yearLabel(metadata)];
  if (typeof metadata.fileRows === "number") {
    parts.push(`파일 ${metadata.fileRows}명`);
  }
  if (typeof metadata.existing === "number") {
    parts.push(`기존 ${metadata.existing}명`);
  }
  if (typeof metadata.missingFromFile === "number") {
    parts.push(`누락 ${metadata.missingFromFile}명`);
  }
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

function inviteRosterSummary(metadata: Record<string, unknown>): string | null {
  const parts = [roleSummary(metadata)];
  if (metadata.status === "USED") parts.push("소진된 코드");
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

function authzDeniedSummary(metadata: Record<string, unknown>): string | null {
  const action = metadata.action;
  return typeof action === "string" ? `시도: ${auditActionLabel(action)}` : null;
}

function meritSubject(metadata: Record<string, unknown>): string[] {
  const parts: string[] = [];

  if (typeof metadata.studentName === "string") {
    parts.push(honorificName(metadata.studentName, "STUDENT"));
  }

  const track = metadata.track;
  if (isMeritTrack(track)) parts.push(MERIT_TRACK_LABELS[track]);

  const kind = metadata.kind;
  const points = metadata.points;
  if (isMeritKind(kind) && typeof points === "number") {
    parts.push(`${MERIT_KIND_LABELS[kind]} ${points}점`);
  }

  if (typeof metadata.label === "string") parts.push(metadata.label);

  return parts;
}

function meritSubjectSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  const reason = reasonPart(metadata);
  if (reason) parts.push(reason);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function meritAwardSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  if (typeof metadata.occurredOn === "string") {
    const occurredOn = new Date(metadata.occurredOn);
    if (!Number.isNaN(occurredOn.getTime())) {
      parts.push(`발생 ${formatDate(occurredOn)}`);
    }
  }

  if (typeof metadata.batchId === "string") parts.push("일괄");
  return parts.length > 0 ? parts.join(" · ") : null;
}

function reasonPart(metadata: Record<string, unknown>): string | null {
  const reason = metadata.reason;
  return typeof reason === "string" && reason.length > 0 ? `사유: ${reason}` : null;
}

function meritCancelSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  const reason = reasonPart(metadata);
  if (reason) parts.push(reason);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function reasonSummary(metadata: Record<string, unknown>): string | null {
  return reasonPart(metadata);
}

function userUpdateSummary(metadata: Record<string, unknown>): string | null {
  const parts = [changedSummary(metadata.changed), reasonPart(metadata)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

function meritRuleUpdateSummary(metadata: Record<string, unknown>): string | null {
  const summary = changedSummary(metadata.changed);

  const from = metadata.pointsFrom;
  const to = metadata.pointsTo;
  const pointsChanged =
    typeof from === "number" && typeof to === "number" && from !== to
      ? `점수 ${from}→${to}`
      : null;

  const parts = [summary, pointsChanged].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function meritThresholdSummary(metadata: Record<string, unknown>): string | null {
  const parts: string[] = [];

  const track = metadata.track;
  if (isMeritTrack(track)) parts.push(MERIT_TRACK_LABELS[track]);

  for (const [label, fromKey, toKey] of [
    ["경고", "warnFrom", "warnTo"],
    ["위험", "dangerFrom", "dangerTo"],
  ] as const) {
    const from = metadata[fromKey];
    const to = metadata[toKey];
    if (typeof to !== "number") continue;
    if (typeof from === "number" && from !== to) parts.push(`${label} ${from}→${to}`);
    else if (typeof from !== "number") parts.push(`${label} ${to}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function dateFrom(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function passSummary(metadata: Record<string, unknown>): string | null {
  const parts: string[] = [];

  const type = metadata.type;
  if (isPassType(type)) parts.push(PASS_TYPE_LABELS[type]);

  const from = dateFrom(metadata.startAt);
  const to = dateFrom(metadata.endAt);
  if (from && to) parts.push(`${formatMonthDay(from)} ~ ${formatMonthDay(to)}`);

  if (typeof metadata.destination === "string") parts.push(metadata.destination);
  if (metadata.byProxy === true) parts.push("보호자 확인 대행");
  if (metadata.byOwner === true) parts.push("본인 철회");

  const reason = reasonPart(metadata);
  if (reason) parts.push(reason);

  return parts.length > 0 ? parts.join(" · ") : null;
}

const METADATA_FORMATTERS: Partial<
  Record<AuditAction, (metadata: Record<string, unknown>) => string | null>
> = {
  "user:update": userUpdateSummary,
  "user:activate": reasonSummary,
  "user:deactivate": reasonSummary,
  "user:reset-password": reasonSummary,
  "enrollment:update": enrollmentUpdateSummary,
  "enrollment:import": importSummary,
  "roster:preview": rosterPreviewSummary,
  "roster:export": exportSummary,
  "academic-year:set-current": setCurrentYearSummary,
  "invite:create": roleSummary,
  "invite:create:parent": roleSummary,
  "invite:revoke": reasonSummary,
  "invite:revoke:roster": inviteRosterSummary,
  "registration:complete": roleSummary,
  "authz:denied": authzDeniedSummary,
  "merit:rule:delete": meritSubjectSummary,
  "merit:award": meritAwardSummary,
  "merit:cancel": meritCancelSummary,
  "merit:rule:update": meritRuleUpdateSummary,
  "merit:threshold:update": meritThresholdSummary,
  "pass:request": passSummary,
  "pass:consent": passSummary,
  "pass:approve": passSummary,
  "pass:reject": passSummary,
  "pass:issue": passSummary,
  "pass:cancel": passSummary,
  "community:delete": reasonSummary,
};

export function formatAuditMetadata(action: string, metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;

  const formatter = isAuditAction(action) ? METADATA_FORMATTERS[action] : undefined;
  if (formatter) return formatter(metadata);

  const pairs = Object.entries(metadata);
  if (pairs.length === 0) return null;
  return pairs.map(([key, value]) => `${key} ${String(value)}`).join(" · ");
}
