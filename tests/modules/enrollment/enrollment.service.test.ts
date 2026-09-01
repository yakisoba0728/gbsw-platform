import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const listByYear = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const findCurrentYear = vi.fn();
const applyAll = vi.fn();
const findStudentDetail = vi.fn();
const {
  recordAudit,
  txClient,
  bareWithTransaction: withTransaction,
} = coreMocks("enrollment-service-test");

class NumberTakenError extends Error {}

vi.mock("@/modules/enrollment/enrollment.repo", () => ({
  NumberTakenError,
  findCurrentYearForUpdate,
  findCurrentYear,
  listByYear,
  applyAll,
  findStudentDetail,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const {
  EnrollmentError,
  listStudents,
  saveEnrollments,
  getStudentIdentity,
  getStudentProfile,
} = await import("@/modules/enrollment/enrollment.service");

const YEAR = 2026;

const admin = user("ADMIN", "admin-1");
const student = user("STUDENT", "s-1");
const parent = user("PARENT", "p-1");

/** 현재 상태: 1학년 3반 3번, 재학, 계정 활성 */
function current(overrides: Record<string, unknown> = {}) {
  return {
    studentProfileId: "sp-1",
    userId: "u-1",
    name: "김동혁",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    accountActive: true,
    ...overrides,
  };
}

const unchanged = {
  studentProfileId: "sp-1",
  expectedUpdatedAt: null,
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED" as const,
};

/** saveEnrollments 호출을 줄이는 헬퍼 — 현재 학년도(2026)를 기본으로 넘긴다. */
function save(actor: SessionUser, changes: Parameters<typeof saveEnrollments>[1]) {
  return saveEnrollments(actor, changes, YEAR);
}

beforeEach(() => {
  findCurrentYearForUpdate.mockReset().mockResolvedValue(YEAR);
  findCurrentYear.mockReset().mockResolvedValue(YEAR);
  listByYear.mockReset().mockResolvedValue([current()]);
  applyAll.mockReset().mockResolvedValue(undefined);
  findStudentDetail.mockReset();
  recordAudit.mockReset();
  withTransaction.mockReset().mockImplementation(async (fn: (tx: typeof txClient) => unknown) =>
    fn(txClient),
  );
});

describe("권한", () => {
  it("관리자가 아니면 아무것도 못 한다", async () => {
    await expect(listStudents(student)).rejects.toThrow("FORBIDDEN");
    await expect(save(student, [unchanged])).rejects.toThrow("FORBIDDEN");
    expect(applyAll).not.toHaveBeenCalled();
  });
});

describe("학년도 대조 (C2)", () => {
  it("렌더 시점 학년도와 지금의 현재 학년도가 다르면 저장 전에 거부한다", async () => {
    await expect(
      saveEnrollments(admin, [{ ...unchanged, classNo: 5 }], 2027),
    ).rejects.toThrow("YEAR_MISMATCH");
    expect(listByYear).not.toHaveBeenCalled();
    expect(applyAll).not.toHaveBeenCalled();
  });
});

describe("saveEnrollments()", () => {
  it("화면이 읽은 재적 revision이 바뀌었으면 최신 값을 덮지 않는다", async () => {
    const latest = new Date("2026-08-19T01:00:00.000Z");
    listByYear.mockResolvedValue([current({ enrollmentUpdatedAt: latest })]);

    await expect(
      save(admin, [{ ...unchanged, expectedUpdatedAt: null, number: 9 }]),
    ).rejects.toThrow("ENROLLMENT_CHANGED");

    expect(applyAll).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("Serializable 충돌은 새로고침 가능한 업무 충돌로 옮긴다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), {
      code: "P2034",
    }));

    await expect(save(admin, [{ ...unchanged, number: 9 }])).rejects.toThrow(
      "ENROLLMENT_CHANGED",
    );
  });

  /**
   * 드라이버 어댑터를 거친 40001은 P2010 안에 싸여 온다. P2034만 보던 시절에는
   * 이 모양이 그대로 위로 던져져 화면에 「저장하지 못했습니다」만 떴다.
   */
  it("어댑터가 P2010으로 싸서 준 40001도 같은 업무 충돌로 옮긴다", async () => {
    withTransaction.mockRejectedValue(
      Object.assign(new Error("adapter"), {
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
      }),
    );

    await expect(save(admin, [{ ...unchanged, number: 9 }])).rejects.toThrow(
      "ENROLLMENT_CHANGED",
    );
  });

  /**
   * 무엇과 부딪쳤는지로 문구가 갈린다. 학년도 전환과 부딪친 것을 「다른 교사가
   * 학생 정보를 바꿨습니다」라고 하면 틀린 말이고, 새로고침해도 같은 자리에서 막힌다.
   */
  it("학년도 전환과 부딪친 충돌은 YEAR_MISMATCH로 옮긴다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), {
      code: "P2034",
    }));
    findCurrentYear.mockResolvedValue(YEAR + 1);

    await expect(save(admin, [{ ...unchanged, number: 9 }])).rejects.toThrow(
      "YEAR_MISMATCH",
    );
  });

  it("바뀐 게 없으면 저장도 기록도 하지 않는다", async () => {
    const { saved } = await save(admin, [unchanged]);

    expect(saved).toBe(0);
    expect(applyAll).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("바뀐 학생만 골라 한 번의 applyAll 호출로 저장한다 (C1 — 학생마다 트랜잭션을 나누지 않는다)", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
    ]);

    const { saved } = await save(admin, [
      unchanged,
      { ...unchanged, studentProfileId: "sp-2", number: 9 },
    ]);

    expect(saved).toBe(1);
    expect(applyAll).toHaveBeenCalledTimes(1);
    const items = applyAll.mock.calls[0]![1];
    expect(items).toHaveLength(1);
    expect(items[0].studentProfileId).toBe("sp-2");
    expect(applyAll.mock.calls[0]![0]).toBe(YEAR);
    expect(applyAll.mock.calls[0]![2]).toBe(txClient);
  });

  it("여러 명이 한꺼번에 바뀌어도 applyAll은 배열 하나로 한 번만 호출한다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
      current({ studentProfileId: "sp-3", userId: "u-3", name: "박학생", number: 5 }),
    ]);

    await save(admin, [
      { ...unchanged, classNo: 2 },
      { ...unchanged, studentProfileId: "sp-2", number: 4, classNo: 2 },
      { ...unchanged, studentProfileId: "sp-3", number: 5, classNo: 2 },
    ]);

    expect(applyAll).toHaveBeenCalledTimes(1);
    expect(applyAll.mock.calls[0]![1]).toHaveLength(3);
  });

  it("학생 1명당 감사로그 1줄이고, 값이 아니라 항목 이름만 남긴다", async () => {
    await save(admin, [{ ...unchanged, classNo: 5 }]);

    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 5_000,
      isolationLevel: "Serializable",
    });
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:update");
    expect(audit.targetId).toBe("sp-1");
    expect(audit.metadata.changed).toEqual(["classNo"]);
    // 새 반 번호(5)가 값으로 남으면 안 된다.
    expect(audit.metadata.classNo).toBeUndefined();
  });

  it("actorName을 미리 넘겨 배치 저장이 매번 이름을 다시 조회하지 않게 한다 (M8)", async () => {
    await save(admin, [{ ...unchanged, classNo: 5 }]);

    expect(recordAudit.mock.calls[0]![0].actorName).toBe(admin.name);
  });

  it("같은 저장에 속한 줄들은 같은 배치 식별자를 단다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", number: 4 }),
    ]);

    await save(admin, [
      { ...unchanged, number: 7 },
      { ...unchanged, studentProfileId: "sp-2", number: 8 },
    ]);

    const [a, b] = recordAudit.mock.calls.map((c) => c[0].metadata.batch);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });

  it("실패하면 감사로그는 하나도 남기지 않는다 — 커밋 후에만 기록한다 (C1)", async () => {
    applyAll.mockRejectedValue(new Error("DB 장애"));

    await expect(save(admin, [{ ...unchanged, number: 9 }])).rejects.toThrow(
      "DB 장애",
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("재학이면 반·번호가 있어야 한다", async () => {
    await expect(
      save(admin, [{ ...unchanged, classNo: null }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      save(admin, [{ ...unchanged, classNo: null }]),
    ).rejects.toThrow("INCOMPLETE_ENROLLED");
    expect(applyAll).not.toHaveBeenCalled();
  });

  it("재학이 아니면 반·번호를 지운다 — 졸업생에게 반은 의미가 없다", async () => {
    await save(admin, [
      { ...unchanged, status: "GRADUATED", grade: 1, classNo: 3, number: 3 },
    ]);

    const item = applyAll.mock.calls[0]![1][0];
    expect(item.grade).toBeNull();
    expect(item.classNo).toBeNull();
    expect(item.number).toBeNull();
  });

  it("같은 반 번호가 겹치면 우리 오류로 옮긴다 (사전 검사를 빠져나간 경합에 대한 backstop)", async () => {
    applyAll.mockRejectedValue(new NumberTakenError());

    await expect(
      save(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      save(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow("NUMBER_TAKEN");
  });

  it("명단에 없는 학생을 보내면 거부한다 — 클라이언트가 지어낸 id일 수 있다", async () => {
    await expect(
      save(admin, [{ ...unchanged, studentProfileId: "없음" }]),
    ).rejects.toThrow(EnrollmentError);
    await expect(
      save(admin, [{ ...unchanged, studentProfileId: "없음" }]),
    ).rejects.toThrow("UNKNOWN_STUDENT");
    expect(applyAll).not.toHaveBeenCalled();
  });
});

describe("(grade, classNo, number) 충돌 사전 검사 (C1)", () => {
  it("배치 내부에서 두 학생이 같은 자리로 옮기면 이름과 함께 반려한다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
    ]);

    const conflict = [
      { ...unchanged, number: 9 },
      { ...unchanged, studentProfileId: "sp-2", number: 9 },
    ];

    await expect(save(admin, conflict)).rejects.toThrow("ENROLLMENT_CONFLICT");
    try {
      await save(admin, conflict);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnrollmentError);
      expect((error as InstanceType<typeof EnrollmentError>).detail).toContain("김동혁");
      expect((error as InstanceType<typeof EnrollmentError>).detail).toContain("이학생");
    }
    expect(applyAll).not.toHaveBeenCalled();
  });

  it("저장하지 않는 기존 학생의 자리로 옮기면 반려한다", async () => {
    listByYear.mockResolvedValue([
      current(),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 9 }),
    ]);

    await expect(
      save(admin, [{ ...unchanged, number: 9 }]),
    ).rejects.toThrow("ENROLLMENT_CONFLICT");
    expect(applyAll).not.toHaveBeenCalled();
  });

  it("번호 교환(A↔B)은 둘 다 배치에 있어도 반려한다 — 단일 트랜잭션으로도 못 푸는 문제다", async () => {
    listByYear.mockResolvedValue([
      current({ number: 3 }),
      current({ studentProfileId: "sp-2", userId: "u-2", name: "이학생", number: 4 }),
    ]);

    await expect(
      save(admin, [
        { ...unchanged, number: 4 },
        { ...unchanged, studentProfileId: "sp-2", number: 3 },
      ]),
    ).rejects.toThrow("ENROLLMENT_CONFLICT");
    expect(applyAll).not.toHaveBeenCalled();
  });

  it("같은 학생이 자기 자리를 유지하는 건 충돌이 아니다", async () => {
    // status만 바뀌고 반·번호는 그대로 — 자기 자신과 겹치는 걸로 오판하면 안 된다.
    listByYear.mockResolvedValue([current({ status: "DEFERRED" })]);

    await expect(save(admin, [unchanged])).resolves.toEqual({ saved: 1 });
  });
});

