import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";
import { MeritError } from "@/modules/merit/merit.error";

/**
 * 서버 액션의 경계 — FormData가 zod 스키마에 닿는 지점. 서비스 테스트는 입력
 * 객체를 손으로 넘기므로 "액션이 폼의 어떤 필드를 안 읽는다"를 못 본다.
 * 그래서 FormData는 화면의 .tsx가 실제로 보내는 name 그대로 만든다.
 */

const requireAuth = vi.fn();
const revalidatePath = vi.fn();

const awardMerit = vi.fn();
const bulkAwardMerit = vi.fn();
const cancelAward = vi.fn();
const exportClassRoster = vi.fn();
const exportStudentHistory = vi.fn();
const exportRecentAwards = vi.fn();

const getCurrentYear = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/merit/award.service", () => ({
  awardMerit,
  bulkAwardMerit,
  cancelAward,
  exportClassRoster,
  exportRecentAwards,
  exportStudentHistory,
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
  exportClassRosterAction,
  exportRecentAwardsAction,
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
    note: "",
    ...over,
  });
}

/** class-roster.tsx가 보내는 필드 그대로. 체크박스는 같은 name으로 여러 개 온다. */
function bulkForm(over: Record<string, string | string[]> = {}): FormData {
  return form({
    studentProfileIds: ["sp-1", "sp-2", "sp-3"],
    ruleId: "rule-1",
    note: "",
    ...over,
  });
}

/** components/merit/cancel-button.tsx의 hidden input 둘 + ConfirmDialog의 reason. */
function cancelForm(over: Record<string, string> = {}): FormData {
  return form({
    awardId: "aw-1",
    studentProfileId: "sp-1",
    reason: "항목을 잘못 골랐습니다",
    ...over,
  });
}

const INITIAL = { error: null, ok: false, count: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  bulkAwardMerit.mockResolvedValue({ count: 3 });
  exportClassRoster.mockResolvedValue({
    rows: [["2026학년도 2학년 3반 · 기숙사(누적)"]],
    filename: "2026_2학년3반_기숙사상벌점.xlsx",
  });
  exportStudentHistory.mockResolvedValue({
    rows: [["홍길동 · 교내 상벌점"]],
    filename: "홍길동_교내상벌점_2026.xlsx",
  });
  exportRecentAwards.mockResolvedValue({
    rows: [["기숙사 최근 부여 · 전체 종류 · 전체 상태"]],
    filename: "기숙사_최근부여.xlsx",
  });
  getCurrentYear.mockResolvedValue(2026);
});

