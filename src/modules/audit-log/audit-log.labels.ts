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

/**
 * 감사로그 화면 전용 라벨. 저장값은 영문 그대로 두고 표기만 한글로 바꾼다.
 * 모르는 값이 와도 화면이 비지 않게 원본 문자열로 떨어진다.
 */

/**
 * 화면이 아는 감사로그 액션. 지금 코드가 더는 남기지 않는 값도 들어 있다 —
 * 그 이름으로 저장된 옛 행이 있고, 감사로그는 고쳐 쓰지 않는다.
 */
export const AUDIT_ACTIONS = [
  // 세션이 생기고 사라지는 순간. 대상 이메일은 마스킹해서 남긴다.
  "auth:login",
  "auth:login-failed",
  "account:bootstrap",
  "account:change-password",
  "registration:complete",
  "invite:create",
  // 옛 행 전용. 지금은 invite:create 하나로 남긴다.
  "invite:create:parent",
  "invite:revoke",
  // 2차 요소를 반복해 틀려 코드가 스스로 폐기됐을 때. 행위자가 없다.
  "invite:auto-revoke",
  // 명단에서 빠진 학생의 미사용 코드가 함께 폐기됐을 때. 행위자가 있다.
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
  // 읽기지만 남긴다 — 전교생 개인정보가 파일로 한 번에 나가는 유일한 경로다.
  "roster:export",
  "merit:rule:create",
  "merit:rule:update",
  // 옛 행 전용. 지금은 merit:rule:delete로 남긴다.
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
  // 서비스가 can() 검사로 거부했을 때. 페이지를 건너뛴 요청만 여기 닿는다.
  "authz:denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}

const ACTION_LABELS: Record<AuditAction, string> = {
  "auth:login": "로그인",
  "auth:login-failed": "로그인 실패",
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
  "roster:export": "info",
  "merit:rule:create": "approved",
  "merit:rule:update": "info",
  "merit:rule:deactivate": "rejected",
  "merit:rule:delete": "rejected",
  "merit:threshold:update": "info",
  // 상점·벌점 양쪽에서 나오는 액션이라 종류 색(merit/demerit)을 쓰지 않는다.
  "merit:award": "info",
  "merit:cancel": "cancelled",
  "pass:request": "pending",
  "pass:consent": "info",
  "pass:approve": "approved",
  "pass:reject": "rejected",
  // 신청 없이 바로 나가는 길이라 승인과 같은 색이다.
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

/** 모르는 값이면 원본 문자열을 그대로 돌려준다. */
export function auditActionLabel(action: string): string {
  return isAuditAction(action) ? ACTION_LABELS[action] : action;
}

/** 모르는 값이면 중립 톤으로 떨어진다. */
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
  // batch는 내부 식별자라 화면에 띄우지 않는다.
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

/** enrollment:import 건수 필드. 0인 항목은 뺀다. `deleted`는 옛 행에만 있는 키다. */
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

/** roster:export — 몇 명분이 나갔나. 이름은 애초에 metadata에 없다. */
function exportSummary(metadata: Record<string, unknown>): string | null {
  const parts = [yearLabel(metadata)];
  if (typeof metadata.count === "number") parts.push(`${metadata.count}명`);
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

/**
 * invite:revoke:roster — 무슨 코드였나. 명단 반영은 소진된 코드까지 함께 지우므로
 * (Invite.createdBy가 Restrict라 남겨 둘 수 없다) 그 구분을 함께 싣는다 —
 * 액션 이름만 보면 대기 중인 코드를 없앤 것으로 읽힌다.
 */
function inviteRosterSummary(metadata: Record<string, unknown>): string | null {
  const parts = [roleSummary(metadata)];
  if (metadata.status === "USED") parts.push("소진된 코드");
  const filled = parts.filter((p): p is string => p !== null);
  return filled.length > 0 ? filled.join(" · ") : null;
}

/**
 * authz:denied — 어떤 일을 하려다 막혔는지. 저장된 값은 `merit:award` 같은
 * 코드라 그대로 띄우면 교사가 읽을 수 없다. 이미 있는 라벨 표를 거쳐 보낸다 —
 * 표에 없는 값(권한 액션과 감사로그 액션은 이름이 겹치지 않을 수 있다)은
 * 지금까지처럼 원본 문자열로 떨어진다.
 */
function authzDeniedSummary(metadata: Record<string, unknown>): string | null {
  const action = metadata.action;
  return typeof action === "string" ? `시도: ${auditActionLabel(action)}` : null;
}

/** 상벌점 기록의 공통 앞부분 — "김민준님 · 기숙사 · 벌점 3점 · 점호 지각". */
function meritSubject(metadata: Record<string, unknown>): string[] {
  const parts: string[] = [];

  // 행위자 칸이 「이정민 선생님」인데 상세만 맨이름이면 한 줄 안에서 말이 갈린다.
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

/**
 * merit:rule:delete — 무엇을 왜 지웠는지. 되돌리는 화면이 없어 로그가 유일한
 * 흔적이다. 사유는 스키마가 필수로 받는 값이라(`deleteRuleSchema`) 여기서 빼면
 * 교사가 적은 「기준이 바뀌어 폐기」가 어느 화면에도 안 나온다.
 */
function meritSubjectSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  const reason = reasonPart(metadata);
  if (reason) parts.push(reason);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function meritAwardSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  // 발생일은 늘 적는다. 줄 옆의 입력 시각과 나란히 놓여야 뒤늦은 입력이 보인다.
  if (typeof metadata.occurredOn === "string") {
    const occurredOn = new Date(metadata.occurredOn);
    if (!Number.isNaN(occurredOn.getTime())) {
      parts.push(`발생 ${formatDate(occurredOn)}`);
    }
  }

  // 묶음 개념을 없애기 전(2026-08-18)에 남은 기록에만 batchId가 있다. 감사로그는
  // append-only라 지난 줄을 고쳐 쓰지 않으므로, 그 줄들이 "일괄"을 잃지 않게 남긴다.
  // 새 기록에는 이 키가 없어 이 줄이 걸리지 않는다.
  if (typeof metadata.batchId === "string") parts.push("일괄");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 「사유: …」 한 조각. 사유를 받는 기록이 늘어도 문구가 갈라지지 않게 모아 둔다. */
function reasonPart(metadata: Record<string, unknown>): string | null {
  const reason = metadata.reason;
  return typeof reason === "string" && reason.length > 0 ? `사유: ${reason}` : null;
}

/** merit:cancel — 무엇을 취소했는지와 사유. */
function meritCancelSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  const reason = reasonPart(metadata);
  if (reason) parts.push(reason);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * invite:revoke — 사유만 싣는다.
 *
 * 폐기하면 목록에서 대기 상태가 사라져 「왜 없앴나」를 되짚을 자료가 여기밖에
 * 없다. 이 갈래가 없으면 기본값으로 떨어져 「reason 잘못 발급」처럼 날것으로 찍힌다.
 */
function reasonSummary(metadata: Record<string, unknown>): string | null {
  return reasonPart(metadata);
}

/** user:update — 바뀐 항목과 조치 사유를 함께 남긴다. */
function userUpdateSummary(metadata: Record<string, unknown>): string | null {
  const parts = [changedSummary(metadata.changed), reasonPart(metadata)].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** merit:rule:update — 바뀐 필드 요약 + 점수 전/후. 점수가 그대로면 생략한다. */
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

/**
 * merit:threshold:update — "교내 · 경고 20→15 · 위험 30→25".
 * 기준은 덮어쓰기라 옛 값이 이 로그에만 남는다. 안 바뀐 쪽은 생략한다.
 */
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

/** metadata의 ISO 문자열을 Date로. 못 읽으면 null이다 (옛 행·손상된 값). */
function dateFrom(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * pass:* 여섯 갈래가 함께 쓰는 문장. 없는 키는 그냥 빠지므로 액션마다
 * 다른 조각을 실어도 같은 함수가 받는다.
 *
 * **`reason`은 반려·취소 사유 전용이다.** 신청·부여의 사유(학생이 적은
 * 「정기 검진」)는 metadata에 싣지 않고 `destination`만 남긴다 — 같은 키에
 * 두 가지 뜻이 들어오면 감사로그의 「사유: …」가 무엇을 가리키는지 갈린다.
 * 신청 사유는 출입증 상세에 그대로 있다.
 *
 * 기간은 `startAt`·`endAt`이 **둘 다** 있을 때만 찍는다. 반쪽 범위는
 * 「8. 28. ~ 」처럼 읽혀 없느니만 못하다.
 */
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

/**
 * **사유를 받는 액션은 `reasonPart()`를 붙인다.** 「왜」는 되돌리는 화면이 없는
 * 기록일수록 로그에만 남는 조각이라, 갈래마다 따로 쓰면 하나씩 빠진다.
 */
const METADATA_FORMATTERS: Partial<
  Record<AuditAction, (metadata: Record<string, unknown>) => string | null>
> = {
  "user:update": userUpdateSummary,
  "user:activate": reasonSummary,
  "user:deactivate": reasonSummary,
  "user:reset-password": reasonSummary,
  "enrollment:update": enrollmentUpdateSummary,
  "enrollment:import": importSummary,
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

/**
 * metadata를 한 문장으로 바꾼다. 모르는 액션은 key value 나열로 떨어진다.
 * 빈 객체·비객체면 null이다 (화면에서 "—").
 */
export function formatAuditMetadata(action: string, metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;

  const formatter = isAuditAction(action) ? METADATA_FORMATTERS[action] : undefined;
  if (formatter) return formatter(metadata);

  const pairs = Object.entries(metadata);
  if (pairs.length === 0) return null;
  return pairs.map(([key, value]) => `${key} ${String(value)}`).join(" · ");
}
