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
const listLiveForStudent = vi.fn();
const listPendingForAdmin = vi.fn();
const listActiveNow = vi.fn();
const listForParent = vi.fn();
const listAwaitingParentConsent = vi.fn();
const findOverlapping = vi.fn();
const lockStudentForPassCreation = vi.fn();
const transition = vi.fn();
const transitionUnexpired = vi.fn();
const findStudentProfileByUserId = vi.fn();
const isParentOf = vi.fn();
const displayYear = vi.fn();
const recordAudit = vi.fn();
const toQrPath = vi.fn((text: string) => ({ size: 24, d: `M${text}` }));
const txClient = { tx: "pass-request-service-test" };
const withTransaction = vi.fn(
  async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient),
);

vi.mock("@/modules/pass/pass.repo", () => ({
  createPass,
  findPass,
  findPassForVerify,
  listForStudent,
  listLiveForStudent,
  listPendingForAdmin,
  listActiveNow,
  listForParent,
  listAwaitingParentConsent,
  findOverlapping,
  lockStudentForPassCreation,
  transition,
  transitionUnexpired,
  findStudentProfileByUserId,
  isParentOf,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/pass/pass.qr", () => ({ toQrPath }));

const { PassError } = await import("@/modules/pass/pass.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const { verifyStudentCode } = await import("@/modules/pass/pass.token");
const { scanOrigin, tokenFromScanUrl } = await import("@/modules/pass/pass.url");
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
  listForStudent.mockReset().mockResolvedValue({ entries: [], total: 0 });
  listLiveForStudent.mockReset().mockResolvedValue([]);
  listPendingForAdmin.mockReset().mockResolvedValue([]);
  listActiveNow.mockReset().mockResolvedValue([]);
  listForParent.mockReset().mockResolvedValue({ entries: [], total: 0 });
  listAwaitingParentConsent.mockReset().mockResolvedValue([]);
  findOverlapping.mockReset().mockResolvedValue(null);
  lockStudentForPassCreation.mockReset().mockResolvedValue(true);
  transition.mockReset().mockResolvedValue(1);
  transitionUnexpired.mockReset().mockResolvedValue("UPDATED");
  findStudentProfileByUserId.mockReset().mockResolvedValue({ id: "sp-1" });
  isParentOf.mockReset().mockResolvedValue(true);
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
  toQrPath.mockReset().mockImplementation((text: string) => ({
    size: 24,
    d: `M${text}`,
  }));
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
    expect(findOverlapping).toHaveBeenCalledWith(
      "sp-1",
      new Date("2026-08-27T04:00:00.000Z"),
      new Date("2026-08-27T10:00:00.000Z"),
      txClient,
    );
    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 130_000,
      maxWait: 10_000,
    });
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

  it("명단 반영 잠금이 제한을 넘기면 재시도 가능한 업무 오류로 옮긴다", async () => {
    withTransaction.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { code: "P2028" }),
    );

    await expect(service.requestPass(student, OUTING, NOW)).rejects.toThrow(
      new PassError("PASS_BUSY"),
    );
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
    await service.withdrawPass(student, { passId: "p-1", reason: null });

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

  // 확인 모달이 받은 사유가 가는 곳. Pass 행의 취소 사유 칸과 감사로그 둘 다다 —
  // 앞은 학생 화면이 읽고, 뒤는 나중에 「왜 그랬나」를 되짚는 자료가 된다.
  it("사유를 적으면 취소 사유와 감사로그에 함께 남는다", async () => {
    await service.withdrawPass(student, { passId: "p-1", reason: "일정이 바뀜" });

    expect(transition).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      expect.objectContaining({ cancelReason: "일정이 바뀜" }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "pass:cancel",
        metadata: expect.objectContaining({ reason: "일정이 바뀜" }),
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

    await expect(service.withdrawPass(student, { passId: "p-1", reason: null })).rejects.toThrow(
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

    await expect(service.withdrawPass(student, { passId: "p-1", reason: null })).rejects.toThrow(
      new PassError("ALREADY_DECIDED"),
    );
    expect(auditEntries()).toEqual([]);
  });

  it("없는 출입증은 PASS_NOT_FOUND", async () => {
    findPass.mockResolvedValue(null);
    await expect(service.withdrawPass(student, { passId: "nope", reason: null })).rejects.toThrow(
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
      endAt: new Date("2026-08-27T09:00:00.000Z"),
    });
  });

  it("종료 시각에 도달한 신청에는 동의할 수 없다", async () => {
    findPass.mockResolvedValue({
      id: "p-1",
      studentProfileId: "sp-1",
      type: "OVERNIGHT",
      status: "REQUESTED",
      endAt: NOW,
    });

    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }, NOW),
    ).rejects.toThrow(new PassError("PASS_EXPIRED"));
    expect(transition).not.toHaveBeenCalled();
    expect(transitionUnexpired).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([]);
  });

  it("보호자가 동의하면 CONSENTED가 되고 감사로그를 남긴다", async () => {
    await service.consentPass(parent, { passId: "p-1", consentNote: null }, NOW);

    expect(transitionUnexpired).toHaveBeenCalledWith(
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
    transitionUnexpired.mockResolvedValue("UNCHANGED");
    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }, NOW),
    ).rejects.toThrow(new PassError("ALREADY_DECIDED"));
    expect(auditEntries()).toEqual([]);
  });

  it("원자 전이가 DB 시각 만료를 알리면 PASS_EXPIRED로 옮긴다", async () => {
    transitionUnexpired.mockResolvedValue("EXPIRED");

    await expect(
      service.consentPass(parent, { passId: "p-1", consentNote: null }, NOW),
    ).rejects.toThrow(new PassError("PASS_EXPIRED"));
    expect(auditEntries()).toEqual([]);
  });

  it("학생은 자기 신청에 스스로 동의할 수 없다", async () => {
    await expect(
      service.consentPass(student, { passId: "p-1", consentNote: null }),
    ).rejects.toThrow(ForbiddenError);
  });
});