describe("계정 상태 (I1 · I2)", () => {
  it("학적(status)이 안 바뀌면 번호만 고쳐도 계정을 건드리지 않는다 (I1)", async () => {
    // 관리자가 /admin/users에서 잠가 둔 재학생 — 번호만 고친다.
    listByYear.mockResolvedValue([current({ accountActive: false })]);

    await save(admin, [{ ...unchanged, number: 9 }]);

    const item = applyAll.mock.calls[0]![1][0];
    expect(item.statusChanged).toBe(false);
    // 잠긴 계정이 조용히 풀리면 안 되므로 활성화 감사로그도 없어야 한다.
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![0].action).toBe("enrollment:update");
  });

  it("재학이 아니게 되면 계정을 비활성으로 넘기고 statusChanged를 알린다", async () => {
    await save(admin, [{ ...unchanged, status: "WITHDRAWN" }]);

    const item = applyAll.mock.calls[0]![1][0];
    expect(item.accountActive).toBe(false);
    expect(item.statusChanged).toBe(true);
  });

  it("다시 재학이 되면 계정을 되살린다", async () => {
    listByYear.mockResolvedValue([current({ status: "DEFERRED", accountActive: false })]);

    await save(admin, [unchanged]);

    const item = applyAll.mock.calls[0]![1][0];
    expect(item.accountActive).toBe(true);
    expect(item.statusChanged).toBe(true);
  });

  it("계정 상태가 실제로 뒤집힐 때 admin-users와 같은 형식으로 감사로그를 한 줄 더 남긴다 (I2)", async () => {
    await save(admin, [{ ...unchanged, status: "WITHDRAWN" }]);

    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: "enrollment:update", targetId: "sp-1" }),
      txClient,
    );
    expect(recordAudit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        action: "user:deactivate",
        targetType: "User",
        targetId: "u-1",
      }),
      txClient,
    );
  });

  it("활성 상태가 실제로 안 뒤집히면 계정 감사로그를 더 남기지 않는다", async () => {
    // WITHDRAWN → GRADUATED. 학적은 바뀌지만 둘 다 비활성이라 실제로 뒤집히지 않는다.
    listByYear.mockResolvedValue([current({ status: "WITHDRAWN", accountActive: false })]);

    await save(admin, [{ ...unchanged, status: "GRADUATED" }]);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![0].action).toBe("enrollment:update");
  });
});

