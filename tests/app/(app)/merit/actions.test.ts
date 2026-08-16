import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeritError } from "@/modules/merit/merit.error";

/**
 * 상벌점 서버 액션의 **경계** — 폼이 보내는 FormData가 zod 스키마에 닿는 그 지점.
 *
 * `(auth)/register/actions.test.ts`와 같은 목적이다. 서비스 테스트는 입력 객체를
 * 손으로 만들어 넘기므로 "액션이 폼의 어떤 필드를 안 읽는다"를 볼 수 없다 —
 * 최초 관리자 생성이 100% 실패하던 C-1이 정확히 그 틈에서 살아남았다.
 *
 * 그래서 FormData는 **화면의 .tsx가 실제로 보내는 name 그대로** 만든다.
 * 출처: award-form.tsx · class-roster.tsx · cancel-button.tsx ·
 * recent/cancel-batch-button.tsx · components/ui/confirm-dialog.tsx(reason) ·
 * components/merit/rule-picker.tsx(ruleId).
 */

// 목은 구현 없이 선언하고 기본값은 beforeEach에서 준다 —
// tests/modules/**의 서비스 테스트와 같은 방식이다.
const requireAuth = vi.fn();
const revalidatePath = vi.fn();

const awardMerit = vi.fn();
const bulkAwardMerit = vi.fn();
const cancelAward = vi.fn();
const cancelBatch = vi.fn();
const getClassRoster = vi.fn();
const getStudentHeader = vi.fn();
const getStudentMerit = vi.fn();

const getCurrentYear = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/merit/award.service", () => ({
  awardMerit,
  bulkAwardMerit,
  cancelAward,
  cancelBatch,
  getClassRoster,
  getStudentHeader,
  getStudentMerit,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  AcademicYearError: class AcademicYearError extends Error {},
  getCurrentYear,
}));

const { AcademicYearError } = await import(
  "@/modules/academic-year/academic-year.service"
);
const {
  awardAction,
  bulkAwardAction,
  cancelAction,
  cancelBatchAction,
  exportClassRosterAction,
  exportStudentHistoryAction,
} = await import("@/app/(app)/merit/actions");

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) fd.append(key, v);
    else fd.set(key, value);
  }
  return fd;
}

/** award-form.tsx가 보내는 필드 그대로 (ruleId는 RulePicker의 hidden input). */
function awardForm(over: Record<string, string> = {}): FormData {
  return form({
    studentProfileId: "sp-1",
    ruleId: "rule-1",
    occurredOn: "2026-08-14",
    note: "",
    ...over,
  });
}

/** class-roster.tsx가 보내는 필드 그대로. 체크박스는 같은 name으로 여러 개 온다. */
function bulkForm(over: Record<string, string | string[]> = {}): FormData {
  return form({
    studentProfileIds: ["sp-1", "sp-2", "sp-3"],
    ruleId: "rule-1",
    occurredOn: "2026-08-14",
    note: "",
    ...over,
  });
}

/** cancel-button.tsx의 hidden input 둘 + ConfirmDialog의 reason. */
function cancelForm(over: Record<string, string> = {}): FormData {
  return form({
    awardId: "aw-1",
    studentProfileId: "sp-1",
    reason: "항목을 잘못 골랐습니다",
    ...over,
  });
}

/** cancel-batch-button.tsx의 hidden input + ConfirmDialog의 reason. */
function cancelBatchForm(over: Record<string, string> = {}): FormData {
  return form({
    batchId: "batch-1",
    reason: "항목을 잘못 골랐습니다",
    ...over,
  });
}

const INITIAL = { error: null, ok: false, count: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  bulkAwardMerit.mockResolvedValue({ count: 3 });
  cancelBatch.mockResolvedValue({ count: 3 });
  getClassRoster.mockResolvedValue([]);
  getStudentHeader.mockResolvedValue({ name: "홍길동" });
  getStudentMerit.mockResolvedValue({ awards: [], year: 2026 });
  getCurrentYear.mockResolvedValue(2026);
});

