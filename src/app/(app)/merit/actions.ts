"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/core/auth/session";
import { ForbiddenError } from "@/core/authz/errors";
import { MERIT_TRACK_LABELS, type MeritTrack } from "@/core/authz/merit-track";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import * as service from "@/modules/merit/award.service";
import { toHistorySheet, toRosterSheet } from "@/modules/merit/merit.export";
import { MeritError } from "@/modules/merit/merit.error";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelBatchSchema,
  cancelSchema,
  classRosterSchema,
  studentHistoryExportSchema,
} from "@/modules/merit/merit.schema";
import type { MeritActionState } from "./action-state";

const MESSAGES: Record<string, string> = {
  RULE_NOT_FOUND: "규정을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
  // 규정은 화면에서 "삭제"로 통일했다(deleteRule·감사 라벨·확인 문구).
  // 여기만 "비활성"으로 남으면 사용자가 겪은 적 없는 상태를 가리키게 된다.
  RULE_INACTIVE: "삭제된 규정입니다. 다른 항목을 골라 주세요.",
  AWARD_NOT_FOUND: "기록을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
  ALREADY_CANCELLED: "이미 취소된 기록입니다.",
  STUDENT_NOT_FOUND: "학생을 찾을 수 없습니다. 명단이 바뀌었을 수 있습니다.",
  NO_STUDENTS: "학생을 선택해 주세요.",
  BATCH_NOT_FOUND: "취소할 묶음을 찾을 수 없습니다. 이미 취소되었을 수 있습니다.",
  TOO_MANY_STUDENTS: `한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`,
  // 부여는 언제나 현재 학년도로 들어가므로, 그 학년도 밖의 발생일은 넣을 자리가
  // 없다 — 넣어 봐야 월별 추이의 12칸 축 밖이라 화면에서 사라진다.
  OCCURRED_OUT_OF_YEAR:
    "발생일이 현재 학년도(3월 1일 ~ 이듬해 2월 말) 밖입니다. 지난 학년도의 일은 부여할 수 없습니다.",
  OCCURRED_IN_FUTURE: "발생일이 미래입니다. 오늘까지의 날짜만 고를 수 있습니다.",
};

const NO_CURRENT_YEAR_MESSAGE =
  "현재 학년도가 설정되어 있지 않습니다. 학생 관리에서 학년도를 먼저 만들어 주세요.";

function toState(error: unknown): MeritActionState {
  if (error instanceof AcademicYearError) {
    return { error: NO_CURRENT_YEAR_MESSAGE, ok: false, count: null };
  }
  // 권한 거부를 일반 폴백에 섞지 않는다. 감사로그에는 authz:denied가 정확히
  // 남는데 화면만 "처리하지 못했습니다"라고 하면, 권한이 없어서 막힌 사람이
  // 일시적 장애로 알고 계속 다시 누른다. admin/invites·users가 같은 이유로
  // FORBIDDEN을 사전에 두고 있다 — 이 파일만 빠져 있었다.
  if (error instanceof ForbiddenError) {
    return { error: "이 작업을 할 권한이 없습니다.", ok: false, count: null };
  }
  if (error instanceof MeritError) {
    return { error: MESSAGES[error.message] ?? "처리하지 못했습니다.", ok: false, count: null };
  }
  return { error: "처리하지 못했습니다.", ok: false, count: null };
}

