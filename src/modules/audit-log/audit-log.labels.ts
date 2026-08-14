import type { BadgeTone } from "@/components/ui/badge";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";

/**
 * 감사로그 화면 전용 라벨 모음. 저장값(recordAudit에 넘긴 action 문자열)은
 * 영문 그대로 두고, 표기만 여기서 한글로 바꾼다 — ROLE_LABELS·
 * ENROLLMENT_STATUS_LABELS와 같은 방식이다.
 *
 * 여기 없는 값이 와도 화면이 비면 안 된다 — 새 모듈(상벌점 등)이 액션을
 * 추가했는데 이 파일이 아직 못 따라간 경우이므로, 라벨 대신 원본 문자열을
 * 그대로 보여준다.
 */

/**
 * 실제로 recordAudit에 쓰이는 액션 문자열 13종 + invite:create:parent·
 * account:change-password(코드에는 있지만 이 목록에선 15번째로 함께 관리).
 *
 * `invite:create:parent`는 지금 코드의 recordAudit 호출부(invite.service.ts)는
 * 전부 "invite:create"만 남긴다 — 하지만 과거 데이터에 이 값으로 기록된 행이
 * 남아 있어(스키마를 바꾸지 않으므로 지울 수 없다) 라벨은 계속 필요하다.
 */
