import type { BadgeTone } from "@/components/ui/badge";
import {
  isMeritKind,
  isMeritTrack,
  MERIT_KIND_LABELS,
  MERIT_TRACK_LABELS,
} from "@/core/authz/merit-track";
import { isRole, ROLE_LABELS } from "@/core/authz/roles";
import { formatDate } from "@/lib/datetime";

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
 * 화면이 아는 감사로그 액션 전부.
 *
 * **개수를 세어 적지 않는다.** 예전엔 "13종 + 2"라고 적혀 있었는데 액션이 늘 때
 * 아무도 이 줄을 고치지 않아 실제 배열과 어긋났다 — 세어야 알 수 있는 값은
 * 주석이 아니라 배열이 답한다(`AUDIT_ACTIONS.length`).
 *
 * 지금 코드가 안 남기는 값도 남아 있다. `invite:create:parent`는 지금의 recordAudit
 * 호출부(invite.service.ts)가 전부 "invite:create"만 남기지만, 과거 데이터에 이
 * 값으로 기록된 행이 있어(불변 로그라 고쳐 쓸 수 없다) 라벨은 계속 필요하다.
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
  // 명단 반영으로 학생이 명단에서 빠지면서, 그 학생에게 딸린 미사용 코드가 함께
  // 폐기됐을 때 (roster.service.ts). invite:auto-revoke와 나누는 이유는 원인이
  // 다르기 때문이다 — 저쪽은 가입 시도자가 2차 요소를 반복해 틀린 사건(행위자
  // 없음, 이상 징후일 수 있다)이고 이쪽은 관리자가 명단을 올린 결과(행위자
  // 있음, 일상적인 일)다. 한 이름으로 합치면 로그에서 둘을 못 가른다.
  "invite:revoke:roster",
  "user:update",
  "user:activate",
  "user:deactivate",
  "user:reset-password",
  "user:delete",
  // 명단에서 빠진 계정을 소프트 삭제할 때 (2026-08-14 결정). user:delete는
  // Task 3의 하드 삭제(오등록 정리, 사용자 상세)가 계속 쓰므로 그대로 둔다 —
  // 하나는 "명단에서 빠짐"(되돌릴 수 있음), 다른 하나는 "완전 삭제"(못 돌아옴)라
  // 라벨과 톤을 분리해야 감사로그를 보는 사람이 둘을 헷갈리지 않는다.
  "user:soft-delete",
  "academic-year:create",
  "academic-year:set-current",
  "enrollment:update",
  "enrollment:import",
  "merit:rule:create",
  "merit:rule:update",
  // 목록에서 지우는 동작. 화면 문구가 "비활성"이던 시절의 값도 남겨 둔다 —
  // 이미 그 이름으로 저장된 행이 있고 로그는 고쳐 쓰지 않는다
  // (invite:create:parent와 같은 패턴, 이 파일 상단 주석 참고).
  "merit:rule:deactivate",
  "merit:rule:delete",
  // 벌점 경고·위험 기준 변경. 규정 추가·수정과 나눈다 — 저쪽은 항목 하나,
  // 이쪽은 전교의 명단·강조가 한 번에 달라지는 변경이다.
  "merit:threshold:update",
  "merit:award",
  "merit:cancel",
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
  "invite:revoke:roster": "초대코드 폐기 (명단에서 제외)",
  "user:update": "사용자 정보 수정",
  "user:activate": "계정 활성화",
  "user:deactivate": "계정 비활성화",
  "user:reset-password": "비밀번호 초기화",
  "user:delete": "계정 삭제",
  "user:soft-delete": "명단에서 제외",
  "academic-year:create": "학년도 추가",
  "academic-year:set-current": "현재 학년도 변경",
  "enrollment:update": "소속·학적 수정",
  "enrollment:import": "명단 일괄 반영",
  "merit:rule:create": "상벌점 규정 추가",
  "merit:rule:update": "상벌점 규정 수정",
  "merit:rule:deactivate": "상벌점 규정 삭제",
  "merit:rule:delete": "상벌점 규정 삭제",
  "merit:threshold:update": "벌점 기준 변경",
  "merit:award": "상벌점 부여",
  "merit:cancel": "상벌점 취소",
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
  "merit:rule:create": "approved",
  "merit:rule:update": "info",
  "merit:rule:deactivate": "rejected",
  "merit:rule:delete": "rejected",
  "merit:threshold:update": "info",
  // 상점·벌점 어느 쪽이든 나오는 액션이라 merit/demerit 톤을 쓰지 않는다 —
  // 색이 실제 종류와 어긋나면 목록을 훑을 때 오히려 오해를 만든다.
  "merit:award": "info",
  "merit:cancel": "cancelled",
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
  MeritRule: "상벌점 규정",
  MeritThreshold: "벌점 기준",
  MeritAward: "상벌점",
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

/**
 * enrollment:import 건수 필드 — 0인 항목은 뺀다. 값이 있는 것만 보여야 읽힌다.
 *
 * `deleted`는 옛 필드명이다 — 명단 반영이 계정을 지우던 시절(하드 삭제)에 쓰던
 * 키로, 그 시절 저장된 감사로그 행에는 여전히 이 이름으로 남아 있다. 저장된
 * 행은 스키마를 바꾸지 않는 한 고칠 수 없으므로(불변 로그) 라벨을 지우지 않는다
 * (invite:create:parent와 같은 패턴, 이 파일 상단 주석 참고). 새로 쌓이는 행은
 * `softDeleted`를 쓴다 — 계정을 지우지 않고 표시만 하므로 "삭제"라는 이름이
 * 더는 사실과 맞지 않는다.
 */
