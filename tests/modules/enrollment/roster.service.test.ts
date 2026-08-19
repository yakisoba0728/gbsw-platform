import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { ROSTER_COLUMNS, ROSTER_INFO_COLUMNS } from "@/modules/enrollment/roster.export";

const listExisting = vi.fn();
const applyRoster = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const findCurrentYear = vi.fn();
const recordAudit = vi.fn();
const generateUniqueCode = vi.fn();
const toExpiresAt = vi.fn();
const withTransaction = vi.fn();
const txClient = { tx: true };

/** roster.repo.ts의 실물과 이름·상속만 같은 자리표시자. instanceof로 구분한다. */
class InviteCodeCollisionError extends Error {}

vi.mock("@/modules/enrollment/roster.repo", () => ({
  listExisting,
  applyRoster,
  findCurrentYearForUpdate,
  findCurrentYear,
  InviteCodeCollisionError,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));
vi.mock("@/modules/invites/invite.service", () => ({ generateUniqueCode, toExpiresAt }));

// RosterError는 이 테스트에서 쓰지 않는다 — 던지는 메시지는 toThrow()로 문자열째 확인한다.
const { applyRosterPlan, createRosterFingerprint, exportRoster } = await import(
  "@/modules/enrollment/roster.service"
);

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return {
    id,
    name: "테스트",
    email: "t@gbsw.hs.kr",
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}
const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

const 재학생 = {
  studentProfileId: "sp-1",
  userId: "u-1",
  studentCode: "AAAA2345",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
  hasGraduatedEnrollment: false,
  accountActive: true,
};

function fingerprint(
  existing: Parameters<typeof createRosterFingerprint>[0] = [재학생],
): string {
  return createRosterFingerprint(existing);
}

// 기본값은 재학생과 같은 학생코드다 — listExisting이 기본으로 돌려주는 [재학생]과
// 이어붙는다. existing을 []로 두는 테스트는 studentCode를 ""로 덮어써 신규로 만든다.
const row = {
  line: 2,
  studentCode: "AAAA2345",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 5,
  number: 7,
  status: "ENROLLED" as const,
  errors: [],
};

/** M-1 방어(rows.length===0) 때문에 삭제만 테스트하려고 rows를 통째로 비울 수 없다 —
 * 삭제 대상과 무관한 신규 학생 한 줄을 채워 rows를 비지 않게 하면서도 missingFromFile
 * 계산에는 영향을 주지 않는다. 이름·생년월일을 재학생과 다르게 둬야 "코드가 지워진
 * 것 같다" 상관관계(roster.plan.ts)에 걸려 needsAttention으로 새지 않는다. */
const 무관한신규줄 = {
  line: 2,
  studentCode: "",
  name: "새학생",
  birthDate: "2012-01-01",
  grade: 1,
  classNo: 1,
  number: 1,
  status: "ENROLLED" as const,
  errors: [],
};

let codeCounter = 0;

beforeEach(() => {
  listExisting.mockReset().mockResolvedValue([재학생]);
  applyRoster.mockReset().mockResolvedValue({ invites: [], revokedInvites: [] });
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  findCurrentYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset();
  withTransaction.mockReset().mockImplementation(async (fn: (tx: typeof txClient) => unknown) =>
    fn(txClient),
  );
  codeCounter = 0;
  generateUniqueCode.mockReset().mockImplementation(async () => `GBSWCODE${++codeCounter}`);
  toExpiresAt.mockReset().mockReturnValue(new Date("2099-01-01"));
});

describe("applyRosterPlan()", () => {
  it("관리자가 아니면 반영하지 못한다", async () => {
    await expect(applyRosterPlan(student, 2026, [row], fingerprint(), [], null)).rejects.toThrow("FORBIDDEN");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("학년도가 그 사이 바뀌었으면 거부한다", async () => {
    await expect(applyRosterPlan(admin, 2025, [row], fingerprint(), [], null)).rejects.toThrow("YEAR_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("빈 행이면 서비스가 거부한다", async () => {
    await expect(applyRosterPlan(admin, 2026, [], fingerprint(), [], null)).rejects.toThrow("EMPTY_ROWS");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("확정을 막아야 하는 명단이면 아무것도 쓰지 않는다", async () => {
    const bad = { ...row, errors: ["생년월일을 읽을 수 없습니다."] };

    await expect(applyRosterPlan(admin, 2026, [bad], fingerprint(), [], null)).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("클라이언트가 보낸 행을 다시 분류한다 — 미리보기 결과를 믿지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    // 미리보기 때와 같은 현재 상태를 서버가 다시 읽어야 한다.
    expect(listExisting).toHaveBeenCalledWith(2026);
  });

  it("반영하고 요약을 감사로그에 남긴다 — 값이 아니라 건수만", async () => {
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 120_000,
      maxWait: 10_000,
      isolationLevel: "Serializable",
    });
    expect(applyRoster.mock.calls[0]![2]).toBe(txClient);
    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(recordAudit.mock.calls[0]![1]).toBe(txClient);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:import");
    expect(audit.metadata).toMatchObject({ year: 2026, reassign: 1 });
    // 학생 이름이 로그에 남으면 감사로그가 개인정보 사본이 된다.
    expect(JSON.stringify(audit)).not.toContain("김동혁");
  });

  it("트랜잭션 락을 잡은 뒤 현재 학년도가 바뀐 것을 다시 확인한다", async () => {
    findCurrentYearForUpdate.mockResolvedValue(2027);

    await expect(applyRosterPlan(admin, 2026, [row], fingerprint(), [], null)).rejects.toThrow("YEAR_CHANGED");

    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("Serializable 학년도 전환 충돌은 YEAR_CHANGED로 돌려준다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));
    findCurrentYear.mockResolvedValue(2027);

    await expect(applyRosterPlan(admin, 2026, [row], fingerprint(), [], null)).rejects.toThrow("YEAR_CHANGED");

    expect(findCurrentYear).toHaveBeenCalled();
  });

  it("Serializable 명단 충돌은 ROSTER_CHANGED로 돌려준다", async () => {
    withTransaction.mockRejectedValue(Object.assign(new Error("write conflict"), { code: "P2034" }));
    findCurrentYear.mockResolvedValue(2026);

    await expect(applyRosterPlan(admin, 2026, [row], fingerprint(), [], null)).rejects.toThrow("ROSTER_CHANGED");
  });

  it("신규 학생 수만큼 초대코드를 만들어 돌려준다", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockResolvedValue({
      invites: [{ name: "김동혁", code: "GBSWCODE1", grade: 1, classNo: 5, number: 7 }],
      revokedInvites: [],
    });

    const newRow = { ...row, studentCode: "" };
    const result = await applyRosterPlan(admin, 2026, [newRow], fingerprint([]), [], null);

    expect(result.invites).toHaveLength(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);
  });

  it("발급 코드에 기본 만료를 둔다 — 종이로 나눠주는 코드를 무기한으로 두지 않는다", async () => {
    listExisting.mockResolvedValue([]);
    const expires = new Date("2099-05-01");
    toExpiresAt.mockReturnValue(expires);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow], fingerprint([]), [], null);

    expect(applyRoster.mock.calls[0]![1].inviteExpiresAt).toBe(expires);
    expect(toExpiresAt).toHaveBeenCalledWith(expect.any(Number));
  });

  it("재학인 신규 학생만 초대코드 대상이다", async () => {
    listExisting.mockResolvedValue([]);

    const 재학신규 = { ...row, studentCode: "", name: "재학이", birthDate: "2011-01-01" };
    const 비재학신규 = {
      ...row,
      studentCode: "",
      name: "유예생",
      birthDate: "2011-02-02",
      status: "DEFERRED" as const,
      grade: null,
      classNo: null,
      number: null,
    };

    await applyRosterPlan(admin, 2026, [재학신규, 비재학신규], fingerprint([]), [], null);

    const newStudents = applyRoster.mock.calls[0]![1].newStudents;
    expect(newStudents).toHaveLength(1);
    expect(newStudents[0].row.name).toBe("재학이");
  });

  describe("비재학 신규 줄은 흔적 없이 버려지지 않는다", () => {
    /** 미리보기는 "신규 2"로 세는데 확정하면 계정도 코드도 안 생기는 줄. */
    function 신규줄들() {
      listExisting.mockResolvedValue([]);
      const 재학신규 = { ...row, studentCode: "", name: "재학이", birthDate: "2011-01-01" };
      const 비재학신규 = {
        ...row,
        studentCode: "",
        name: "유예생",
        birthDate: "2011-02-02",
        status: "DEFERRED" as const,
        grade: null,
        classNo: null,
        number: null,
      };
      return [재학신규, 비재학신규];
    }

    it("반영 결과에 제외된 줄을 어느 줄인지까지 실어 돌려준다", async () => {
      const result = await applyRosterPlan(admin, 2026, 신규줄들(), fingerprint([]), [], null);

      expect(result.excludedNewStudents).toEqual([
        { line: 2, name: "유예생", status: "DEFERRED" },
      ]);
    });

    it("전부 재학이면 제외 목록은 빈 배열이다", async () => {
      listExisting.mockResolvedValue([]);
      const 재학신규 = { ...row, studentCode: "", name: "재학이", birthDate: "2011-01-01" };

      const result = await applyRosterPlan(admin, 2026, [재학신규], fingerprint([]), [], null);

      expect(result.excludedNewStudents).toEqual([]);
    });

    it("감사로그 metadata에도 제외 건수가 남는다 — 화면은 한 번 보고 사라지지만 " +
      "로그는 남는다", async () => {
      await applyRosterPlan(admin, 2026, 신규줄들(), fingerprint([]), [], null);

      const summary = recordAudit.mock.calls
        .map((c) => c[0])
        .find((a) => a.action === "enrollment:import");
      expect(summary!.metadata).toMatchObject({ newStudents: 2, excludedNew: 1 });
      // 이름은 여전히 안 남긴다 — 감사로그가 명단 사본이 되면 안 된다.
      expect(JSON.stringify(summary)).not.toContain("유예생");
    });
  });

  it("학적이 안 바뀐 학생은 statusChanged=false로 넘어간다 (C1 회귀 방지)", async () => {
    // row가 재학생과 같은 학생코드·자리면 untouched로 분류된다.
    const 그대로 = { ...row, grade: 1, classNo: 3, number: 3 };

    await applyRosterPlan(admin, 2026, [그대로], fingerprint(), [], null);

    const assignments = applyRoster.mock.calls[0]![1].assignments;
    const mine = assignments.find((a: { studentProfileId: string }) => a.studentProfileId === "sp-1");
    expect(mine.statusChanged).toBe(false);
  });

  it("분류별로 statusChanged를 다르게 실어 보낸다", async () => {
    const rows = [
      { ...row, studentCode: "CDEF2345", name: "그대로", grade: 1, classNo: 3, number: 3 },
      { ...row, studentCode: "CDEF2346", name: "반바뀜", grade: 2, classNo: 1, number: 9 },
      {
        ...row,
        studentCode: "CDEF2347",
        name: "학적바뀜",
        status: "GRADUATED" as const,
        grade: null,
        classNo: null,
        number: null,
      },
      { ...row, studentCode: "CDEF2348", name: "새배정", grade: 3, classNo: 2, number: 5 },
    ].map((r, i) => ({
      ...r,
      birthDate: `2010-0${i + 1}-01`,
    }));

    // 학생코드로 잇는 특성상 각 row는 대응하는 existing과 studentCode가 같아야 한다.
    const existing = [
      {
        ...재학생,
        studentProfileId: "sp-untouched",
        studentCode: "CDEF2345",
        name: "그대로",
        birthDate: "2010-01-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-reassign",
        userId: "u-2",
        studentCode: "CDEF2346",
        name: "반바뀜",
        birthDate: "2010-02-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-statuschange",
        userId: "u-3",
        studentCode: "CDEF2347",
        name: "학적바뀜",
        birthDate: "2010-03-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-newassign",
        userId: "u-4",
        studentCode: "CDEF2348",
        name: "새배정",
        birthDate: "2010-04-01",
        status: null,
        grade: null,
        classNo: null,
        number: null,
      },
    ];
    listExisting.mockResolvedValue(existing);

    await applyRosterPlan(admin, 2026, rows, fingerprint(existing), [], null);

    const assignments: { studentProfileId: string; statusChanged: boolean }[] =
      applyRoster.mock.calls[0]![1].assignments;
    const byId = new Map(assignments.map((a) => [a.studentProfileId, a.statusChanged]));

    expect(byId.get("sp-untouched")).toBe(false);
    expect(byId.get("sp-reassign")).toBe(false);
    expect(byId.get("sp-statuschange")).toBe(true);
    expect(byId.get("sp-newassign")).toBe(true);
  });

  it("자기 자신을 비재학으로 돌리는 반영은 거부한다 (자기 잠금 방어)", async () => {
    const existing = [{ ...재학생, userId: admin.id }];
    listExisting.mockResolvedValue(existing);
    const 자퇴 = { ...row, status: "WITHDRAWN" as const, grade: null, classNo: null, number: null };

    await expect(applyRosterPlan(admin, 2026, [자퇴], fingerprint(existing), [], null)).rejects.toThrow(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("계정 상태가 실제로 뒤집힐 때만 user:activate/deactivate를 남긴다 (I4)", async () => {
    const existing = [{ ...재학생, accountActive: false, status: "WITHDRAWN" }];
    listExisting.mockResolvedValue(existing);
    const 재입학 = { ...row, status: "ENROLLED" as const };

    await applyRosterPlan(admin, 2026, [재입학], fingerprint(existing), [], null);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    const flip = calls.find((c) => c.action === "user:activate");
    expect(flip).toMatchObject({ targetType: "User", targetId: "u-1" });
    // actorName을 미리 넘긴다 (M8) — 이 루프도 이름을 다시 조회하지 않는다.
    expect(flip?.actorName).toBe(admin.name);
  });

  it("계정 상태가 실제로는 안 바뀌면(비재학→비재학) 활성/비활성 감사로그를 남기지 않는다", async () => {
    const existing = [{ ...재학생, accountActive: false, status: "WITHDRAWN" }];
    listExisting.mockResolvedValue(existing);
    const 자퇴그대로 = { ...row, status: "EXPELLED" as const, grade: null, classNo: null, number: null };

    await applyRosterPlan(admin, 2026, [자퇴그대로], fingerprint(existing), [], null);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.action === "user:activate" || c.action === "user:deactivate")).toBe(
      false,
    );
  });

  it("초대코드 생성이 배치 밖과 겹치면 CODE_COLLISION으로 옮긴다 (I2 backstop)", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockRejectedValue(new InviteCodeCollisionError());

    const newRow = { ...row, studentCode: "" };
    await expect(applyRosterPlan(admin, 2026, [newRow], fingerprint([]), [], null)).rejects.toThrow("CODE_COLLISION");
  });

  it("발급 코드는 generateUniqueCode()로 만든다", async () => {
    listExisting.mockResolvedValue([]);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow], fingerprint([]), [], null);

    expect(generateUniqueCode).toHaveBeenCalled();
  });

  it("트랜잭션 안에서 다시 읽은 명단이 달라졌으면 반영하지 않는다", async () => {
    const newer = [{ ...재학생, classNo: 9 }];
    listExisting
      .mockResolvedValueOnce([재학생])
      .mockResolvedValueOnce(newer);

    await expect(
      applyRosterPlan(admin, 2026, [row], fingerprint(), [], null),
    ).rejects.toThrow("ROSTER_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

/** 여러 명이 한꺼번에 빠지는 경우(I-3) 테스트용 — 학생 n명이 전부 명단에 없는
 * 상태를 만든다. */
function 대량학생(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    studentProfileId: `sp-bulk-${i}`,
    userId: `u-bulk-${i}`,
    studentCode: `BULK${i}`,
    name: `학생${i}`,
    birthDate: "2010-01-01",
    grade: 1,
    classNo: 1,
    number: i + 1,
    status: "ENROLLED",
    hasGraduatedEnrollment: false,
    accountActive: true,
  }));
}

describe("applyRosterPlan() — 명단에서 빠진 학생 계정 삭제", () => {
  it("삭제 대상이 있는데 confirmedDeletionIds가 비면 거부한다", async () => {
    // 기본 listExisting은 [재학생]인데 rows에 대응하는 줄이 없으므로 재학생이
    // missingFromFile에 들어간다.
    await expect(applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), [], null)).rejects.toThrow(
      "DELETION_SET_CHANGED",
    );
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("확인한 id 집합이 서비스가 다시 세운 삭제 대상과 정확히 같으면 repo에 넘긴다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual(["sp-1"]);
  });

  it("확인한 id가 중복되면 집합이 같아 보여도 거부한다", async () => {
    await expect(
      applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1", "sp-1"], 1),
    ).rejects.toThrow("DELETION_SET_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("명단에서 빠진 졸업생은 삭제하지 않고 보존 배정으로 다시 쓴다", async () => {
    const 졸업생 = {
      ...재학생,
      studentProfileId: "sp-grad",
      userId: "u-grad",
      studentCode: "GRAD2345",
      name: "졸업생",
      birthDate: "2007-01-01",
      grade: null,
      classNo: null,
      number: null,
      status: "GRADUATED",
      hasGraduatedEnrollment: true,
      accountActive: false,
    };
    const existing = [재학생, 졸업생];
    listExisting.mockResolvedValue(existing);

    await applyRosterPlan(
      admin,
      2026,
      [무관한신규줄],
      fingerprint(existing),
      ["sp-1"],
      1,
    );

    const input = applyRoster.mock.calls[0]![1];
    expect(input.deleteStudentProfileIds).toEqual(["sp-1"]);
    expect(input.assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studentProfileId: "sp-grad",
          status: "GRADUATED",
          statusChanged: false,
          line: 0,
        }),
      ]),
    );
  });

  it("삭제 대상이 없으면 빈 배열로도 막지 않는다", async () => {
    // row가 재학생과 같은 학생코드라 이어붙어 missingFromFile이 비게 된다.
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual([]);
  });

  it("삭제 로그마다 actorName을 미리 넘겨 이름 재조회를 없앤다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const deleteLog = recordAudit.mock.calls
      .map((c) => c[0])
      .find((c) => c.action === "user:delete");
    expect(deleteLog?.actorName).toBe(admin.name);
  });

  it("명단에서 빠진 학생마다 user:delete를 남기고 이름은 넣지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const deleteLogs = recordAudit.mock.calls
      .map((c) => c[0])
      .filter((c) => c.action === "user:delete");
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0]).toMatchObject({ targetType: "User", targetId: "u-1" });
    expect(JSON.stringify(deleteLogs[0])).not.toContain("김동혁");
  });

  it("배치 요약의 metadata에 deleted 건수를 남긴다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const summary = recordAudit.mock.calls
      .map((c) => c[0])
      .find((c) => c.action === "enrollment:import");
    expect(summary.metadata).toMatchObject({ deleted: 1 });
  });

  it("정상 반영 요약에 restored 건수를 남기지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    const summary = recordAudit.mock.calls
      .map((c) => c[0])
      .find((c) => c.action === "enrollment:import");
    expect(summary.metadata).not.toHaveProperty("restored");
  });

  it("결과에 삭제 건수를 함께 돌려준다", async () => {
    const result = await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    expect(result.deleted).toBe(1);
  });

  it("자기 자신이 삭제 대상이면 확인 여부와 무관하게 거부한다", async () => {
    const existing = [{ ...재학생, userId: admin.id }];
    listExisting.mockResolvedValue(existing);

    await expect(applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(existing), ["sp-1"], null)).rejects.toThrow(
      "CANNOT_DELETE_SELF",
    );
    expect(applyRoster).not.toHaveBeenCalled();
  });

  describe("삭제 대상 집합 대조 — 미리보기 이후 DB가 바뀌면 확정을 거부한다 (I-2)", () => {
    it("확인한 집합이 다시 세운 집합과 다르면(다른 id) 거부하고 아무것도 쓰지 않는다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-다른학생"], null),
      ).rejects.toThrow("DELETION_SET_CHANGED");
      expect(applyRoster).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("확인한 집합에 삭제 대상이 아닌 id가 섞여 있어도 거부한다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1", "sp-그사이가입"], null),
      ).rejects.toThrow("DELETION_SET_CHANGED");
      expect(applyRoster).not.toHaveBeenCalled();
    });
  });

  describe("삭제 인원 대조 — 삭제 대상이 하나라도 있으면 늘 요구한다 (I-3)", () => {
    it("여러 명이 빠지는데 건수를 넣지 않으면 거부한다", async () => {
      const bulk = 대량학생(11);
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(bulk), ids, null),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("여러 명이 빠지는데 건수를 틀리게 넣으면 거부한다", async () => {
      const bulk = 대량학생(11);
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(bulk), ids, 5),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
    });

    it("건수를 정확히 넣으면(id 집합도 일치) 통과한다", async () => {
      const bulk = 대량학생(11);
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(bulk), ids, 11);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toHaveLength(11);
    });

    it("1명만 빠져도 건수를 넣지 않으면 거부한다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], null),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("1명만 빠질 때 건수를 틀리게 넣어도 거부한다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 2),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
    });

    it("1명이 빠질 때 건수를 정확히 넣으면 통과한다", async () => {
      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual(["sp-1"]);
    });

    it("삭제 대상이 없으면 건수를 안 넣어도 통과한다", async () => {
      // row가 재학생과 같은 학생코드라 이어붙어 missingFromFile이 빈다.
      await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual([]);
    });
  });

  describe("폐기된 초대코드 감사로그", () => {
    it("명단 반영이 폐기한 코드마다 감사로그를 한 줄씩 남긴다", async () => {
      applyRoster.mockResolvedValue({
        invites: [],
        revokedInvites: [
          { id: "inv-1", role: "PARENT" },
          { id: "inv-2", role: "PARENT" },
        ],
      });

      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

      const revokeLogs = recordAudit.mock.calls
        .map((c) => c[0])
        .filter((a) => a.action === "invite:revoke:roster");
      expect(revokeLogs).toHaveLength(2);
      expect(revokeLogs[0]).toMatchObject({
        actorUserId: admin.id,
        actorName: admin.name,
        targetType: "Invite",
        targetId: "inv-1",
        metadata: { role: "PARENT" },
      });
      expect(revokeLogs[1]!.targetId).toBe("inv-2");
      expect(recordAudit.mock.calls.every((c) => c[1] === txClient)).toBe(true);
    });

    it("폐기된 코드가 없으면 아무 줄도 남기지 않는다", async () => {
      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

      expect(
        recordAudit.mock.calls.some((c) => c[0].action === "invite:revoke:roster"),
      ).toBe(false);
    });
  });
});

describe("exportRoster()", () => {
  it("관리자가 아니면 내보내지 못한다", async () => {
    await expect(exportRoster(student)).rejects.toThrow("FORBIDDEN");
    expect(listExisting).not.toHaveBeenCalled();
  });

  it("현재 학년도 명단을 머리글 + 학생 행으로 만든다", async () => {
    const result = await exportRoster(admin);

    expect(listExisting).toHaveBeenCalledWith(2026);
    expect(result.year).toBe(2026);
    expect(result.rows[0]).toEqual([...ROSTER_COLUMNS, ...ROSTER_INFO_COLUMNS]);
    expect(result.rows[1]![0]).toBe("AAAA2345");
    expect(result.rows[1]![1]).toBe("김동혁");
  });

  it("읽기만 한다 — 감사로그를 남기지 않는다 (생성·수정·삭제만 기록한다)", async () => {
    await exportRoster(admin);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
