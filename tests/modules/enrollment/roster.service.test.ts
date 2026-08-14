import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { ROSTER_COLUMNS, ROSTER_INFO_COLUMNS } from "@/modules/enrollment/roster.export";

const listExisting = vi.fn();
const applyRoster = vi.fn();
const recordAudit = vi.fn();
const generateUniqueCode = vi.fn();
const toExpiresAt = vi.fn();

/** roster.repo.ts의 실물과 이름·상속만 같은 자리표시자. instanceof로 구분한다. */
class InviteCodeCollisionError extends Error {}

vi.mock("@/modules/enrollment/roster.repo", () => ({
  listExisting,
  applyRoster,
  InviteCodeCollisionError,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));
vi.mock("@/modules/invites/invite.service", () => ({ generateUniqueCode, toExpiresAt }));

// RosterError는 이 테스트에서 쓰지 않는다 — 던지는 메시지는 toThrow()로 문자열째 확인한다.
const { applyRosterPlan, exportRoster } = await import("@/modules/enrollment/roster.service");

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
  accountActive: true,
};

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
  applyRoster.mockReset().mockResolvedValue({ invites: [] });
  recordAudit.mockReset();
  codeCounter = 0;
  generateUniqueCode.mockReset().mockImplementation(async () => `GBSWCODE${++codeCounter}`);
  toExpiresAt.mockReset().mockReturnValue(new Date("2099-01-01"));
});