const IMPORT_COUNT_LABELS: ReadonlyArray<readonly [key: string, label: string]> = [
  ["newStudents", "신규"],
  ["newAssignment", "신규배정"],
  ["reassign", "재배정"],
  ["statusChange", "학적변동"],
  ["invitesIssued", "초대발급"],
  // 신규로 잡혔지만 재학이 아니라 아무것도 만들어지지 않은 줄 (roster.service.ts).
  // "신규 5 · 초대발급 3"만 있으면 나머지 2가 어디로 갔는지 추측해야 한다.
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

/** authz:denied — 어떤 권한 액션을 시도하다 막혔는지 보여준다 (I5). */
function authzDeniedSummary(metadata: Record<string, unknown>): string | null {
  const action = metadata.action;
  return typeof action === "string" ? `시도: ${action}` : null;
}

/** merit:award — "교내 · 상점 5점 · 교내 봉사활동 우수 참여" */
/**
 * 상벌점 기록의 공통 앞부분 — "김민준 · 기숙사 · 벌점 3점 · 점호 지각".
 *
 * **학생 이름이 맨 앞에 온다.** 로그를 보는 이유는 대개 "이 학생이 왜"이지
 * "어떤 규정이 몇 번 나갔나"가 아니다. 이름이 없으면 studentProfileId(cuid)를
 * 들고 DB를 따로 뒤져야 하는데, 그건 로그 화면이 있는 의미를 없앤다.
 */
function meritSubject(metadata: Record<string, unknown>): string[] {
  const parts: string[] = [];

  if (typeof metadata.studentName === "string") parts.push(metadata.studentName);

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

/** merit:rule:delete — 무엇을 지웠는지. 되돌리는 화면이 없어 로그가 유일한 흔적이다. */
function meritSubjectSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function meritAwardSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  /*
   * 발생일은 늘 적는다. 로그 줄은 자기 시각(언제 입력됐나)을 이미 옆에 달고
   * 있으므로, 여기 발생일이 함께 있어야 "6월 12일 일을 8월 16일에 넣었다"가
   * 한 줄에서 읽힌다. 같은 날이라 겹쳐 보일 때도 빼지 않는다 — 이 함수는
   * 그 줄의 시각을 모르고, 조건부로 감추면 "안 적힌 것"과 "같은 날"이
   * 구분되지 않는다.
   */
  if (typeof metadata.occurredOn === "string") {
    const occurredOn = new Date(metadata.occurredOn);
    if (!Number.isNaN(occurredOn.getTime())) {
      parts.push(`발생 ${formatDate(occurredOn)}`);
    }
  }

  // 일괄 부여였다는 사실만 표시한다 — batchId 자체는 내부 식별자라 화면에선
  // 의미가 없다 (enrollment:import의 batch와 같은 처리).
  if (typeof metadata.batchId === "string") parts.push("일괄");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * merit:cancel — 무엇을 취소했는지까지 보여준다.
 *
 * 사유만 남기면 "사유: 오기입"이라는 줄이 뜨는데, 그것만으로는 어느 학생의 어떤
 * 기록이 뒤집혔는지 알 수 없다. "누구나 취소할 수 있다"는 결정의 근거가 이 로그이므로
 * 여기서 답이 나와야 한다.
 */
function meritCancelSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);

  const reason = metadata.reason;
  if (typeof reason === "string" && reason.length > 0) parts.push(`사유: ${reason}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * merit:rule:update — 바뀐 필드 요약에 점수 전/후를 덧붙인다.
 *
 * rule.service.ts는 실제로 바뀐 항목이 없으면 recordAudit 자체를 안 부르므로
 * changed는 항상 최소 1개다. pointsFrom·pointsTo는 점수가 안 바뀌었어도 함께
 * 기록되므로(다른 필드만 바뀐 경우), 실제로 다를 때만 전/후를 보여준다 —
 * 안 그러면 "5→5"처럼 아무 의미 없는 숫자가 늘 따라붙는다.
 */
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
 *
 * **전/후를 둘 다 적는다.** 이 로그가 "언제부터 명단이 길어졌나"에 답하는
 * 유일한 흔적이다 — 기준은 덮어쓰기라 옛 값이 DB 어디에도 안 남는다.
 * 안 바뀐 쪽은 생략한다 (merit:rule:update의 점수 전/후와 같은 처리) —
 * "20→20"이 늘 따라붙으면 실제로 바뀐 숫자가 묻힌다.
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

const METADATA_FORMATTERS: Partial<
  Record<AuditAction, (metadata: Record<string, unknown>) => string | null>
> = {
  "user:update": (m) => changedSummary(m.changed),
  "enrollment:update": enrollmentUpdateSummary,
  "enrollment:import": importSummary,
  "academic-year:set-current": setCurrentYearSummary,
  "invite:create": roleSummary,
  "invite:create:parent": roleSummary,
  "invite:revoke:roster": roleSummary,
  "registration:complete": roleSummary,
  "authz:denied": authzDeniedSummary,
  "merit:rule:delete": meritSubjectSummary,
  "merit:award": meritAwardSummary,
  "merit:cancel": meritCancelSummary,
  "merit:rule:update": meritRuleUpdateSummary,
  "merit:threshold:update": meritThresholdSummary,
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