describe("awardAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await awardAction(INITIAL, awardForm());

    expect(awardMerit).toHaveBeenCalledOnce();
    expect(state).toEqual({ error: null, ok: true, count: 1 });
  });

  it("폼의 네 필드를 모두 읽는다 — 하나라도 빠지면 스키마가 막는다", async () => {
    await awardAction(INITIAL, awardForm({ note: "점호 지각" }));

    expect(awardMerit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        studentProfileId: "sp-1",
        ruleId: "rule-1",
        note: "점호 지각",
      }),
    );
    // occurredOn은 KST 자정 Date로 변환돼 넘어간다 (문자열 그대로가 아니다).
    expect(awardMerit.mock.calls[0]?.[1].occurredOn).toBeInstanceOf(Date);
  });

  it("항목을 안 고르면 서비스를 부르지 않고 한국어로 알린다", async () => {
    // RulePicker는 아무것도 안 고르면 빈 문자열을 보낸다 (hidden input).
    const state = await awardAction(INITIAL, awardForm({ ruleId: "" }));

    expect(awardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("부여할 항목을 골라 주세요.");
  });

  it("발생일이 깨져 있으면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await awardAction(INITIAL, awardForm({ occurredOn: "" }));

    expect(awardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("발생일을 골라 주세요.");
  });

  it("메모가 상한을 넘으면 조용히 버리지 않고 막는다", async () => {
    const state = await awardAction(INITIAL, awardForm({ note: "가".repeat(501) }));

    expect(awardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("500자를 넘을 수 없습니다.");
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await awardAction(INITIAL, awardForm({ ruleId: "" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("서비스의 오류 코드를 MESSAGES 문구로 옮긴다", async () => {
    awardMerit.mockRejectedValueOnce(new MeritError("RULE_INACTIVE"));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toBe("삭제된 규정입니다. 다른 항목을 골라 주세요.");
    expect(state.ok).toBe(false);
  });

  it("학년도 밖 발생일은 그 이유를 그대로 알린다", async () => {
    awardMerit.mockRejectedValueOnce(new MeritError("OCCURRED_OUT_OF_YEAR"));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toContain("현재 학년도");
  });

  it("현재 학년도가 없으면 규정 문제로 안내하지 않는다", async () => {
    awardMerit.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toContain("현재 학년도가 설정되어 있지 않습니다");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    awardMerit.mockRejectedValueOnce(new MeritError("SOME_NEW_CODE"));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toBe("처리하지 못했습니다.");
  });
});

describe("bulkAwardAction — 경계 검증", () => {
  it("체크박스가 보낸 id를 전부 읽는다 (getAll)", async () => {
    const state = await bulkAwardAction(INITIAL, bulkForm());

    expect(bulkAwardMerit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        studentProfileIds: ["sp-1", "sp-2", "sp-3"],
        ruleId: "rule-1",
      }),
    );
    expect(state).toEqual({ error: null, ok: true, count: 3 });
  });

  it("아무도 안 고르면 서비스를 부르지 않는다", async () => {
    const fd = bulkForm();
    fd.delete("studentProfileIds");

    const state = await bulkAwardAction(INITIAL, fd);

    expect(bulkAwardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("학생을 선택해 주세요.");
  });

  it("상한을 넘는 인원은 스키마가 막고 문구에 상수를 그대로 쓴다", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `sp-${i}`);

    const state = await bulkAwardAction(INITIAL, bulkForm({ studentProfileIds: ids }));

    expect(bulkAwardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("한 번에 100명까지 줄 수 있습니다.");
  });

  it("서비스가 센 건수를 그대로 화면에 넘긴다", async () => {
    bulkAwardMerit.mockResolvedValueOnce({ count: 28 });

    const state = await bulkAwardAction(INITIAL, bulkForm());

    expect(state.count).toBe(28);
  });
});

describe("cancelAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await cancelAction(INITIAL, cancelForm());

    expect(cancelAward).toHaveBeenCalledWith(
      expect.anything(),
      { awardId: "aw-1", reason: "항목을 잘못 골랐습니다" },
    );
    expect(state.ok).toBe(true);
  });

  it("사유가 비면 서비스를 부르지 않는다 — 사유는 취소 권한의 근거다", async () => {
    const state = await cancelAction(INITIAL, cancelForm({ reason: "   " }));

    expect(cancelAward).not.toHaveBeenCalled();
    expect(state.error).toBe("취소 사유를 입력해 주세요.");
  });

  it("함께 온 studentProfileId로 그 학생 화면을 다시 그린다", async () => {
    await cancelAction(INITIAL, cancelForm());

    expect(revalidatePath).toHaveBeenCalledWith("/merit/students/sp-1");
  });

  it("이미 취소된 기록은 그 이유를 알린다", async () => {
    cancelAward.mockRejectedValueOnce(new MeritError("ALREADY_CANCELLED"));

    const state = await cancelAction(INITIAL, cancelForm());

    expect(state.error).toBe("이미 취소된 기록입니다.");
  });
});