describe("applyRosterPlan()", () => {
  it("관리자가 아니면 반영하지 못한다", async () => {
    await expect(applyRosterPlan(student, 2026, [row], [], null)).rejects.toThrow("FORBIDDEN");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("학년도가 그 사이 바뀌었으면 거부한다", async () => {
    await expect(applyRosterPlan(admin, 2025, [row], [], null)).rejects.toThrow("YEAR_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("빈 행이면 거부한다 (M-1) — 경계 zod(rosterRowsSchema.min(1))가 항상 이 함수 앞에 " +
    "있다는 보장이 없어, rows: [] 한 번에 전교생이 통째로 missingFromFile로 잡히는 것을 " +
    "서비스도 막는다", async () => {
    await expect(applyRosterPlan(admin, 2026, [], [], null)).rejects.toThrow("EMPTY_ROWS");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("확정을 막아야 하는 명단이면 아무것도 쓰지 않는다", async () => {
    const bad = { ...row, errors: ["생년월일을 읽을 수 없습니다."] };

    await expect(applyRosterPlan(admin, 2026, [bad], [], null)).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("클라이언트가 보낸 행을 다시 분류한다 — 미리보기 결과를 믿지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row], [], null);

    // 미리보기 때와 같은 현재 상태를 서버가 다시 읽어야 한다.
    expect(listExisting).toHaveBeenCalledWith(2026);
  });

  it("반영하고 요약을 감사로그에 남긴다 — 값이 아니라 건수만", async () => {
    await applyRosterPlan(admin, 2026, [row], [], null);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    const audit = recordAudit.mock.calls[0]![0];
    expect(audit.action).toBe("enrollment:import");
    expect(audit.metadata).toMatchObject({ year: 2026, reassign: 1 });
    // 학생 이름이 로그에 남으면 감사로그가 개인정보 사본이 된다.
    expect(JSON.stringify(audit)).not.toContain("김동혁");
  });

  it("신규 학생 수만큼 초대코드를 만들어 돌려준다", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockResolvedValue({
      invites: [{ name: "김동혁", code: "GBSWCODE1", grade: 1, classNo: 5, number: 7 }],
    });

    const newRow = { ...row, studentCode: "" };
    const result = await applyRosterPlan(admin, 2026, [newRow], [], null);

    expect(result.invites).toHaveLength(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);
  });

  it("발급 코드에 기본 만료를 둔다 — 종이로 나눠주는 코드를 무기한으로 두지 않는다", async () => {
    listExisting.mockResolvedValue([]);
    const expires = new Date("2099-05-01");
    toExpiresAt.mockReturnValue(expires);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow], [], null);

    expect(applyRoster.mock.calls[0]![1].inviteExpiresAt).toBe(expires);
    expect(toExpiresAt).toHaveBeenCalledWith(expect.any(Number));
  });

  it("재학인 신규 학생만 초대코드 대상이다 — 비재학 신규는 studentInviteMetaSchema를 " +
    "충족할 수 없어 가입이 영원히 막힌다 (I1)", async () => {
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

    await applyRosterPlan(admin, 2026, [재학신규, 비재학신규], [], null);

    const newStudents = applyRoster.mock.calls[0]![1].newStudents;
    expect(newStudents).toHaveLength(1);
    expect(newStudents[0].row.name).toBe("재학이");
  });

  it("학적이 안 바뀐 학생은 statusChanged=false로 넘어간다 (C1 회귀 방지)", async () => {
    // row가 재학생과 같은 학생코드·자리면 untouched로 분류된다.
    const 그대로 = { ...row, grade: 1, classNo: 3, number: 3 };

    await applyRosterPlan(admin, 2026, [그대로], [], null);

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
    listExisting.mockResolvedValue([
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
    ]);

    await applyRosterPlan(admin, 2026, rows, [], null);

    const assignments: { studentProfileId: string; statusChanged: boolean }[] =
      applyRoster.mock.calls[0]![1].assignments;
    const byId = new Map(assignments.map((a) => [a.studentProfileId, a.statusChanged]));

    expect(byId.get("sp-untouched")).toBe(false);
    expect(byId.get("sp-reassign")).toBe(false);
    expect(byId.get("sp-statuschange")).toBe(true);
    expect(byId.get("sp-newassign")).toBe(true);
  });

  it("자기 자신을 비재학으로 돌리는 반영은 거부한다 (자기 잠금 방어)", async () => {
    listExisting.mockResolvedValue([{ ...재학생, userId: admin.id }]);
    const 자퇴 = { ...row, status: "WITHDRAWN" as const, grade: null, classNo: null, number: null };

    await expect(applyRosterPlan(admin, 2026, [자퇴], [], null)).rejects.toThrow(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("계정 상태가 실제로 뒤집힐 때만 user:activate/deactivate를 남긴다 (I4)", async () => {
    listExisting.mockResolvedValue([{ ...재학생, accountActive: false, status: "WITHDRAWN" }]);
    const 재입학 = { ...row, status: "ENROLLED" as const };

    await applyRosterPlan(admin, 2026, [재입학], [], null);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    const flip = calls.find((c) => c.action === "user:activate");
    expect(flip).toMatchObject({ targetType: "User", targetId: "u-1" });
    // actorName을 미리 넘긴다 (M8) — 이 루프도 이름을 다시 조회하지 않는다.
    expect(flip?.actorName).toBe(admin.name);
  });

  it("계정 상태가 실제로는 안 바뀌면(비재학→비재학) 활성/비활성 감사로그를 남기지 않는다", async () => {
    listExisting.mockResolvedValue([{ ...재학생, accountActive: false, status: "WITHDRAWN" }]);
    const 자퇴그대로 = { ...row, status: "EXPELLED" as const, grade: null, classNo: null, number: null };

    await applyRosterPlan(admin, 2026, [자퇴그대로], [], null);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.action === "user:activate" || c.action === "user:deactivate")).toBe(
      false,
    );
  });

  it("초대코드 생성이 배치 밖과 겹치면 CODE_COLLISION으로 옮긴다 (I2 backstop)", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockRejectedValue(new InviteCodeCollisionError());

    const newRow = { ...row, studentCode: "" };
    await expect(applyRosterPlan(admin, 2026, [newRow], [], null)).rejects.toThrow("CODE_COLLISION");
  });

  it("발급 코드는 invite.service.ts의 generateUniqueCode()로 만든다 (DB 확인 + 재시도)", async () => {
    listExisting.mockResolvedValue([]);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow], [], null);

    expect(generateUniqueCode).toHaveBeenCalled();
  });
});

/** 대량 삭제(I-3) 테스트용 — 학생 n명이 전부 명단에 없는 상태를 만든다. 전체
 * 학생 수(totalStudents)도 n이 되므로 임계는 max(10, n*0.1)이다. */
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
    accountActive: true,
  }));
}

