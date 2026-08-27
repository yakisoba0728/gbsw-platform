import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

// request.service → pass.qr → "server-only". 그 마커는 웹팩의 react-server 조건에서만
// 무해한 empty.js로 풀리고 vitest에서는 그냥 던진다 — 무해하게 만든다.
// (tests/modules/pass/pass.qr.test.ts와 같은 처리다.)
vi.mock("server-only", () => ({}));

const createPass = vi.fn();
const findPass = vi.fn();
const findPassForVerify = vi.fn();
const listForStudent = vi.fn();
const listPendingForAdmin = vi.fn();
const listActiveNow = vi.fn();
const listForParent = vi.fn();
const findOverlapping = vi.fn();
const transition = vi.fn();
const findStudentProfileByUserId = vi.fn();
const isParentOf = vi.fn();
const displayYear = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "pass-request-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/pass/pass.repo", () => ({
  createPass,
  findPass,
  findPassForVerify,
  listForStudent,
  listPendingForAdmin,
  listActiveNow,
  listForParent,
  findOverlapping,
  transition,
  findStudentProfileByUserId,
  isParentOf,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { PassError } = await import("@/modules/pass/pass.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/pass/request.service");

function user(role: SessionUser["role"], id: string): SessionUser {
  return {
    id,
    name: "테스트",
    email: `${id}@gbsw.hs.kr`,
    role,
    status: "ACTIVE",
    deletedAt: null,
    mustChangePassword: false,
  };
}

const student = user("STUDENT", "u-student");
const parent = user("PARENT", "u-parent");
const admin = user("ADMIN", "u-admin");

/** 2026-08-27 09:00 KST */
const NOW = new Date("2026-08-27T00:00:00.000Z");

const OUTING = {
  type: "OUTING" as const,
  date: "2026-08-27",
  startTime: "14:00",
  endTime: "18:00",
  destination: "치과",
  reason: "정기 검진",
};

const OVERNIGHT = {
  type: "OVERNIGHT" as const,
  startDate: "2026-08-28",
  startTime: "18:00",
  endDate: "2026-08-29",
  endTime: "21:00",
  destination: "본가",
  reason: "가족 행사",
};

/** recordAudit이 받은 입력들. 감사로그 검증이 이 헬퍼 하나를 쓴다. */
function auditEntries(): { action: string; targetId?: string; metadata?: Record<string, unknown> }[] {
  return recordAudit.mock.calls.map(([entry]) => entry);
}

beforeEach(() => {
  createPass.mockReset().mockResolvedValue({ id: "p-1" });
  findPass.mockReset();
  findPassForVerify.mockReset();
  listForStudent.mockReset().mockResolvedValue([]);
  listPendingForAdmin.mockReset().mockResolvedValue([]);
  listActiveNow.mockReset().mockResolvedValue([]);
  listForParent.mockReset().mockResolvedValue([]);
  findOverlapping.mockReset().mockResolvedValue(null);
  transition.mockReset().mockResolvedValue(1);
  findStudentProfileByUserId.mockReset().mockResolvedValue({ id: "sp-1" });
  isParentOf.mockReset().mockResolvedValue(true);
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
  withTransaction
    .mockReset()
    .mockImplementation(async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient));
});

describe("requestPass", () => {
  it("학생이 외출을 신청하면 REQUESTED로 만들고 감사로그를 남긴다", async () => {
    await service.requestPass(student, OUTING, NOW);

    expect(createPass).toHaveBeenCalledWith(
      expect.objectContaining({
        studentProfileId: "sp-1",
        type: "OUTING",
        status: "REQUESTED",
        destination: "치과",
        requestedByUserId: "u-student",
        requestedByName: "테스트",
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({ action: "pass:request", targetId: "p-1" }),
    ]);
  });

  it("외박도 REQUESTED다 — 동의는 그다음 단계다", async () => {
    await service.requestPass(student, OVERNIGHT, NOW);
    expect(createPass).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OVERNIGHT", status: "REQUESTED" }),
      txClient,
    );
  });

  it("학부모는 신청할 수 없다", async () => {
    await expect(service.requestPass(parent, OUTING, NOW)).rejects.toThrow(ForbiddenError);
    expect(createPass).not.toHaveBeenCalled();
  });

  it("학생 계정이 아니면 NO_STUDENT_PROFILE", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);
    await expect(service.requestPass(student, OUTING, NOW)).rejects.toThrow(
      new PassError("NO_STUDENT_PROFILE"),
    );
  });

  it("기간이 겹치면 OVERLAPPING_PASS", async () => {
    findOverlapping.mockResolvedValue({ id: "p-other" });
    await expect(service.requestPass(student, OUTING, NOW)).rejects.toThrow(
      new PassError("OVERLAPPING_PASS"),
    );
    expect(createPass).not.toHaveBeenCalled();
  });

  it("기간 규칙 위반은 pass.window의 코드가 그대로 올라온다", async () => {
    await expect(
      service.requestPass(student, { ...OUTING, endTime: "13:00" }, NOW),
    ).rejects.toThrow(new PassError("INVALID_PERIOD"));
  });

  it("감사 metadata의 날짜는 문자열이다 — JSON 열이라 Date를 넣으면 안 된다", async () => {
    await service.requestPass(student, OUTING, NOW);
    const [entry] = auditEntries();
    expect(typeof entry.metadata?.startAt).toBe("string");
    expect(typeof entry.metadata?.endAt).toBe("string");
  });
});

