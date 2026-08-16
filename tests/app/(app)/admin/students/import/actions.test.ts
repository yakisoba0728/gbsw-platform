import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 명단 업로드(미리보기·확정·내려받기) 액션의 **경계**.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 admin/students/import/import-form.tsx가 실제로 보내는 name 그대로
 * 만든다 — 미리보기는 `file` 하나, 확정은 `rows`·`year`·`confirmedDeletionIds`·
 * `deletionCount` 넷이다. 넷 중 셋이 **JSON 문자열 또는 빈 문자열**이라
 * 폼과 액션 사이에 모양 계약이 여럿 있고, 그중 하나만 어긋나도 확정이
 * 통째로 막힌다 — 최초 관리자 생성이 그렇게 100% 실패했다.
 */

const requireAuth = vi.fn(async () => ({ id: "admin-1", role: "ADMIN" }));
const revalidatePath = vi.fn();

const previewRoster = vi.fn(async () => ({
  year: 2026,
  rows: [],
  plan: null,
  notices: [],
}));
const applyRosterPlan = vi.fn(async () => ({
  saved: 2,
  deleted: 0,
  invites: [],
  excludedNewStudents: [],
}));
const exportRoster = vi.fn(async () => ({ year: 2026, rows: [] }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/enrollment/roster.service", () => ({
  RosterError: class RosterError extends Error {},
  previewRoster,
  applyRosterPlan,
  exportRoster,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  AcademicYearError: class AcademicYearError extends Error {},
}));

const { RosterError } = await import("@/modules/enrollment/roster.service");
const { AcademicYearError } = await import(
  "@/modules/academic-year/academic-year.service"
);
const { previewRosterAction, applyRosterAction, exportRosterAction } =
  await import("@/app/(app)/admin/students/import/actions");

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** roster.parse.ts가 미리보기에서 만들어 화면으로 보내는 한 줄 그대로. */
const ROW = {
  line: 2,
  studentCode: "ABCD2345",
  name: "홍길동",
  birthDate: "2010-03-02",
  grade: 1,
  classNo: 2,
  number: 13,
  status: "ENROLLED",
  errors: [],
};

/** import-form.tsx의 확정 폼이 보내는 네 필드 그대로. */
function applyForm(over: Record<string, string> = {}): FormData {
  return form({
    rows: JSON.stringify([ROW]),
    year: "2026",
    confirmedDeletionIds: "[]",
    // 임계 이하에서는 화면에 입력칸이 없어 빈 문자열이 온다 — 정상 경로다.
    deletionCount: "",
    ...over,
  });
}