describe("applyRosterPlan() — 명단에서 빠진 학생 계정 삭제", () => {
  it("삭제 대상이 있는데 confirmedDeletionIds가 비어 있으면 거부한다 — " +
    "빈 배열이 곧 확인 안 함이다", async () => {
    // 기본 listExisting은 [재학생]인데 rows에 대응하는 줄이 없으므로 재학생이
    // missingFromFile에 들어간다.
    await expect(applyRosterPlan(admin, 2026, [무관한신규줄], [], null)).rejects.toThrow(
      "DELETION_SET_CHANGED",
    );
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("확인한 id 집합이 서비스가 다시 세운 삭제 대상과 정확히 같으면 repo에 넘긴다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

    expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual(["sp-1"]);
  });

  it("삭제 대상이 없으면 빈 배열로도 막지 않는다", async () => {
    // row가 재학생과 같은 학생코드라 이어붙어 missingFromFile이 비게 된다.
    await applyRosterPlan(admin, 2026, [row], [], null);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual([]);
  });

  it("삭제 로그마다 actorName을 미리 넘긴다 (M8) — 275명 삭제가 매번 이름을 다시 " +
    "조회하면 순차 왕복이 되어 리버스 프록시 타임아웃에 걸릴 수 있다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

    const deleteLog = recordAudit.mock.calls
      .map((c) => c[0])
      .find((c) => c.action === "user:delete");
    expect(deleteLog?.actorName).toBe(admin.name);
  });

  it("삭제된 학생마다 user:delete 감사로그를 남긴다 — targetId만 담고 이름은 넣지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

    const deleteLogs = recordAudit.mock.calls
      .map((c) => c[0])
      .filter((c) => c.action === "user:delete");
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0]).toMatchObject({ targetType: "User", targetId: "u-1" });
    expect(JSON.stringify(deleteLogs[0])).not.toContain("김동혁");
  });

  it("배치 요약(enrollment:import)의 metadata에 삭제 건수를 남긴다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

    const summary = recordAudit.mock.calls
      .map((c) => c[0])
      .find((c) => c.action === "enrollment:import");
    expect(summary.metadata).toMatchObject({ deleted: 1 });
  });

  it("결과에 삭제 건수를 함께 돌려준다 (Minor-4) — 성공 문구에 반영 건수만 있으면 " +
    "몇 명이 지워졌는지 묻힌다", async () => {
    const result = await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

    expect(result.deleted).toBe(1);
  });

  it("자기 자신이 삭제 대상에 들어가면 확인 여부와 무관하게 거부한다 — " +
    "listExisting이 role: STUDENT로 걸러 도달하기 어렵지만, 그 필터의 부수효과에 " +
    "기대지 않고 명시적으로 막는다", async () => {
    listExisting.mockResolvedValue([{ ...재학생, userId: admin.id }]);

    await expect(applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null)).rejects.toThrow(
      "CANNOT_DELETE_SELF",
    );
    expect(applyRoster).not.toHaveBeenCalled();
  });

  describe("삭제 대상 집합 대조 — 미리보기 이후 DB가 바뀌면 확정을 거부한다 (I-2)", () => {
    it("확인한 집합이 다시 세운 집합과 다르면(다른 id) 거부하고 아무것도 쓰지 않는다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-다른학생"], null),
      ).rejects.toThrow("DELETION_SET_CHANGED");
      expect(applyRoster).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("확인한 집합에 실제 삭제 대상이 아닌 id가 초과로 섞여 있어도 거부한다 — " +
      "미리보기 이후 그 학생이 가입해 missingFromFile에서 빠졌는데 화면은 여전히 " +
      "옛 목록을 들고 있는 경우를 흉내낸다", async () => {
      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1", "sp-그사이가입"], null),
      ).rejects.toThrow("DELETION_SET_CHANGED");
      expect(applyRoster).not.toHaveBeenCalled();
    });
  });

  describe("대량 삭제 건수 대조 — 임계(10명 또는 전체 학생의 10% 중 큰 쪽) 초과 (I-3)", () => {
    it("임계를 넘는데 건수를 넣지 않으면 거부한다", async () => {
      const bulk = 대량학생(11); // totalStudents=11 → 임계 10, 11>10
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], ids, null),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
    });

    it("임계를 넘는데 건수를 틀리게 넣으면 거부한다", async () => {
      const bulk = 대량학생(11);
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await expect(
        applyRosterPlan(admin, 2026, [무관한신규줄], ids, 5),
      ).rejects.toThrow("DELETION_COUNT_MISMATCH");
      expect(applyRoster).not.toHaveBeenCalled();
    });

    it("임계를 넘어도 건수를 정확히 넣으면(id 집합도 일치) 통과한다", async () => {
      const bulk = 대량학생(11);
      listExisting.mockResolvedValue(bulk);
      const ids = bulk.map((s) => s.studentProfileId);

      await applyRosterPlan(admin, 2026, [무관한신규줄], ids, 11);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toHaveLength(11);
    });

    it("임계를 넘지 않으면 건수를 넣지 않아도(null) 통과한다 — 1명 삭제 같은 정상 " +
      "경로에 대량 삭제 절차를 강요하지 않는다", async () => {
      await applyRosterPlan(admin, 2026, [무관한신규줄], ["sp-1"], null);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual(["sp-1"]);
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