/**
 * `/pass/<passId>`의 유일한 인가다 — 그 페이지에는 다른 가드가 없고, 이 함수가
 * 주는 행에는 사유·행선지·결재 메모까지 들어 있다. 세 갈래가 각기 다른 근거로
 * 통과하므로 갈래마다 한 줄씩 못 박는다.
 */
describe("getPassDetail", () => {
  const detail = { id: "p-9", studentProfileId: "sp-1", type: "OUTING" };

  beforeEach(() => {
    findPassForVerify.mockResolvedValue(detail);
  });

  it("없는 출입증은 PASS_NOT_FOUND", async () => {
    findPassForVerify.mockResolvedValue(null);
    await expect(service.getPassDetail(admin, "nope")).rejects.toThrow(
      new PassError("PASS_NOT_FOUND"),
    );
  });

  it("교사는 소유권을 묻지 않고 통과한다", async () => {
    await expect(service.getPassDetail(admin, "p-9")).resolves.toBe(detail);

    expect(findPassForVerify).toHaveBeenCalledWith("p-9", 2026);
    expect(findStudentProfileByUserId).not.toHaveBeenCalled();
    expect(isParentOf).not.toHaveBeenCalled();
  });

  it("본인 것이면 통과하고 보호자 관계는 묻지 않는다", async () => {
    await expect(service.getPassDetail(student, "p-9")).resolves.toBe(detail);

    expect(findStudentProfileByUserId).toHaveBeenCalledWith("u-student");
    expect(isParentOf).not.toHaveBeenCalled();
    expect(auditEntries()).toEqual([]);
  });

  it("자녀 것이면 보호자도 통과한다", async () => {
    // 학부모 계정에는 학생 프로필이 없다 — 통과 근거는 ParentStudent 관계뿐이다.
    findStudentProfileByUserId.mockResolvedValue(null);

    await expect(service.getPassDetail(parent, "p-9")).resolves.toBe(detail);
    expect(isParentOf).toHaveBeenCalledWith("u-parent", "sp-1");
  });

  it("남의 출입증은 학생에게 ForbiddenError이고 거부가 감사로그에 남는다", async () => {
    findStudentProfileByUserId.mockResolvedValue({ id: "sp-other" });
    isParentOf.mockResolvedValue(false);

    await expect(service.getPassDetail(student, "p-9")).rejects.toThrow(ForbiddenError);
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "authz:denied",
        targetType: "Pass",
        targetId: "p-9",
      }),
    ]);
  });

  it("남의 자녀는 보호자에게도 ForbiddenError다", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);
    isParentOf.mockResolvedValue(false);

    await expect(service.getPassDetail(parent, "p-9")).rejects.toThrow(ForbiddenError);
    expect(auditEntries()).toEqual([
      expect.objectContaining({ action: "authz:denied", targetId: "p-9" }),
    ]);
  });
});