export const AUDIT_ACTIONS = [
  "account:bootstrap",
  "account:change-password",
  "registration:complete",
  "invite:create",
  "invite:create:parent",
  "invite:revoke",
  // 2차 요소를 MAX_INVITE_ATTEMPTS번 틀려 코드가 자동 폐기됐을 때 (I9). 관리자·
  // 학생이 직접 폐기하는 invite:revoke와 구분한다 — 행위자가 없다(actorUserId
  // null, actorName은 "(가입 시도자)").
  "invite:auto-revoke",
  "user:update",
  "user:activate",
  "user:deactivate",
  "user:reset-password",
  "user:delete",
  "academic-year:create",
  "academic-year:set-current",
  "enrollment:update",
  "enrollment:import",
  // can() 검사를 통과 못 해 서비스가 거부했을 때 (I5, core/authz/errors.ts의
  // assertCan). 정상 사용자가 페이지 가드에 막혀 여기 닿는 일은 없다 — 서버
  // 액션을 직접 호출하는 등 페이지를 건너뛴 시도만 남는다.
  "authz:denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

const ACTION_LABELS: Record<AuditAction, string> = {
  "account:bootstrap": "최초 관리자 생성",
  "account:change-password": "비밀번호 변경",
  "registration:complete": "가입 완료",
  "invite:create": "초대코드 발급",
  "invite:create:parent": "학부모 코드 발급",
  "invite:revoke": "초대코드 폐기",
  "invite:auto-revoke": "초대코드 자동 폐기",
  "user:update": "사용자 정보 수정",
  "user:activate": "계정 활성화",
  "user:deactivate": "계정 비활성화",
  "user:reset-password": "비밀번호 초기화",
  "user:delete": "계정 삭제",
  "academic-year:create": "학년도 추가",
  "academic-year:set-current": "현재 학년도 변경",
  "enrollment:update": "소속·학적 수정",
  "enrollment:import": "명단 일괄 반영",
  "authz:denied": "권한 거부",
};

const ACTION_TONES: Record<AuditAction, BadgeTone> = {
  "account:bootstrap": "approved",
  "account:change-password": "neutral",
  "registration:complete": "approved",
  "invite:create": "approved",
  "invite:create:parent": "approved",
  "invite:revoke": "cancelled",
  "invite:auto-revoke": "cancelled",
  "user:update": "info",
  "user:activate": "approved",
  "user:deactivate": "cancelled",
  "user:reset-password": "pending",
  "user:delete": "rejected",
  "academic-year:create": "approved",
  "academic-year:set-current": "info",
  "enrollment:update": "info",
  "enrollment:import": "info",
  "authz:denied": "rejected",
};

/** 모르는 값이면 원본 문자열을 그대로 돌려준다. */
export function auditActionLabel(action: string): string {
  return isAuditAction(action) ? ACTION_LABELS[action] : action;
}

/** 모르는 값이면 중립 톤으로 떨어진다. */
export function auditActionTone(action: string): BadgeTone {
  return isAuditAction(action) ? ACTION_TONES[action] : "neutral";
}

const TARGET_LABELS: Record<string, string> = {
  User: "사용자",
  Invite: "초대코드",
  StudentProfile: "학생",
  AcademicYear: "학년도",
};

export function auditTargetLabel(targetType: string): string {
  return TARGET_LABELS[targetType] ?? targetType;
}

// ── metadata → 문장 ────────────────────────────────────────────

/** user:update·enrollment:update의 changed 배열에 쓰이는 필드 이름. */
const FIELD_LABELS: Record<string, string> = {
  name: "이름",
  email: "이메일",
  phone: "전화번호",
  birthDate: "생년월일",
  grade: "학년",
  classNo: "반",
  number: "번호",
  status: "학적",
};

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** changed: ["grade","status"] → "학년 · 학적 바뀜" */
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
  // batch는 내부 식별자라 화면에 띄우지 않는다 — 같은 반영 묶음이라는 사실은
  // 화면에서는 의미가 없다.
  const parts = [yearLabel(metadata), changedSummary(metadata.changed)].filter(
    (p): p is string => p !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** academic-year:set-current의 from. 최초 지정이면 from이 null이라 표시할 게 없다. */
function setCurrentYearSummary(metadata: Record<string, unknown>): string | null {
  return typeof metadata.from === "number" ? `${metadata.from}학년도에서 변경` : null;
}

/** invite:create·invite:create:parent·registration:complete가 공유하는 role 표시. */
function roleSummary(metadata: Record<string, unknown>): string | null {
  const role = metadata.role;
  if (typeof role !== "string") return null;
  return isRole(role) ? ROLE_LABELS[role] : role;
}

/** enrollment:import 건수 필드 — 0인 항목은 뺀다. 값이 있는 것만 보여야 읽힌다. */
const IMPORT_COUNT_LABELS: ReadonlyArray<readonly [key: string, label: string]> = [
  ["newStudents", "신규"],
  ["newAssignment", "신규배정"],
  ["reassign", "재배정"],
  ["statusChange", "학적변동"],
  ["invitesIssued", "초대발급"],
  ["deleted", "삭제"],
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

/** authz:denied — 어떤 권한 액션을 시도하다 막혔는지 보여준다 (I5). */
function authzDeniedSummary(metadata: Record<string, unknown>): string | null {
  const action = metadata.action;
  return typeof action === "string" ? `시도: ${action}` : null;
}

const METADATA_FORMATTERS: Partial<
  Record<AuditAction, (metadata: Record<string, unknown>) => string | null>
> = {
  "user:update": (m) => changedSummary(m.changed),
  "enrollment:update": enrollmentUpdateSummary,
  "enrollment:import": importSummary,
  "academic-year:set-current": setCurrentYearSummary,
  "invite:create": roleSummary,
  "invite:create:parent": roleSummary,
  "registration:complete": roleSummary,
  "authz:denied": authzDeniedSummary,
};

/**
 * metadata를 사람이 읽는 한 문장으로 바꾼다.
 *
 * null/빈 객체면 null(→ 화면에서 "—"). 아는 액션은 전용 포맷을, 모르는
 * 액션(미래 모듈이 추가한 것)은 key value 나열로 떨어진다 — 화면이 깨지지만
 * 않으면 되고, 그 값이 무슨 뜻인지는 이 파일이 알 수 없기 때문이다.
 */
export function formatAuditMetadata(action: string, metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;

  const formatter = isAuditAction(action) ? METADATA_FORMATTERS[action] : undefined;
  if (formatter) return formatter(metadata);

  const pairs = Object.entries(metadata);
  if (pairs.length === 0) return null;
  return pairs.map(([key, value]) => `${key} ${String(value)}`).join(" · ");
}
