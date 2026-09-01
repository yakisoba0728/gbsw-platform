"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import type { MeritTrack } from "@/core/authz/merit-track";
import { AcademicYearError } from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { MeritError } from "@/modules/merit/merit.error";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelSchema,
  classRosterExportSchema,
  recentAwardsExportSchema,
  studentHistoryExportSchema,
} from "@/modules/merit/merit.schema";
import type { RecentAwardsExportInput } from "@/modules/merit/merit.schema";
import type { MeritActionState } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다.",
  // 화면은 규정을 "삭제"로 부른다 — 여기만 "비활성"이면 겪은 적 없는 상태가 된다.
  RULE_INACTIVE: "삭제된 규정입니다.",
  AWARD_NOT_FOUND: "기록을 찾을 수 없습니다.",
  ALREADY_CANCELLED: "이미 취소된 기록입니다.",
  STUDENT_NOT_FOUND: "재학 중인 학생이 아닙니다.",
  NO_STUDENTS: "학생을 선택해 주세요.",
  TOO_MANY_STUDENTS: `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`,
  // 발생일은 화면 입력이 아니라 오늘(KST)이다 — 날짜를 고르라고 안내하면 없는 칸을 찾게 된다.
  // 학년도를 넘기지 않은 채 3월을 맞으면 오늘이 학년도 창 밖이 되어 여기로 온다.
  OCCURRED_OUT_OF_YEAR: "오늘이 현재 학년도 밖입니다. 학생 관리에서 새 학년도로 바꾸세요.",
  OCCURRED_IN_FUTURE: "발생일이 미래입니다.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 없습니다. 학생 관리에서 학년도를 먼저 만드세요.";

/**
 * 실패 상태 한 벌. `note`는 폼이 자동 reset된 뒤 메모 칸이 되살릴 제출값이다 —
 * 부여 폼만 넘기고 취소는 넘기지 않는다.
 */
function fail(error: string, note?: string): MeritActionState {
  return { error, ok: false, count: null, note };
}

/** FormData의 메모를 그대로 읽는다. 되살릴 값이라 zod가 다듬기 전 글자여야 한다. */
function submittedNote(formData: FormData): string {
  const raw = formData.get("note");
  return typeof raw === "string" ? raw : "";
}

/**
 * 트랜잭션이 예산 안에 못 끝났는가(Prisma P2028). 부여는 AcademicYear를 잠그는데
 * 명단 일괄 반영이 같은 잠금을 최대 120초 쥔다 — 학년 초에 실제로 겹친다.
 * 서비스 오류가 아니라 일시적 경합이라 안내가 달라야 한다.
 */
function isTransactionTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2028"
  );
}

function toState(error: unknown, note?: string): MeritActionState {
  if (error instanceof AcademicYearError) {
    return fail(NO_CURRENT_YEAR_MESSAGE, note);
  }
  if (isTransactionTimeout(error)) {
    // 폴백 문구로 나가면 "처리하지 못했습니다"만 남아 왜 막혔는지 아무 데도 안 남는다.
    console.error("[merit] 트랜잭션이 예산 안에 끝나지 않았습니다.", error);
    return fail("다른 작업이 학년도를 쓰고 있습니다. 잠시 뒤 다시 부여하세요.", note);
  }
  // 권한 거부를 일반 폴백에 섞지 않는다. 화면이 "처리하지 못했습니다"라고 하면
  // 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
  if (error instanceof ForbiddenError) {
    return fail("이 작업을 할 권한이 없습니다.", note);
  }
  if (error instanceof MeritError) {
    return fail(MESSAGES[error.message] ?? "처리하지 못했습니다.", note);
  }
  // 예상 못 한 오류는 서버 콘솔에 남긴다. 화면에는 일반 문구만 나가므로
  // 여기서 안 남기면 원인이 어디에도 없다.
  console.error("[merit] 예상 못 한 오류", error);
  return fail("처리하지 못했습니다.", note);
}

