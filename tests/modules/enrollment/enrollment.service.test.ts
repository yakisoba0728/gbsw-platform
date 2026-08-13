import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listByYear = vi.fn();
const applyChange = vi.fn();
const recordAudit = vi.fn();

class NumberTakenError extends Error {}

vi.mock("@/modules/enrollment/enrollment.repo", () => ({
  NumberTakenError,
  listByYear,
  applyChange,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const { EnrollmentError, listStudents, saveEnrollments } = await import(
  "@/modules/enrollment/enrollment.service"
);

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    mustChangePassword: false,
  };
}

const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

/** 현재 상태: 1학년 3반 3번, 재학 */
function current(overrides: Record<string, unknown> = {}) {
  return {
    studentProfileId: "sp-1",
    userId: "u-1",
    name: "김동혁",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    ...overrides,
  };
}

const unchanged = {
  studentProfileId: "sp-1",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED" as const,
};

beforeEach(() => {
  listByYear.mockReset().mockResolvedValue([current()]);
  applyChange.mockReset();
  recordAudit.mockReset();
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listStudents(student)).rejects.toThrow("FORBIDDEN");
    await expect(saveEnrollments(student, [unchanged])).rejects.toThrow("FORBIDDEN");
    expect(applyChange).not.toHaveBeenCalled();
  });
});

describe("saveEnrollments()", () => {
  it("바뀐 게 없으면 저장도 기록도 하지 않는다", async () => {
    const { saved } = await saveEnrollments(admin, [unchanged]);

    expect(saved).toBe(0);
    expect(applyChange).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("바뀐 학생만 저장한다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
    ]);

    const { saved } = await saveEnrollments(admin, [
      unchanged,
      { ...unchanged, studentProfileId: "sp-2", number: 9 },
    ]);

    expect(saved).toBe(1);
    expect(applyChange).toHaveBeenCalledTimes(1);
    expect(applyChange.mock.calls[0]![1].studentProfileId).toBe("sp-2");
  });

  it("학생 1명당 감사로그 1줄이고, 값이 아니라 항목 이름만 남긴다", async () => {
    await saveEnrollments(admin, [{ ...unchanged, classNo: 5 }]);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:update");
    expect(audit.targetId).toBe("sp-1");
    expect(audit.metadata.changed).toEqual(["classNo"]);
    // 새 반 번호(5)가 값으로 남으면 안 된다.
    expect(audit.metadata.classNo).toBeUndefined();
  });

  it("같은 저장에 속한 줄들은 같은 배치 식별자를 단다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", number: 4 }),
    ]);

    await saveEnrollments(admin, [
      { ...unchanged, number: 7 },
      { ...unchanged, studentProfileId: "sp-2", number: 8 },
    ]);

    const [a, b] = recordAudit.mock.calls.map((c) => c[0].metadata.batch);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("재학이면 반·번호가 있어야 한다", async () => {
    await expect(
      saveEnrollments(admin, [{ ...unchanged, classNo: null }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      saveEnrollments(admin, [{ ...unchanged, classNo: null }]),
    ).rejects.toThrow("INCOMPLETE_ENROLLED");
    expect(applyChange).not.toHaveBeenCalled();
  });

  it("재학이 아니면 반·번호를 지운다 — 졸업생에게 반은 의미가 없다", async () => {
    await saveEnrollments(admin, [
      { ...unchanged, status: "GRADUATED", grade: 1, classNo: 3, number: 3 },
    ]);

    const change = applyChange.mock.calls[0]![1];
    expect(change.grade).toBeNull();
    expect(change.classNo).toBeNull();
    expect(change.number).toBeNull();
  });

  it("재학이 아니게 되면 계정을 비활성으로 넘긴다", async () => {
    await saveEnrollments(admin, [{ ...unchanged, status: "WITHDRAWN" }]);

    expect(applyChange.mock.calls[0]![2]).toBe(false);
  });

  it("다시 재학이 되면 계정을 되살린다", async () => {
    listByYear.mockResolvedValue([current({ status: "DEFERRED" })]);

    await saveEnrollments(admin, [unchanged]);

    expect(applyChange.mock.calls[0]![2]).toBe(true);
  });

  it("같은 반 번호가 겹치면 우리 오류로 옮긴다", async () => {
    applyChange.mockRejectedValue(new NumberTakenError());

    await expect(
      saveEnrollments(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      saveEnrollments(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow("NUMBER_TAKEN");
  });

  it("명단에 없는 학생을 보내면 거부한다 — 클라이언트가 지어낸 id일 수 있다", async () => {
    await expect(
      saveEnrollments(admin, [{ ...unchanged, studentProfileId: "없음" }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      saveEnrollments(admin, [{ ...unchanged, studentProfileId: "없음" }]),
    ).rejects.toThrow("UNKNOWN_STUDENT");
    expect(applyChange).not.toHaveBeenCalled();
  });
});