describe("awardAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await awardAction(INITIAL, awardForm());

    expect(awardMerit).toHaveBeenCalledOnce();
    expect(state).toEqual({ error: null, ok: true, count: 1 });
  });

  it("폼의 세 필드를 모두 읽는다", async () => {
    await awardAction(INITIAL, awardForm({ note: "점호 지각" }));

    expect(awardMerit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        studentProfileId: "sp-1",
        ruleId: "rule-1",
        note: "점호 지각",
      }),
    );
    // 발생일은 경계에서 받지 않는다 — 서비스가 오늘로 정한다.
    expect(awardMerit.mock.calls[0]?.[1]).not.toHaveProperty("occurredOn");
  });

  it("항목을 안 고르면 서비스를 부르지 않고 한국어로 알린다", async () => {
    // RulePicker는 아무것도 안 고르면 빈 문자열을 보낸다 (hidden input).
    const state = await awardAction(INITIAL, awardForm({ ruleId: "" }));

    expect(awardMerit).not.toHaveBeenCalled();
    expect(state.error).toBe("부여할 항목을 골라 주세요.");
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

    expect(state.error).toBe("삭제된 규정입니다.");
    expect(state.ok).toBe(false);
  });

  it("오늘이 학년도 밖이면 없는 날짜 칸 대신 학년도를 가리킨다", async () => {
    awardMerit.mockRejectedValueOnce(new MeritError("OCCURRED_OUT_OF_YEAR"));

    const state = await awardAction(INITIAL, awardForm());

    // 부여 화면에 발생일 입력이 없다 — 날짜를 고르라는 안내는 없는 칸을 찾게 한다.
    expect(state.error).toContain("현재 학년도");
    expect(state.error).not.toContain("날짜");
  });

  it("실패하면 제출한 메모를 그대로 돌려준다", async () => {
    awardMerit.mockRejectedValueOnce(new MeritError("RULE_INACTIVE"));

    const state = await awardAction(INITIAL, awardForm({ note: " 점호 지각 " }));

    // 액션이 끝나면 React가 폼을 reset한다. 이 값이 메모 칸의 defaultValue가 되어
    // 지워지는 대신 되살아난다 — zod가 다듬기 전 글자 그대로여야 한다.
    expect(state.note).toBe(" 점호 지각 ");
  });

  it("검증에 걸려도 메모를 돌려준다", async () => {
    const state = await awardAction(
      INITIAL,
      awardForm({ ruleId: "", note: "점호 지각" }),
    );

    expect(state.note).toBe("점호 지각");
  });

  it("성공하면 메모를 돌려주지 않는다 — 부여한 뒤 칸은 비어야 한다", async () => {
    const state = await awardAction(INITIAL, awardForm({ note: "점호 지각" }));

    expect(state.note).toBeUndefined();
  });

  it("현재 학년도가 없으면 규정 문제로 안내하지 않는다", async () => {
    awardMerit.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toContain("현재 학년도가 없습니다");
  });

  // 명단 일괄 반영이 AcademicYear 잠금을 최대 120초 쥔다 — 그 사이 부여가 예산을
  // 넘기면 Prisma가 P2028을 준다. 폴백으로 새면 왜 막혔는지 화면에도 로그에도 안 남는다.
  it("트랜잭션이 예산을 넘기면 일시적 경합으로 안내하고 서버에 남긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    awardMerit.mockRejectedValueOnce(Object.assign(new Error("tx"), { code: "P2028" }));

    const state = await awardAction(INITIAL, awardForm());

    expect(state.error).toContain("다른 작업이 학년도를 쓰고 있습니다");
    expect(state.error).not.toBe("처리하지 못했습니다.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("메모는 트랜잭션 경합으로 실패해도 되살아난다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    awardMerit.mockRejectedValueOnce(Object.assign(new Error("tx"), { code: "P2028" }));

    const state = await awardAction(INITIAL, awardForm({ note: "복도 뛰어다님" }));

    expect(state.note).toBe("복도 뛰어다님");
    spy.mockRestore();
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

  it("실패하면 제출한 메모를 그대로 돌려준다", async () => {
    bulkAwardMerit.mockRejectedValueOnce(new MeritError("RULE_INACTIVE"));

    const state = await bulkAwardAction(INITIAL, bulkForm({ note: "점호 지각" }));

    expect(state.note).toBe("점호 지각");
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

  it("사유가 비면 서비스를 부르지 않는다", async () => {
    const state = await cancelAction(INITIAL, cancelForm({ reason: "   " }));

    expect(cancelAward).not.toHaveBeenCalled();
    expect(state.error).toBe("취소 사유를 입력해 주세요.");
  });

  it("함께 온 studentProfileId로 그 학생 화면을 다시 그린다", async () => {
    await cancelAction(INITIAL, cancelForm());

    expect(revalidatePath).toHaveBeenCalledWith("/merit/students/sp-1");
    expect(revalidatePath).toHaveBeenCalledWith("/merit/recent");
  });

  it("이미 취소된 기록은 그 이유를 알린다", async () => {
    cancelAward.mockRejectedValueOnce(new MeritError("ALREADY_CANCELLED"));

    const state = await cancelAction(INITIAL, cancelForm());

    expect(state.error).toBe("이미 취소된 기록입니다.");
  });
});

describe("exportClassRosterAction — 경계 검증", () => {
  it("조건이 맞으면 서비스까지 도달하고 결과를 그대로 넘긴다", async () => {
    const result = await exportClassRosterAction({
      grade: 2,
      classNo: 3,
      track: "DORM",
      year: 2026,
    });

    expect(exportClassRoster).toHaveBeenCalledWith(
      expect.anything(),
      { grade: 2, classNo: 3, track: "DORM", year: 2026 },
    );
    expect(result.error).toBeNull();
    expect(result.filename).toBe("2026_2학년3반_기숙사상벌점.xlsx");
  });

  it("학년도를 안 주면 서비스가 정하도록 넘기지 않는다", async () => {
    await exportClassRosterAction({ grade: 1, classNo: 1, track: "SCHOOL" });

    expect(exportClassRoster.mock.calls[0]?.[1].year).toBeUndefined();
    // 현재 학년도를 읽는 일도 서비스로 넘어갔다 — 액션은 이제 안 부른다.
    expect(getCurrentYear).not.toHaveBeenCalled();
  });

  it("범위 밖 학년은 서비스를 부르지 않는다", async () => {
    const result = await exportClassRosterAction({
      grade: 9,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(exportClassRoster).not.toHaveBeenCalled();
    expect(result.error).toBe("조회 조건을 확인해 주세요.");
  });

  it("현재 학년도가 없으면 파일 문제로 안내하지 않는다", async () => {
    exportClassRoster.mockRejectedValueOnce(
      new AcademicYearError("NO_CURRENT_YEAR"),
    );

    const result = await exportClassRosterAction({
      grade: 1,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(result.error).toContain("현재 학년도가 없습니다");
  });

  it("권한 거부를 파일 문제로 안내하지 않는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    exportClassRoster.mockRejectedValueOnce(new ForbiddenError("merit:read:any"));

    const result = await exportClassRosterAction({
      grade: 1,
      classNo: 1,
      track: "SCHOOL",
    });

    expect(result.error).toBe("이 작업을 할 권한이 없습니다.");
    // 정상적인 거부이므로 예상 못 한 오류로 서버 로그에 남지 않는다.
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("exportStudentHistoryAction — 경계 검증", () => {
  it("조건이 맞으면 서비스까지 도달한다", async () => {
    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-1",
      track: "SCHOOL",
      year: 2026,
    });

    expect(exportStudentHistory).toHaveBeenCalledWith(
      expect.anything(),
      { studentProfileId: "sp-1", track: "SCHOOL", year: 2026 },
    );
    expect(result.error).toBeNull();
    expect(result.filename).toBe("홍길동_교내상벌점_2026.xlsx");
  });

  it("학생 id가 비면 서비스를 부르지 않는다", async () => {
    const result = await exportStudentHistoryAction({
      studentProfileId: "",
      track: "SCHOOL",
    });

    expect(exportStudentHistory).not.toHaveBeenCalled();
    expect(result.error).toBe("조회 조건을 확인해 주세요.");
  });

  it("없는 학생이면 빈 파일을 만들지 않고 MESSAGES 문구로 알린다", async () => {
    exportStudentHistory.mockRejectedValueOnce(new MeritError("STUDENT_NOT_FOUND"));

    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-x",
      track: "SCHOOL",
    });

    expect(result.error).toContain("재학 중인 학생이 아닙니다");
    expect(result.rows).toEqual([]);
    expect(result.filename).toBe("");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    exportStudentHistory.mockRejectedValueOnce(new MeritError("SOME_NEW_CODE"));

    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-1",
      track: "SCHOOL",
    });

    expect(result.error).toBe("내보내지 못했습니다.");
  });

  it("권한 거부를 파일 문제로 안내하지 않는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    exportStudentHistory.mockRejectedValueOnce(new ForbiddenError("merit:read:any"));

    const result = await exportStudentHistoryAction({
      studentProfileId: "sp-1",
      track: "SCHOOL",
    });

    expect(result.error).toBe("이 작업을 할 권한이 없습니다.");
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("exportRecentAwardsAction — 경계 검증", () => {
  it("현재 필터를 검증해 서비스로 넘긴다", async () => {
    const result = await exportRecentAwardsAction({
      track: "DORM",
      kind: "DEMERIT",
      status: "CANCELLED",
      q: " 점호 ",
    });

    expect(exportRecentAwards).toHaveBeenCalledWith(expect.anything(), {
      track: "DORM",
      kind: "DEMERIT",
      status: "CANCELLED",
      q: "점호",
    });
    expect(result.filename).toBe("기숙사_최근부여.xlsx");
  });

  it("모르는 필터는 서비스를 부르지 않는다", async () => {
    const result = await exportRecentAwardsAction({
      track: "SCHOOL",
      kind: "BONUS" as "MERIT",
    });

    expect(exportRecentAwards).not.toHaveBeenCalled();
    expect(result.error).toBe("조회 조건을 확인해 주세요.");
  });

  it("권한 거부는 다운로드 실패가 아니라 권한 문제로 안내한다", async () => {
    exportRecentAwards.mockRejectedValueOnce(new ForbiddenError("merit:read:any"));

    const result = await exportRecentAwardsAction({ track: "SCHOOL" });

    expect(result.error).toBe("이 작업을 할 권한이 없습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await awardAction(INITIAL, awardForm({ ruleId: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
