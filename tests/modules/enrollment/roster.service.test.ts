import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";
import { ROSTER_COLUMNS, ROSTER_INFO_COLUMNS } from "@/modules/enrollment/roster.export";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const listExisting = vi.fn();
const applyRoster = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const findCurrentYear = vi.fn();
const {
  recordAudit,
  txClient,
  bareWithTransaction: withTransaction,
} = coreMocks("enrollment-roster-service-test");
const recordAuditMany = vi.fn();

/**
 * 남은 감사로그 줄 전부. 명단 반영은 요약 한 줄은 `recordAudit`으로, 학생 수만큼
 * 늘어나는 줄(삭제·코드 폐기·계정 활성)은 `recordAuditMany`로 한 번에 남긴다 —
 * 잠금을 쥔 채 왕복하지 않으려는 것이라, 어느 쪽으로 남았는지는 검사할 것이 아니다.
 */
function auditEntries(): { action: string; [key: string]: unknown }[] {
  return [
    ...recordAudit.mock.calls.map((c) => c[0]),
    ...recordAuditMany.mock.calls.flatMap((c) => c[0] as { action: string }[]),
  ];
}

/** 감사로그가 하나도 안 남았는가. 두 경로를 함께 본다. */
function noAudit(): boolean {
  return auditEntries().length === 0;
}
const generateUniqueCode = vi.fn();
const toExpiresAt = vi.fn();

/** roster.repo.ts의 실물과 이름·상속만 같은 자리표시자. instanceof로 구분한다. */
class InviteCodeCollisionError extends Error {}
class NumberTakenError extends Error {}

vi.mock("@/modules/enrollment/roster.repo", () => ({
  listExisting,
  applyRoster,
  findCurrentYearForUpdate,
  findCurrentYear,
  InviteCodeCollisionError,
  NumberTakenError,
}));
vi.mock("server-only", () => ({}));
const parseRoster = vi.fn();
vi.mock("@/modules/enrollment/roster.parse", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  parseRoster,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit, recordAuditMany }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));
vi.mock("@/modules/invites/invite.service", () => ({ generateUniqueCode, toExpiresAt }));

// RosterError는 이 테스트에서 쓰지 않는다 — 던지는 메시지는 toThrow()로 문자열째 확인한다.
const {
  applyRosterPlan: applyWithToken,
  createRosterFingerprint,
  exportRoster,
  previewRoster,
} = await import("@/modules/enrollment/roster.service");
const { issuePreviewToken } = await import(
  "@/modules/enrollment/roster.preview-token"
);

/**
 * 봉인은 `previewRoster`가 찍고 확정이 검증한다. 아래 테스트들은 확정 쪽 규칙을
 * 보는 것이라, 그 미리보기에서 왔을 봉인을 기본값으로 만들어 붙인다. 봉인 자체가
 * 무엇을 막는지는 「미리보기 봉인」 describe가 따로 본다.
 */
function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: Parameters<typeof applyWithToken>[2],
  rosterFingerprint: string,
  deletionIds: string[],
  deletionCount: number | null,
  token = issuePreviewToken({
    year: expectedYear,
    rows,
    deletionIds,
    rosterFingerprint,
  }),
) {
  return applyWithToken(
    actor,
    expectedYear,
    rows,
    rosterFingerprint,
    deletionIds,
    deletionCount,
    token,
  );
}