const PREVIEW_INITIAL = {
  error: null,
  year: null,
  rows: [],
  plan: null,
  notices: [],
};
const APPLY_INITIAL = {
  error: null,
  saved: null,
  deleted: null,
  excludedNew: [],
  invites: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("previewRosterAction — 경계 검증", () => {
  it("파일을 고르면 서비스까지 도달한다", async () => {
    const file = new File(["학생코드,이름\n"], "명단.csv", { type: "text/csv" });

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).toHaveBeenCalledOnce();
    expect(previewRoster.mock.calls[0]?.[1].filename).toBe("명단.csv");
    expect(previewRoster.mock.calls[0]?.[1].buffer).toBeInstanceOf(Buffer);
    expect(state.error).toBeNull();
    expect(state.year).toBe(2026);
  });

  it("파일을 안 고르면 서비스를 부르지 않는다", async () => {
    const state = await previewRosterAction(PREVIEW_INITIAL, new FormData());

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일을 선택해 주세요.");
  });

  it("빈 파일은 서비스를 부르지 않는다", async () => {
    const file = new File([], "빈파일.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일을 선택해 주세요.");
  });

  it("5MB를 넘는 파일은 읽기 전에 막는다", async () => {
    const file = new File(["x".repeat(5 * 1024 * 1024 + 1)], "큰파일.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(previewRoster).not.toHaveBeenCalled();
    expect(state.error).toBe("파일이 너무 큽니다.");
  });

  it("현재 학년도가 없으면 파일 문제로 안내하지 않는다", async () => {
    previewRoster.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));
    const file = new File(["a"], "명단.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toContain("현재 학년도가 설정되어 있지 않습니다");
  });

  it("읽을 줄이 없으면 서식 파일을 안내한다", async () => {
    previewRoster.mockRejectedValueOnce(new RosterError("EMPTY"));
    const file = new File(["a"], "명단.csv");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toBe("읽을 수 있는 줄이 없습니다. 서식 파일을 받아 확인해 주세요.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    previewRoster.mockRejectedValueOnce(new Error("Corrupt zip"));
    const file = new File(["a"], "명단.xlsx");

    const state = await previewRosterAction(PREVIEW_INITIAL, form({ file }));

    expect(state.error).toBe("파일을 읽지 못했습니다.");
  });
});

describe("applyRosterAction — 경계 검증", () => {
  it("확정 폼이 보내는 네 필드 그대로면 서비스까지 도달한다", async () => {
    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(applyRosterPlan).toHaveBeenCalledWith(
      expect.anything(),
      2026,
      [ROW],
      [],
      null, // 빈 deletionCount는 "입력 안 함"이라 null로 접힌다
    );
    expect(state).toEqual({
      error: null,
      saved: 2,
      deleted: 0,
      excludedNew: [],
      invites: [],
    });
  });

  it("삭제를 확인하면 id 목록이 그대로 서비스에 닿는다", async () => {
    await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ confirmedDeletionIds: JSON.stringify(["sp-9", "sp-10"]) }),
    );

    expect(applyRosterPlan.mock.calls[0]?.[3]).toEqual(["sp-9", "sp-10"]);
  });

  it("대량 삭제 확인 건수를 숫자로 넘긴다", async () => {
    await applyRosterAction(APPLY_INITIAL, applyForm({ deletionCount: "42" }));

    expect(applyRosterPlan.mock.calls[0]?.[4]).toBe(42);
  });

  it("건수 칸에 숫자가 아닌 값이 오면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ deletionCount: "마흔둘" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("삭제할 인원 수를 정확히 입력해 주세요.");
  });

  /*
   * 미리보기가 돌려준 값을 그대로 믿지 않는다 (I3) — errors를 지워 보내거나
   * status/학년·반·번호 조합을 조작한 요청이 여기서 막혀야 한다.
   */
  it("재학인데 자리가 비어 있으면 서비스를 부르지 않는다", async () => {
    const tampered = { ...ROW, grade: null, classNo: null, number: null, errors: [] };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("재학이면 학년·반·번호가 모두 있어야 합니다.");
  });

  it("학생코드 형식이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const tampered = { ...ROW, studentCode: "1234" };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([tampered]) }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("학생코드 형식이 올바르지 않습니다.");
  });

  it("빈 학생코드는 신규 학생이라 통과한다", async () => {
    const fresh = { ...ROW, studentCode: "" };

    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: JSON.stringify([fresh]) }),
    );

    expect(applyRosterPlan).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
  });

  it("rows JSON이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ rows: "{not json" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("반영할 내용을 읽지 못했습니다.");
  });

  it("삭제 확인 JSON이 깨져 있으면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(
      APPLY_INITIAL,
      applyForm({ confirmedDeletionIds: "{not json" }),
    );

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("삭제 확인 정보를 읽지 못했습니다.");
  });

  it("학년도가 범위 밖이면 서비스를 부르지 않는다", async () => {
    const state = await applyRosterAction(APPLY_INITIAL, applyForm({ year: "1999" }));

    expect(applyRosterPlan).not.toHaveBeenCalled();
    expect(state.error).toBe("학년도가 올바르지 않습니다.");
  });

  /*
   * 서비스가 애써 돌려준 excludedNewStudents를 액션이 구조분해에서 빠뜨리면
   * 화면까지 닿지 않는다 — 관리자는 안 만들어진 계정을 만들어졌다고 믿는다.
   */
  it("계정이 안 만들어진 신규 줄을 화면까지 전달한다", async () => {
    applyRosterPlan.mockResolvedValueOnce({
      saved: 3,
      deleted: 1,
      invites: [{ code: "GBSWAAAA1111" }],
      excludedNewStudents: [{ line: 7, name: "김철수" }],
    });

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.excludedNew).toEqual([{ line: 7, name: "김철수" }]);
    expect(state.invites).toHaveLength(1);
    expect(state.deleted).toBe(1);
  });

  it("삭제 대상이 바뀌었으면 다시 확인하라고 안내한다", async () => {
    applyRosterPlan.mockRejectedValueOnce(new RosterError("DELETION_SET_CHANGED"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.error).toBe("삭제 대상이 바뀌었습니다. 다시 확인해 주세요.");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    applyRosterPlan.mockRejectedValueOnce(new RosterError("SOME_NEW_CODE"));

    const state = await applyRosterAction(APPLY_INITIAL, applyForm());

    expect(state.error).toBe("반영하지 못했습니다.");
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await applyRosterAction(APPLY_INITIAL, applyForm({ rows: "{not json" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("exportRosterAction — 경계 검증", () => {
  it("인수 없이 부르면 서비스까지 도달한다", async () => {
    const result = await exportRosterAction();

    expect(exportRoster).toHaveBeenCalledOnce();
    expect(result).toEqual({ error: null, year: 2026, rows: [] });
  });

  it("현재 학년도가 없으면 그 이유를 알린다", async () => {
    exportRoster.mockRejectedValueOnce(new AcademicYearError("NO_CURRENT_YEAR"));

    const result = await exportRosterAction();

    expect(result.error).toContain("현재 학년도가 설정되어 있지 않습니다");
  });

  it("예상 못 한 오류는 영문을 화면에 흘리지 않는다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    exportRoster.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const result = await exportRosterAction();

    expect(result.error).toBe("명단을 내려받지 못했습니다.");
    // 화면에는 일반 문구만 나가므로 서버 로그에는 남겨야 한다.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await previewRosterAction(PREVIEW_INITIAL, new FormData());

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