describe("자기 계정 (I3)", () => {
  it("자기 자신을 비재학으로 바꾸는 저장은 거부한다", async () => {
    // set-role로 승격된 관리자 — StudentProfile이 남아 표에 보일 수 있다.
    listByYear.mockResolvedValue([current({ userId: admin.id })]);

    await expect(
      save(admin, [{ ...unchanged, status: "GRADUATED" }]),
    ).rejects.toThrow("CANNOT_DEACTIVATE_SELF");
    expect(applyAll).not.toHaveBeenCalled();
  });

  it("자기 자신의 반·번호만 고치는 건 막지 않는다", async () => {
    listByYear.mockResolvedValue([current({ userId: admin.id })]);

    await expect(
      save(admin, [{ ...unchanged, number: 9 }]),
    ).resolves.toEqual({ saved: 1 });
  });
});

describe("중복 제거 (M5)", () => {
  it("같은 studentProfileId가 두 번 오면 한 번만 처리하고 마지막 값을 쓴다", async () => {
    await save(admin, [
      { ...unchanged, number: 7 },
      { ...unchanged, number: 8 },
    ]);

    expect(applyAll).toHaveBeenCalledTimes(1);
    const items = applyAll.mock.calls[0]![1];
    expect(items).toHaveLength(1);
    expect(items[0].number).toBe(8);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });
});