const admin = user("ADMIN", "admin-1");
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
  recordAuditMany.mockReset();
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
    expect(noAudit()).toBe(true);
  });

  it("확정을 막아야 하는 명단이면 아무것도 쓰지 않는다", async () => {
    const bad = { ...row, errors: ["생년월일을 읽을 수 없습니다."] };

    await expect(applyRosterPlan(admin, 2026, [bad], fingerprint(), [], null)).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(noAudit()).toBe(true);
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
    expect(noAudit()).toBe(true);
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
      invites: [
        {
          id: "inv-new-1",
          name: "김동혁",
          code: "GBSWCODE1",
          grade: 1,
          classNo: 5,
          number: 7,
        },
      ],
      revokedInvites: [],
    });

    const newRow = { ...row, studentCode: "" };
    const result = await applyRosterPlan(admin, 2026, [newRow], fingerprint([]), [], null);

    expect(result.invites).toHaveLength(1);
    expect(result.saved).toBe(0);
    expect(result.invitesIssued).toBe(1);
    expect(applyRoster.mock.calls[0]![1].newStudents).toHaveLength(1);

    const inviteLogs = auditEntries().filter((entry) => entry.action === "invite:create");
    expect(inviteLogs).toHaveLength(1);
    expect(inviteLogs[0]).toMatchObject({
      targetType: "Invite",
      targetId: "inv-new-1",
      metadata: { role: "STUDENT" },
    });
    expect(JSON.stringify(inviteLogs[0])).not.toContain("GBSWCODE1");
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

      const summary = auditEntries()
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

    const result = await applyRosterPlan(
      admin,
      2026,
      rows,
      fingerprint(existing),
      [],
      null,
    );

    const assignments: { studentProfileId: string; statusChanged: boolean }[] =
      applyRoster.mock.calls[0]![1].assignments;
    const byId = new Map(assignments.map((a) => [a.studentProfileId, a.statusChanged]));

    expect(byId.get("sp-untouched")).toBe(false);
    expect(byId.get("sp-reassign")).toBe(false);
    expect(byId.get("sp-statuschange")).toBe(true);
    expect(byId.get("sp-newassign")).toBe(true);
    expect(result.saved).toBe(3);
    expect(applyRoster.mock.calls[0]![1].managedStudentProfileIds).toEqual([
      "sp-untouched",
      "sp-reassign",
      "sp-statuschange",
      "sp-newassign",
    ]);
    expect(applyRoster.mock.calls[0]![1].createdById).toBe(admin.id);
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

    const calls = auditEntries();
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

    const calls = auditEntries();
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

  it("명단 밖 계정이 붙든 (반, 번호)에 걸리면 NUMBER_TAKEN으로 옮긴다", async () => {
    // 파일 안의 자리 겹침은 planRoster가 이미 막는다 — 여기까지 오는 건 명단 밖
    // 계정이 그 자리를 붙들고 있는 경우뿐이라 화면 문구가 그 사실을 말해야 한다.
    applyRoster.mockRejectedValue(new NumberTakenError());

    await expect(applyRosterPlan(admin, 2026, [row], fingerprint(), [], null)).rejects.toThrow(
      "NUMBER_TAKEN",
    );
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
    expect(noAudit()).toBe(true);
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
    expect(noAudit()).toBe(true);
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

  it("졸업 기록이 있는데 이번 학년도 배정이 남은 학생이 명단에서 빠지면 조용히 다시 쓰지 않는다", async () => {
    // 2026 졸업 + 2026 재학(재입학·오등록). 예전엔 삭제 면제만 받아 미리보기에서
    // 사라진 채 untouched로 실려 배정이 그대로 재삽입됐다 — 지금은 확정이 막힌다.
    const 재입학생 = {
      ...재학생,
      studentProfileId: "sp-regrad",
      userId: "u-regrad",
      studentCode: "REGR2345",
      name: "재입학",
      birthDate: "2008-05-05",
      hasGraduatedEnrollment: true,
    };
    const existing = [재학생, 재입학생];
    listExisting.mockResolvedValue(existing);

    await expect(
      applyRosterPlan(admin, 2026, [row], fingerprint(existing), [], null),
    ).rejects.toThrow("BLOCKED");
    expect(applyRoster).not.toHaveBeenCalled();
    expect(noAudit()).toBe(true);
  });

  it("삭제 대상이 없으면 빈 배열로도 막지 않는다", async () => {
    // row가 재학생과 같은 학생코드라 이어붙어 missingFromFile이 비게 된다.
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    expect(applyRoster).toHaveBeenCalledTimes(1);
    expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual([]);
  });

  it("삭제 로그마다 actorName을 미리 넘겨 이름 재조회를 없앤다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const deleteLog = auditEntries()
      .find((c) => c.action === "user:delete");
    expect(deleteLog?.actorName).toBe(admin.name);
  });

  it("명단에서 빠진 학생마다 user:delete를 남기고 이름은 넣지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const deleteLogs = auditEntries()
      .filter((c) => c.action === "user:delete");
    expect(deleteLogs).toHaveLength(1);
    expect(deleteLogs[0]).toMatchObject({ targetType: "User", targetId: "u-1" });
    expect(JSON.stringify(deleteLogs[0])).not.toContain("김동혁");
  });

  it("배치 요약의 metadata에 deleted 건수를 남긴다", async () => {
    await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

    const summary = auditEntries()
      .find((c) => c.action === "enrollment:import");
    expect(summary!.metadata).toMatchObject({ deleted: 1 });
  });

  it("정상 반영 요약에 restored 건수를 남기지 않는다", async () => {
    await applyRosterPlan(admin, 2026, [row], fingerprint(), [], null);

    const summary = auditEntries()
      .find((c) => c.action === "enrollment:import");
    expect(summary!.metadata).not.toHaveProperty("restored");
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
      expect(noAudit()).toBe(true);
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
      expect(noAudit()).toBe(true);
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
      expect(noAudit()).toBe(true);
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

      const revokeLogs = auditEntries()
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
      expect(
        [...recordAudit.mock.calls, ...recordAuditMany.mock.calls].every(
          (c) => c[1] === txClient,
        ),
      ).toBe(true);
    });

    it("폐기된 코드가 없으면 아무 줄도 남기지 않는다", async () => {
      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

      expect(
        auditEntries().some((c) => c.action === "invite:revoke:roster"),
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

  it("대량 반출이라 감사로그를 남긴다 — 건수와 학년도만, 개인정보는 넣지 않는다", async () => {
    await exportRoster(admin);

    const entry = recordAudit.mock.calls.at(-1)?.[0];
    expect(entry?.action).toBe("roster:export");
    const metadata = JSON.stringify(entry?.metadata ?? {});
    expect(metadata).not.toContain("김동혁");
    expect(metadata).not.toContain("AAAA2345");
  });
});

/**
 * 「미리보기에서 본 그 내용만 반영한다」 — 학년도·명단 지문·삭제 대상 검사는
 * DB 쪽 명단이 그대로인지를 볼 뿐이라, 클라이언트가 되돌려 보낸 행 자체는 이
 * 봉인만 붙든다. 검증이 액션에 있던 동안에는 서비스만 읽어서는 이 규칙이
 * 있는지조차 알 수 없었다.
 */
describe("미리보기 봉인", () => {
  it("봉인이 없으면 반영하지 않는다", async () => {
    await expect(
      applyRosterPlan(admin, 2026, [row], fingerprint(), [], null, ""),
    ).rejects.toThrow("PREVIEW_TOKEN_INVALID");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("미리보기와 다른 행을 보내면 반영하지 않는다", async () => {
    const 봉인 = issuePreviewToken({
      year: 2026,
      rows: [row],
      deletionIds: [],
      rosterFingerprint: fingerprint(),
    });
    const 바꿔치기 = { ...row, number: 99 };

    await expect(
      applyRosterPlan(admin, 2026, [바꿔치기], fingerprint(), [], null, 봉인),
    ).rejects.toThrow("PREVIEW_TOKEN_INVALID");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("미리보기와 다른 삭제 대상을 보내면 반영하지 않는다", async () => {
    const 봉인 = issuePreviewToken({
      year: 2026,
      rows: [row],
      deletionIds: [],
      rosterFingerprint: fingerprint(),
    });

    await expect(
      applyRosterPlan(admin, 2026, [row], fingerprint(), ["sp-1"], 1, 봉인),
    ).rejects.toThrow("PREVIEW_TOKEN_INVALID");
    expect(applyRoster).not.toHaveBeenCalled();
  });

  it("권한 검사가 봉인 검사보다 먼저다 — 남의 파일 내용을 봉인으로 떠보지 못한다", async () => {
    await expect(
      applyRosterPlan(student, 2026, [row], fingerprint(), [], null, ""),
    ).rejects.toThrow("FORBIDDEN");
  });
});

/**
 * 미리보기는 **아무것도 저장하지 않지만 전교생을 통째로 읽어 돌려준다** —
 * 이름·생년월일·학년·반·번호·학생코드와 「누가 명단에서 빠지는가」까지.
 * 그 화면의 서버 액션은 `requireAuth()`만 하므로, 페이지 게이트를 건너뛰고
 * 액션을 직접 치면 `assertMayImport` 한 줄이 유일한 문이다.
 *
 * 그 한 줄을 붙드는 테스트가 없어서, 리팩터링으로 사라져도 전부 통과했다.
 */
describe("previewRoster()", () => {
  const file = { filename: "명단.csv", buffer: Buffer.from("") };

  beforeEach(() => {
    parseRoster.mockReset().mockResolvedValue({ rows: [row], notices: [] });
  });

  it("교사가 아니면 파일을 읽지도 않는다", async () => {
    await expect(previewRoster(student, file)).rejects.toThrow("FORBIDDEN");

    expect(parseRoster).not.toHaveBeenCalled();
    expect(listExisting).not.toHaveBeenCalled();
  });

  it("학부모도 막힌다 — 학생만 막고 끝나는 검사가 아니다", async () => {
    await expect(
      previewRoster(user("PARENT", "p-1"), file),
    ).rejects.toThrow("FORBIDDEN");
    expect(parseRoster).not.toHaveBeenCalled();
  });

  it("읽을 수 있는 줄이 없으면 EMPTY다", async () => {
    parseRoster.mockResolvedValue({ rows: [], notices: [] });

    await expect(previewRoster(admin, file)).rejects.toThrow("EMPTY");
    expect(listExisting).not.toHaveBeenCalled();
  });

  it("돌려준 지문은 확정이 다시 세우는 것과 같다 — 다르면 정상 흐름이 ROSTER_CHANGED로 막힌다", async () => {
    const existing = [재학생];
    listExisting.mockResolvedValue(existing);

    const preview = await previewRoster(admin, file);

    expect(preview.rosterFingerprint).toBe(createRosterFingerprint(existing));
  });

  it("봉인을 함께 낸다 — 그 봉인으로 곧바로 확정할 수 있다", async () => {
    const existing = [재학생];
    listExisting.mockResolvedValue(existing);

    const preview = await previewRoster(admin, file);

    await expect(
      applyWithToken(
        admin,
        preview.year,
        preview.rows,
        preview.rosterFingerprint,
        preview.plan.missingFromFile.map((s: { studentProfileId: string }) => s.studentProfileId),
        preview.plan.missingFromFile.length || null,
        preview.previewToken,
      ),
    ).resolves.toBeTruthy();
  });
});
