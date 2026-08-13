import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

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
const { applyRosterPlan } = await import("@/modules/enrollment/roster.service");

function user(role: SessionUser["role"], id = "admin-1"): SessionUser {
  return { id, name: "테스트", email: "t@gbsw.hs.kr", role, status: "ACTIVE", mustChangePassword: false };
}
const admin = user("ADMIN");
const student = user("STUDENT", "s-1");

const 재학생 = {
  studentProfileId: "sp-1",
  userId: "u-1",
  studentCode: "AAAA1111",
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
  studentCode: "AAAA1111",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 5,
  number: 7,
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
    await expect(applyRosterPlan(student, 2026, [row])).rejects.toThrow("FORBIDDEN");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("학년도가 그 사이 바뀌었으면 거부한다", async () => {
    await expect(applyRosterPlan(admin, 2025, [row])).rejects.toThrow("YEAR_CHANGED");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("확정을 막아야 하는 명단이면 아무것도 쓰지 않는다", async () => {
    const bad = { ...row, errors: ["생년월일을 읽을 수 없습니다."] };

    await expect(applyRosterPlan(admin, 2026, [bad])).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("클라이언트가 보낸 행을 다시 분류한다 — 미리보기 결과를 믿지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row]);

    // 미리보기 때와 같은 현재 상태를 서버가 다시 읽어야 한다.
    expect(listExisting).toHaveBeenCalledWith(2026);
  });

  it("반영하고 요약을 감사로그에 남긴다 — 값이 아니라 건수만", async () => {
    await applyRosterPlan(admin, 2026, [row]);

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
    const result = await applyRosterPlan(admin, 2026, [newRow]);

    expect(result.invites).toHaveLength(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);
  });

  it("발급 코드에 기본 만료를 둔다 — 종이로 나눠주는 코드를 무기한으로 두지 않는다", async () => {
    listExisting.mockResolvedValue([]);
    const expires = new Date("2099-05-01");
    toExpiresAt.mockReturnValue(expires);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow]);

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

    await applyRosterPlan(admin, 2026, [재학신규, 비재학신규]);

    const newStudents = applyRoster.mock.calls[0]![1].newStudents;
    expect(newStudents).toHaveLength(1);
    expect(newStudents[0].row.name).toBe("재학이");
  });

  it("학적이 안 바뀐 학생은 statusChanged=false로 넘어간다 (C1 회귀 방지)", async () => {
    // row가 재학생과 같은 학생코드·자리면 untouched로 분류된다.
    const 그대로 = { ...row, grade: 1, classNo: 3, number: 3 };

    await applyRosterPlan(admin, 2026, [그대로]);

    const assignments = applyRoster.mock.calls[0]![1].assignments;
    const mine = assignments.find((a: { studentProfileId: string }) => a.studentProfileId === "sp-1");
    expect(mine.statusChanged).toBe(false);
  });

  it("분류별로 statusChanged를 다르게 실어 보낸다", async () => {
    const rows = [
      { ...row, studentCode: "CODE0001", name: "그대로", grade: 1, classNo: 3, number: 3 },
      { ...row, studentCode: "CODE0002", name: "반바뀜", grade: 2, classNo: 1, number: 9 },
      {
        ...row,
        studentCode: "CODE0003",
        name: "학적바뀜",
        status: "GRADUATED" as const,
        grade: null,
        classNo: null,
        number: null,
      },
      { ...row, studentCode: "CODE0004", name: "새배정", grade: 3, classNo: 2, number: 5 },
    ].map((r, i) => ({
      ...r,
      birthDate: `2010-0${i + 1}-01`,
    }));

    // 학생코드로 잇는 특성상 각 row는 대응하는 existing과 studentCode가 같아야 한다.
    listExisting.mockResolvedValue([
      {
        ...재학생,
        studentProfileId: "sp-untouched",
        studentCode: "CODE0001",
        name: "그대로",
        birthDate: "2010-01-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-reassign",
        userId: "u-2",
        studentCode: "CODE0002",
        name: "반바뀜",
        birthDate: "2010-02-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-statuschange",
        userId: "u-3",
        studentCode: "CODE0003",
        name: "학적바뀜",
        birthDate: "2010-03-01",
      },
      {
        ...재학생,
        studentProfileId: "sp-newassign",
        userId: "u-4",
        studentCode: "CODE0004",
        name: "새배정",
        birthDate: "2010-04-01",
        status: null,
        grade: null,
        classNo: null,
        number: null,
      },
    ]);

    await applyRosterPlan(admin, 2026, rows);

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

    await expect(applyRosterPlan(admin, 2026, [자퇴])).rejects.toThrow(
      "CANNOT_DEACTIVATE_SELF",
    );
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("계정 상태가 실제로 뒤집힐 때만 user:activate/deactivate를 남긴다 (I4)", async () => {
    listExisting.mockResolvedValue([{ ...재학생, accountActive: false, status: "WITHDRAWN" }]);
    const 재입학 = { ...row, status: "ENROLLED" as const };

    await applyRosterPlan(admin, 2026, [재입학]);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    const flip = calls.find((c) => c.action === "user:activate");
    expect(flip).toMatchObject({ targetType: "User", targetId: "u-1" });
  });

  it("계정 상태가 실제로는 안 바뀌면(비재학→비재학) 활성/비활성 감사로그를 남기지 않는다", async () => {
    listExisting.mockResolvedValue([{ ...재학생, accountActive: false, status: "WITHDRAWN" }]);
    const 자퇴그대로 = { ...row, status: "EXPELLED" as const, grade: null, classNo: null, number: null };

    await applyRosterPlan(admin, 2026, [자퇴그대로]);

    const calls = recordAudit.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => c.action === "user:activate" || c.action === "user:deactivate")).toBe(
      false,
    );
  });

  it("초대코드 생성이 배치 밖과 겹치면 CODE_COLLISION으로 옮긴다 (I2 backstop)", async () => {
    listExisting.mockResolvedValue([]);
    applyRoster.mockRejectedValue(new InviteCodeCollisionError());

    const newRow = { ...row, studentCode: "" };
    await expect(applyRosterPlan(admin, 2026, [newRow])).rejects.toThrow("CODE_COLLISION");
  });

  it("발급 코드는 invite.service.ts의 generateUniqueCode()로 만든다 (DB 확인 + 재시도)", async () => {
    listExisting.mockResolvedValue([]);

    const newRow = { ...row, studentCode: "" };
    await applyRosterPlan(admin, 2026, [newRow]);

    expect(generateUniqueCode).toHaveBeenCalled();
  });
});