export async function awardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();
  const note = submittedNote(formData);

  // 학년도도 발생일도 받지 않는다 — 서비스가 정한다.
  const parsed = awardSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "부여할 항목을 골라 주세요.", note);
  }

  try {
    await service.awardMerit(actor, parsed.data);
  } catch (error) {
    return toState(error, note);
  }

  // 학생 상세는 `/students/<id>`로 옮겼고 옛 주소는 308 리다이렉트로 남아 있다.
  // 리다이렉트도 캐시되므로 둘 다 무르지 않으면 한쪽이 옛 화면을 계속 낸다.
  revalidatePath(`/students/${parsed.data.studentProfileId}`);
  revalidatePath(`/merit/students/${parsed.data.studentProfileId}`);
  return { error: null, ok: true, count: 1 };
}

export async function bulkAwardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();
  const note = submittedNote(formData);

  const parsed = bulkAwardSchema.safeParse({
    // 체크박스는 같은 name으로 여러 개 온다.
    studentProfileIds: formData.getAll("studentProfileIds").map(String),
    ruleId: formData.get("ruleId"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "학생을 선택해 주세요.", note);
  }

  try {
    const { count } = await service.bulkAwardMerit(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error, note);
  }
}

export async function cancelAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = cancelSchema.safeParse({
    awardId: formData.get("awardId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.");
  }

  try {
    await service.cancelAward(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  // 어느 학생인지는 폼이 함께 보낸다 — 취소 후 그 학생 화면을 다시 그린다.
  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  if (studentProfileId) {
    // 옛 주소(308 리다이렉트)까지 함께 무른다 — awardAction과 같은 이유.
    revalidatePath(`/students/${studentProfileId}`);
    revalidatePath(`/merit/students/${studentProfileId}`);
  }
  // 최근 부여의 상태 필터·건수도 즉시 바뀌어야 한다.
  revalidatePath("/merit/recent");
  return { error: null, ok: true, count: null };
}

/**
 * 내보내기 결과. 서버는 행렬만 돌려주고 클라이언트(export-button.tsx)가
 * write-excel-file/browser로 xlsx를 만든다.
 */
type ExportState = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

const EXPORT_FAILED = "내보내지 못했습니다.";

/** 내보내기 실패의 오류 → 화면 문구. toState와 같은 일을 하되 반환 모양이 다르다. */
function toExportState(error: unknown, logLabel: string): ExportState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
  }
  // toState와 같은 이유로 권한 거부를 갈라낸다 — 폴백으로 떨어지면 정상적인
  // 거부가 서버 로그에서 예상 못 한 오류처럼 보인다.
  if (error instanceof ForbiddenError) {
    return { error: "이 작업을 할 권한이 없습니다.", rows: [], filename: "" };
  }
  if (error instanceof MeritError) {
    return { error: MESSAGES[error.message] ?? EXPORT_FAILED, rows: [], filename: "" };
  }
  // 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나간다.
  console.error(logLabel, error);
  return { error: EXPORT_FAILED, rows: [], filename: "" };
}

/** 반별 목록 내보내기. 시트 조립·파일명은 서비스가 만든다. */
export async function exportClassRosterAction(input: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}): Promise<ExportState> {
  const actor = await requireAuth();

  // 내보내기는 학년·반이 있어야 파일 이름을 지을 수 있다 — 화면 조회와 다른 스키마다.
  const parsed = classRosterExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportClassRoster(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "상벌점 내보내기 실패:");
  }
}

/** 한 학생의 내역 내보내기. 조회 범위는 서비스가 트랙 규칙대로 정한다. */
export async function exportStudentHistoryAction(input: {
  studentProfileId: string;
  track: MeritTrack;
  year?: number;
}): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = studentHistoryExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportStudentHistory(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "상벌점 내역 내보내기 실패:");
  }
}

/** 최근 부여 화면의 현재 필터 전체를 내보낸다. */
export async function exportRecentAwardsAction(
  input: RecentAwardsExportInput,
): Promise<ExportState> {
  const actor = await requireAuth();

  const parsed = recentAwardsExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    return { error: null, ...(await service.exportRecentAwards(actor, parsed.data)) };
  } catch (error) {
    return toExportState(error, "최근 부여 내보내기 실패:");
  }
}
