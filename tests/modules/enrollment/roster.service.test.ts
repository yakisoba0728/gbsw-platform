import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const listExisting = vi.fn();
const applyRoster = vi.fn();
const recordAudit = vi.fn();

vi.mock("@/modules/enrollment/roster.repo", () => ({ listExisting, applyRoster }));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

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
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
};

const row = {
  line: 2,
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 5,
  number: 7,
  status: "ENROLLED" as const,
  errors: [],
};

beforeEach(() => {
  listExisting.mockReset().mockResolvedValue([재학생]);
  applyRoster.mockReset().mockResolvedValue({ invites: [] });
  recordAudit.mockReset();
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
      invites: [{ name: "김동혁", code: "GBSW1234ABCD", grade: 1, classNo: 5, number: 7 }],
    });

    const result = await applyRosterPlan(admin, 2026, [row]);

    expect(result.invites).toHaveLength(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);
  });
});