describe("getMyPasses", () => {
  it("studentId를 인자로 받지 않는다 — 세션에서 유도한다", async () => {
    await service.getMyPasses(student);
    expect(findStudentProfileByUserId).toHaveBeenCalledWith("u-student");
    expect(listForStudent).toHaveBeenCalledWith("sp-1", 2026, {
      page: 1,
      skip: 0,
      take: 20,
    });
  });

  it("학생 계정이 아니면 NO_STUDENT_PROFILE", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);
    await expect(service.getMyPasses(student)).rejects.toThrow(
      new PassError("NO_STUDENT_PROFILE"),
    );
  });

  it("마지막 페이지보다 큰 요청은 실제 마지막 페이지로 보정해 다시 읽는다", async () => {
    listForStudent
      .mockResolvedValueOnce({ entries: [], total: 21 })
      .mockResolvedValueOnce({ entries: [{ id: "p-last" }], total: 21 });

    const result = await service.getMyPasses(student, 999);

    expect(listForStudent).toHaveBeenNthCalledWith(2, "sp-1", 2026, {
      page: 2,
      skip: 20,
      take: 20,
    });
    expect(result).toMatchObject({ page: 2, pageCount: 2, total: 21 });
    expect(result.entries).toEqual([{ id: "p-last" }]);
  });
});

describe("대시보드 출입증", () => {
  it("전체 내역 첫 페이지를 자르지 않고 DB의 유효 목록 전용 질의를 쓴다", async () => {
    await service.getMyLivePasses(student, NOW);

    expect(listLiveForStudent).toHaveBeenCalledWith("sp-1", NOW, 2026, 5);
    expect(listForStudent).not.toHaveBeenCalled();
  });

  it("보호자 동의 대기는 화면이 쓸 상한을 repo까지 전달한다", async () => {
    await service.getMyChildPassesAwaitingConsent(parent, NOW, 5);

    expect(listAwaitingParentConsent).toHaveBeenCalledWith(
      "u-parent",
      NOW,
      2026,
      5,
    );
  });
});

describe("getMyStudentQr", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
    process.env.BETTER_AUTH_URL = "https://gbsw.example.kr";
  });

  it("학생 본인에게 QR과 주소를 준다", async () => {
    const at = new Date("2026-08-27T05:30:00.000Z");
    findStudentProfileByUserId.mockResolvedValue({ id: "student0001" });

    const result = await service.getMyStudentQr(student, at);
    const text = toQrPath.mock.calls[0]?.[0];
    const token = typeof text === "string" ? tokenFromScanUrl(text, scanOrigin()) : null;

    expect(result.qr.size).toBeGreaterThan(20);
    expect(result.qr.d.startsWith("M")).toBe(true);
    expect(typeof result.validUntil).toBe("string");
    expect(token).not.toBeNull();
    expect(verifyStudentCode(token!, at)).toEqual({ studentProfileId: "student0001" });
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
