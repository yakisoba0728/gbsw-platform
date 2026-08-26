import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";

/**
 * 명단 표 저장·학년도 액션의 **경계**.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 화면이 실제로 보내는 name 그대로 만든다.
 * 출처: admin/students/student-table.tsx(`changes` JSON 문자열 + `year`) ·
 * year-switcher.tsx(현재로 지정 / 추가, 둘 다 `year` 하나).
 *
 * `changes`는 **JSON 문자열**이라 폼과 액션 사이에 모양 계약이 하나 더 있다 —
 * student-table.tsx가 실제로 만드는 객체 모양 그대로 세운다.
 */

// 목은 구현 없이 선언하고 기본값은 beforeEach에서 준다.
const requireAuth = vi.fn();
const revalidatePath = vi.fn();

const saveEnrollments = vi.fn();
const createYear = vi.fn();
const setCurrentYear = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/enrollment/enrollment.service", () => ({
  EnrollmentError: class EnrollmentError extends Error {
    detail?: string;
    constructor(code: string, detail?: string) {
      super(code);
      this.detail = detail;
    }
  },
  saveEnrollments,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  AcademicYearError: class AcademicYearError extends Error {},
  createYear,
  setCurrentYear,
}));

const { EnrollmentError } = await import(
  "@/modules/enrollment/enrollment.service"
);
const { AcademicYearError } = await import(
  "@/modules/academic-year/academic-year.service"
);
const { saveEnrollmentsAction, setCurrentYearAction, createYearAction } =
  await import("@/app/(app)/admin/students/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** student-table.tsx가 만드는 한 줄 그대로 — 빈 칸은 null로 접힌다. */
const CHANGE = {
  studentProfileId: "sp-1",
  expectedUpdatedAt: null,
  grade: 1,
  classNo: 2,
  number: 13,
  status: "ENROLLED",
};

function saveForm(over: Record<string, string> = {}): FormData {
  return form({
    changes: JSON.stringify([CHANGE]),
    year: "2026",
    ...over,
  });
}

const SAVE_INITIAL = { error: null, saved: null };
const YEAR_INITIAL = { error: null, ok: false };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  saveEnrollments.mockResolvedValue({ saved: 2 });
});