/**
 * 학생 상세(`/students/<id>`)의 문 둘. 머리글은 **셋 중 하나**로 열리고
 * (`can()` 하나로는 못 가르는 규칙이라 서비스가 손으로 세웠다), 「학생 정보」
 * 탭은 `student:manage` 하나로만 열린다.
 */
describe("학생 상세", () => {
  /** repo가 주는 행 — 머리글이 쓰지 않는 생년월일·이메일까지 들어 있다. */
  const detail = {
    studentProfileId: "sp-1",
    studentCode: "20260101",
    name: "김동혁",
    role: "STUDENT",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    removed: false,
    birthDate: new Date("2010-03-02"),
    email: "donghyeok@gbsw.hs.kr",
  };

  const denied: [string, SessionUser][] = [
    ["학생", student],
    ["학부모", parent],
  ];

  beforeEach(() => {
    findStudentDetail.mockResolvedValue(detail);
  });

  it("교사는 머리글을 읽는다 — 현재 학년도를 함께 넘긴다", async () => {
    await expect(getStudentIdentity(admin, "sp-1")).resolves.toMatchObject({
      name: "김동혁",
      grade: 1,
      classNo: 3,
    });
    expect(findStudentDetail).toHaveBeenCalledWith("sp-1", YEAR);
  });

  // 머리글은 이름·소속까지다. 그 둘은 「학생 정보」 탭의 내용이고 권한이 다르다.
  it("머리글에는 생년월일·이메일이 실리지 않는다", async () => {
    const identity = await getStudentIdentity(admin, "sp-1");

    expect(identity).not.toHaveProperty("birthDate");
    expect(identity).not.toHaveProperty("email");
    expect(JSON.stringify(identity)).not.toContain("donghyeok");
  });

  it("없는 학생이면 null이다", async () => {
    findStudentDetail.mockResolvedValue(null);
    await expect(getStudentIdentity(admin, "sp-9")).resolves.toBeNull();
  });

  it.each(denied)(
    "%s는 셋 중 아무 권한도 없어 머리글도 못 본다",
    async (_label, actor) => {
      await expect(getStudentIdentity(actor, "sp-1")).rejects.toThrow("FORBIDDEN");

      // 거부가 repo보다 먼저다 — 뒤로 가면 이름·학급이 이미 읽힌 뒤가 된다.
      expect(findStudentDetail).not.toHaveBeenCalled();
      expect(recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "authz:denied",
          targetType: "StudentProfile",
        }),
      );
    },
  );

  it.each(denied)("%s는 「학생 정보」 탭도 못 연다", async (_label, actor) => {
    await expect(getStudentProfile(actor, "sp-1")).rejects.toThrow("FORBIDDEN");
    expect(findStudentDetail).not.toHaveBeenCalled();
  });

  it("교사의 「학생 정보」 탭에는 생년월일·이메일이 그대로 있다", async () => {
    await expect(getStudentProfile(admin, "sp-1")).resolves.toBe(detail);
  });
});