export async function awardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  // 학년도는 받지 않는다 — 서비스가 getCurrentYear()로 정한다.
  const parsed = awardSchema.safeParse({
    studentProfileId: formData.get("studentProfileId"),
    ruleId: formData.get("ruleId"),
    occurredOn: formData.get("occurredOn"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "항목을 골라 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    await service.awardMerit(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePath(`/merit/students/${parsed.data.studentProfileId}`);
  return { error: null, ok: true, count: 1 };
}

export async function bulkAwardAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = bulkAwardSchema.safeParse({
    // 체크박스는 같은 name으로 여러 개 온다.
    studentProfileIds: formData.getAll("studentProfileIds").map(String),
    ruleId: formData.get("ruleId"),
    occurredOn: formData.get("occurredOn"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "선택을 확인해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    const { count } = await service.bulkAwardMerit(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error);
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
    return {
      error: parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    await service.cancelAward(actor, parsed.data);
  } catch (error) {
    return toState(error);
  }

  // 어느 학생인지는 폼이 함께 보낸다 — 취소 후 그 학생 화면을 새로 그린다.
  const studentProfileId = String(formData.get("studentProfileId") ?? "");
  if (studentProfileId) revalidatePath(`/merit/students/${studentProfileId}`);
  return { error: null, ok: true, count: null };
}

/**
 * 묶음 통째로 취소. 일괄 부여를 잘못했을 때 한 번에 되돌린다.
 */
export async function cancelBatchAction(
  _prev: MeritActionState,
  formData: FormData,
): Promise<MeritActionState> {
  const actor = await requireAuth();

  const parsed = cancelBatchSchema.safeParse({
    batchId: formData.get("batchId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "취소 사유를 입력해 주세요.",
      ok: false,
      count: null,
    };
  }

  try {
    const { count } = await service.cancelBatch(actor, parsed.data);
    revalidatePath("/merit");
    return { error: null, ok: true, count };
  } catch (error) {
    return toState(error);
  }
}

/**
 * 내보내기. 명단 내보내기와 같은 방식 — 서버는 행렬만 돌려주고
 * 클라이언트가 xlsx를 만든다. <form action>이 아니라 버튼 클릭에서 직접 부르므로
 * useActionState를 쓰지 않는다.
 */
export async function exportClassRosterAction(input: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}): Promise<{ error: string | null; rows: (string | number)[][]; filename: string }> {
  const actor = await requireAuth();

  const parsed = classRosterSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    const year = parsed.data.year ?? (await getCurrentYear());
    const rows = await service.getClassRoster(actor, parsed.data);
    const sheet = toRosterSheet(rows, {
      track: parsed.data.track,
      year,
      grade: parsed.data.grade,
      classNo: parsed.data.classNo,
    });
    const trackLabel = MERIT_TRACK_LABELS[parsed.data.track];
    return {
      error: null,
      rows: sheet,
      filename: `${year}_${parsed.data.grade}학년${parsed.data.classNo}반_${trackLabel}상벌점.xlsx`,
    };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
    }
    // 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나가므로
    // 여기서 흘리면 무엇이 잘못됐는지 아무 데도 남지 않는다.
    console.error("상벌점 내보내기 실패:", error);
    return { error: "내려받지 못했습니다.", rows: [], filename: "" };
  }
}

/**
 * 한 학생의 내역 내보내기 — 생활기록부 근거처럼 학생 한 명분이 필요할 때 쓴다.
 * 반별 내보내기와 같은 방식이며, 트랙별 조회 범위(교내=학년도, 기숙사=누적)도
 * 서비스가 그대로 적용한다.
 */
export async function exportStudentHistoryAction(input: {
  studentProfileId: string;
  track: MeritTrack;
  year?: number;
}): Promise<{ error: string | null; rows: (string | number)[][]; filename: string }> {
  const actor = await requireAuth();

  const parsed = studentHistoryExportSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "조회 조건을 확인해 주세요.", rows: [], filename: "" };
  }

  try {
    const [header, view] = await Promise.all([
      service.getStudentHeader(actor, parsed.data.studentProfileId),
      service.getStudentMerit(
        actor,
        parsed.data.studentProfileId,
        parsed.data.track,
        parsed.data.year,
      ),
    ]);
    if (!header) {
      return { error: "학생을 찾을 수 없습니다.", rows: [], filename: "" };
    }

    const sheet = toHistorySheet(view.awards, {
      track: parsed.data.track,
      studentName: header.name,
    });
    const trackLabel = MERIT_TRACK_LABELS[parsed.data.track];
    // 기숙사는 누적이라 학년도가 파일명에 들어가면 거짓말이 된다.
    const scope = view.year === null ? "누적" : `${view.year}`;
    return {
      error: null,
      rows: sheet,
      filename: `${header.name}_${trackLabel}상벌점_${scope}.xlsx`,
    };
  } catch (error) {
    if (error instanceof AcademicYearError) {
      return { error: NO_CURRENT_YEAR_MESSAGE, rows: [], filename: "" };
    }
    console.error("상벌점 내역 내보내기 실패:", error);
    return { error: "내려받지 못했습니다.", rows: [], filename: "" };
  }
}