describe("withdrawPass", () => {
  beforeEach(() => {
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-1",
      type: "OUTING",
      status: "REQUESTED",
    });
  });

  it("본인 신청이면 취소하고 감사로그를 남긴다", async () => {
    await service.withdrawPass(student, { passId: "p-1" });

    expect(transition).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      expect.objectContaining({ status: "CANCELLED", cancelledByName: "테스트" }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "pass:cancel",
        metadata: expect.objectContaining({ byOwner: true }),
      }),
    ]);
  });

  it("남의 신청은 ForbiddenError이고 거부가 감사로그에 남는다", async () => {
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-other",
      type: "OUTING",
      status: "REQUESTED",
    });

    await expect(service.withdrawPass(student, { passId: "p-1" })).rejects.toThrow(
      ForbiddenError,
    );
    expect(transition).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([
      expect.objectContaining({ action: "authz:denied" }),
    ]);
  });

  it("이미 승인된 것은 학생이 못 무른다 — 그건 교사의 일이다", async () => {
    transition.mockResolvedValue(0);
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-1",
      type: "OUTING",
      status: "APPROVED",
    });

    await expect(service.withdrawPass(student, { passId: "p-1" })).rejects.toThrow(
      new PassError("ALREADY_DECIDED"),
    );
    expect(auditEntries()).toEqual([]);
  });

  it("없는 출입증은 PASS_NOT_FOUND", async () => {
    findPass.mockResolvedValue(null);
    await expect(service.withdrawPass(student, { passId: "nope" })).rejects.toThrow(
      new PassError("PASS_NOT_FOUND"),
    );
  });
});

describe("consentPass", () => {
  beforeEach(() => {
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-1",
      type: "OVERNIGHT",
      status: "REQUESTED",
    });
  });

  it("보호자가 동의하면 CONSENTED가 되고 감사로그를 남긴다", async () => {
    await service.consentPass(parent, { passId: "p-1", consentNote: null });

    expect(transition).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED"],
      expect.objectContaining({
        status: "CONSENTED",
        consentedByUserId: "u-parent",
        consentedByName: "테스트",
        consentByProxy: false,
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({ action: "pass:consent", targetId: "p-1" }),
    ]);
  });

  it("남의 자녀는 ForbiddenError다", async () => {
    isParentOf.mockResolvedValue(false);
    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }),
    ).rejects.toThrow(ForbiddenError);
    expect(transition).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([expect.objectContaining({ action: "authz:denied" })]);
  });

  it("외출에는 동의가 없다 — CONSENT_NOT_ALLOWED", async () => {
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-1",
      type: "OUTING",
      status: "REQUESTED",
    });
    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }),
    ).rejects.toThrow(new PassError("CONSENT_NOT_ALLOWED"));
  });

  it("이미 처리된 신청이면 ALREADY_DECIDED", async () => {
    transition.mockResolvedValue(0);
    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }),
    ).rejects.toThrow(new PassError("ALREADY_DECIDED"));
    expect(auditEntries()).toEqual([]);
  });

  it("학생은 자기 신청에 스스로 동의할 수 없다", async () => {
    await expect(
      service.consentPass(student, { passId: "p-1", consentNote: null }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("getMyPasses", () => {
  it("studentId를 인자로 받지 않는다 — 세션에서 유도한다", async () => {
    await service.getMyPasses(student);
    expect(findStudentProfileByUserId).toHaveBeenCalledWith("u-student");
    expect(listForStudent).toHaveBeenCalledWith("sp-1", 2026);
  });

  it("학생 계정이 아니면 NO_STUDENT_PROFILE", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);
    await expect(service.getMyPasses(student)).rejects.toThrow(
      new PassError("NO_STUDENT_PROFILE"),
    );
  });
});

describe("getMyStudentQr", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
    process.env.BETTER_AUTH_URL = "https://gbsw.example.kr";
  });

  it("학생 본인에게 QR과 주소를 준다", async () => {
    const result = await service.getMyStudentQr(student);

    expect(result.qr.size).toBeGreaterThan(20);
    expect(result.qr.d.startsWith("M")).toBe(true);
    expect(typeof result.validUntil).toBe("string");
  });

  // **학생증의 성질이다.** 승인된 출입증이 하나도 없어도 나온다 — 학생증은
  // 승인의 결과물이 아니라 신원이고, 찍었을 때 「출입증 없음」이 정상적인 답이다.
  it("승인된 출입증이 없어도 준다 — 출입증을 아예 조회하지 않는다", async () => {
    await expect(service.getMyStudentQr(student)).resolves.toBeDefined();
    expect(findPass).not.toHaveBeenCalled();
    expect(listForStudent).not.toHaveBeenCalled();
  });

  // 20초마다 갈린다 — 찍어 둔 사진을 못 쓰게 하는 성질이다.
  it("20초가 지나면 다른 코드가 나온다", async () => {
    const at = new Date("2026-08-27T05:30:00.000Z");
    const a = await service.getMyStudentQr(student, at);
    const b = await service.getMyStudentQr(student, new Date(at.getTime() + 20_000));
    expect(a.qr.d).not.toBe(b.qr.d);
    expect(a.validUntil).not.toBe(b.validUntil);
  });

  // 교사·보호자에게는 없다. 남이 대신 띄울 수 있으면 학생증이 아니게 된다.
  it.each([
    ["교사", "admin"],
    ["학부모", "parent"],
  ])("%s는 학생 프로필이 없어 ForbiddenError다", async (_label, who) => {
    findStudentProfileByUserId.mockResolvedValue(null);
    const actor = who === "admin" ? admin : parent;
    await expect(service.getMyStudentQr(actor)).rejects.toThrow(ForbiddenError);
    expect(recordAudit).toHaveBeenCalled();
  });
});