describe("saveEnrollmentsAction — 경계 검증", () => {
  it("표가 보내는 JSON 그대로면 서비스까지 도달한다", async () => {
    const state = await saveEnrollmentsAction(SAVE_INITIAL, saveForm());

    expect(saveEnrollments).toHaveBeenCalledWith(
      expect.anything(),
      [CHANGE],
      2026,
    );
    expect(state).toEqual({ error: null, saved: 2 });
  });

  it("빈 칸은 null로 온다 — 재학이 아닌 줄이 그대로 통과한다", async () => {
    const left = {
      studentProfileId: "sp-2",
      expectedUpdatedAt: null,
      grade: null,
      classNo: null,
      number: null,
      status: "WITHDRAWN",
    };

    const state = await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({ changes: JSON.stringify([left]) }),
    );

    expect(saveEnrollments).toHaveBeenCalledWith(expect.anything(), [left], 2026);
    expect(state.error).toBeNull();
  });

  it("재적 revision을 Date로 바꿔 서비스에 전달한다", async () => {
    const revision = "2026-08-19T01:02:03.000Z";

    await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({
        changes: JSON.stringify([{ ...CHANGE, expectedUpdatedAt: revision }]),
      }),
    );

    expect(saveEnrollments).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({ expectedUpdatedAt: new Date(revision) })],
      2026,
    );
  });

  it("바뀐 줄이 없으면 서비스를 부르지 않는다", async () => {
    const state = await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({ changes: "[]" }),
    );

    expect(saveEnrollments).not.toHaveBeenCalled();
    expect(state.error).toBe("바뀐 내용이 없습니다.");
  });

  it("JSON이 깨져 있으면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({ changes: "{not json" }),
    );

    expect(saveEnrollments).not.toHaveBeenCalled();
    expect(state.error).toBe("저장할 내용을 읽지 못했습니다.");
  });

  it("범위 밖 학년은 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({ changes: JSON.stringify([{ ...CHANGE, grade: 9 }]) }),
    );

    expect(saveEnrollments).not.toHaveBeenCalled();
    expect(state.error).toBe("학년은 1~3이어야 합니다.");
  });

  it("모르는 학적 상태는 서비스를 부르지 않는다", async () => {
    const state = await saveEnrollmentsAction(
      SAVE_INITIAL,
      saveForm({ changes: JSON.stringify([{ ...CHANGE, status: "휴학" }]) }),
    );

    expect(saveEnrollments).not.toHaveBeenCalled();
    expect(state.error).not.toBeNull();
  });

  it("학년도가 없으면 서비스를 부르지 않는다", async () => {
    const fd = saveForm();
    fd.delete("year");

    const state = await saveEnrollmentsAction(SAVE_INITIAL, fd);

    expect(saveEnrollments).not.toHaveBeenCalled();
    expect(state.error).not.toBeNull();
  });

  it("detail이 있는 오류는 사전 대신 그 문장을 그대로 보여준다", async () => {
    saveEnrollments.mockRejectedValueOnce(
      new EnrollmentError("NUMBER_TAKEN", "1학년 2반 13번은 홍길동이 쓰고 있습니다."),
    );

    const state = await saveEnrollmentsAction(SAVE_INITIAL, saveForm());

    expect(state.error).toBe("1학년 2반 13번은 홍길동이 쓰고 있습니다.");
  });

  it("detail이 없으면 코드별 고정 문구를 쓴다", async () => {
    saveEnrollments.mockRejectedValueOnce(new EnrollmentError("YEAR_MISMATCH"));

    const state = await saveEnrollmentsAction(SAVE_INITIAL, saveForm());

    expect(state.error).toBe("학년도가 바뀌었습니다. 새로고침 후 다시 저장해 주세요.");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    saveEnrollments.mockRejectedValueOnce(new EnrollmentError("SOME_NEW_CODE"));

    const state = await saveEnrollmentsAction(SAVE_INITIAL, saveForm());

    expect(state.error).toBe("저장하지 못했습니다.");
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await saveEnrollmentsAction(SAVE_INITIAL, saveForm({ changes: "[]" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("setCurrentYearAction — 경계 검증", () => {
  it("Select가 보내는 year 하나면 서비스까지 도달한다", async () => {
    const state = await setCurrentYearAction(YEAR_INITIAL, form({ year: "2026" }));

    expect(setCurrentYear).toHaveBeenCalledWith(expect.anything(), 2026);
    expect(state).toEqual({ error: null, ok: true });
  });

  it("범위 밖 학년도는 서비스를 부르지 않는다", async () => {
    const state = await setCurrentYearAction(YEAR_INITIAL, form({ year: "20226" }));

    expect(setCurrentYear).not.toHaveBeenCalled();
    expect(state.error).toBe("학년도가 올바르지 않습니다.");
  });

  it("숫자가 아니면 서비스를 부르지 않는다", async () => {
    const state = await setCurrentYearAction(YEAR_INITIAL, form({ year: "올해" }));

    expect(setCurrentYear).not.toHaveBeenCalled();
    expect(state.error).toBe("학년도가 올바르지 않습니다.");
  });
});

describe("createYearAction — 경계 검증", () => {
  it("Input이 보내는 year 하나면 서비스까지 도달한다", async () => {
    const state = await createYearAction(YEAR_INITIAL, form({ year: "2027" }));

    expect(createYear).toHaveBeenCalledWith(expect.anything(), 2027);
    expect(state).toEqual({ error: null, ok: true });
  });

  it("이미 있는 학년도는 그 이유를 알린다", async () => {
    createYear.mockRejectedValueOnce(new AcademicYearError("YEAR_TAKEN"));

    const state = await createYearAction(YEAR_INITIAL, form({ year: "2027" }));

    expect(state.error).toBe("이미 있는 학년도입니다.");
  });

  /*
   * 권한 거부·DB 장애가 "이미 있는 학년도입니다"로 보이면 안 된다 —
   * 관리자가 있지도 않은 학년도를 지우려 들게 된다.
   */
  it("권한 거부·장애를 중복인 것처럼 안내하지 않는다", async () => {
    createYear.mockRejectedValueOnce(new Error("FORBIDDEN"));

    const state = await createYearAction(YEAR_INITIAL, form({ year: "2027" }));

    expect(state.error).toBe("학년도를 만들지 못했습니다.");
  });

  it("범위 밖 학년도는 서비스를 부르지 않는다", async () => {
    const state = await createYearAction(YEAR_INITIAL, form({ year: "1999" }));

    expect(createYear).not.toHaveBeenCalled();
    expect(state.error).toBe("학년도가 올바르지 않습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await saveEnrollmentsAction(SAVE_INITIAL, saveForm({ changes: "[]" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});

/**
 * 권한 거부가 일반 폴백에 섞이면 안 된다 — 화면이 「저장하지 못했습니다」라고 하면
 * 권한이 없어서 막힌 사람이 일시적 장애로 알고 계속 다시 누른다.
 */
describe("권한 거부 문구", () => {
  it("표 저장은 일반 폴백과 다른 문구를 낸다", async () => {
    saveEnrollments.mockRejectedValue(new ForbiddenError("student:manage"));

    const state = await saveEnrollmentsAction(SAVE_INITIAL, saveForm());

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
    expect(state.error).not.toBe("저장하지 못했습니다.");
  });

  it("현재 학년도 변경도 일반 폴백과 다른 문구를 낸다", async () => {
    setCurrentYear.mockRejectedValue(new ForbiddenError("student:manage"));

    const fd = new FormData();
    fd.set("year", "2026");
    const state = await setCurrentYearAction({ error: null, ok: false }, fd);

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
  });
});

/**
 * 현재 학년도는 전교 집계 범위를 정하는 스위치 하나다. 화면에는 일반 문구만
 * 나가므로 서버 로그에도 안 남기면 왜 실패했는지가 어디에도 없다.
 */
describe("현재 학년도 변경 실패의 흔적", () => {
  it("정체불명 실패는 서버 로그에 남긴다", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    setCurrentYear.mockRejectedValue(new Error("연결이 끊겼습니다"));

    const fd = new FormData();
    fd.set("year", "2026");
    const state = await setCurrentYearAction({ error: null, ok: false }, fd);

    expect(state.error).toBe("현재 학년도를 바꾸지 못했습니다.");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