describe("cancelBatchAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await cancelBatchAction(INITIAL, cancelBatchForm());

    expect(cancelBatch).toHaveBeenCalledWith(
      expect.anything(),
      { batchId: "batch-1", reason: "항목을 잘못 골랐습니다" },
    );
    expect(state.count).toBe(3);
  });

  it("사유가 비면 서비스를 부르지 않는다", async () => {
    const state = await cancelBatchAction(INITIAL, cancelBatchForm({ reason: "" }));

    expect(cancelBatch).not.toHaveBeenCalled();
    expect(state.error).toBe("취소 사유를 입력해 주세요.");
  });

  it("이미 없는 묶음은 그 이유를 알린다", async () => {
    cancelBatch.mockRejectedValueOnce(new MeritError("BATCH_NOT_FOUND"));

    const state = await cancelBatchAction(INITIAL, cancelBatchForm());

    expect(state.error).toBe("취소할 묶음을 찾을 수 없습니다. 이미 취소되었을 수 있습니다.");
  });
});

/*
 * 내보내기 둘은 <form action>이 아니라 버튼 클릭에서 인수를 그대로 받는다
 * (export-button.tsx). FormData 경계는 없지만 safeParse 경계는 그대로 있다.
 */
describe("exportClassRosterAction — 경계 검증", () => {
  it("조건이 맞으면 서비스까지 도달하고 파일명을 만든다", async () => {
    const result = await exportClassRosterAction({
      grade: 2,
      classNo: 3,
      track: "DORM",
      year: 2026,
    });

    expect(getClassRoster).toHaveBeenCalledOnce();
    expect(result.error).toBeNull();
    expect(result.filename).toBe("2026_2학년3반_기숙사상벌점.xlsx");
  });

  it("학년도를 안 주면 현재 학년도로 채운다", async () => {
    const result = await exportClassRosterAction({
      grade: 1,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(getCurrentYear).toHaveBeenCalled();
    expect(result.filename).toBe("2026_1학년1반_교내상벌점.xlsx");
  });

  it("범위 밖 학년은 서비스를 부르지 않는다", async () => {
    const result = await exportClassRosterAction({
      grade: 9,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(getClassRoster).not.toHaveBeenCalled();
    expect(result.error).toBe("조회 조건을 확인해 주세요.");
  });

  it("현재 학년도가 없으면 파일 문제로 안내하지 않는다", async () => {
    getCurrentYear.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));

    const result = await exportClassRosterAction({
      grade: 1,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(result.error).toContain("현재 학년도가 설정되어 있지 않습니다");
  });
});

describe("exportStudentHistoryAction — 경계 검증", () => {
  it("조건이 맞으면 서비스까지 도달한다", async () => {
    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-1",
      track: "SCHOOL",
      year: 2026,
    });

    expect(getStudentMerit).toHaveBeenCalledOnce();
    expect(result.error).toBeNull();
    expect(result.filename).toBe("홍길동_교내상벌점_2026.xlsx");
  });

  it("기숙사 누적은 파일명에 학년도를 적지 않는다", async () => {
    getStudentMerit.mockResolvedValueOnce({ awards: [], year: null });

    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-1",
      track: "DORM",
    });

    expect(result.filename).toBe("홍길동_기숙사상벌점_누적.xlsx");
  });

  it("학생 id가 비면 서비스를 부르지 않는다", async () => {
    const result = await exportStudentHistoryAction({
      studentProfileId: "",
      track: "SCHOOL",
    });

    expect(getStudentMerit).not.toHaveBeenCalled();
    expect(result.error).toBe("조회 조건을 확인해 주세요.");
  });

  it("없는 학생이면 빈 파일을 만들지 않는다", async () => {
    getStudentHeader.mockResolvedValueOnce(null);

    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-x",
      track: "SCHOOL",
    });

    expect(result.error).toBe("학생을 찾을 수 없습니다.");
    expect(result.rows).toEqual([]);
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await awardAction(INITIAL, awardForm({ ruleId: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
