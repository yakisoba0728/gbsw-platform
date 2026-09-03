import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

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
const findCurrentYearForUpdate = vi.fn();
const lockEligibleStudentForPassCreation = vi.fn();
const isEligibleStudent = vi.fn();
const transition = vi.fn();
const transitionUnexpired = vi.fn();
const findStudentProfileByUserId = vi.fn();
const isParentOf = vi.fn();
const displayYear = vi.fn();
const toQrPath = vi.fn((text: string) => ({ size: 24, d: `M${text}` }));
const {
  recordAudit,
  auditEntries,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("pass-request-service-test");

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
  findCurrentYearForUpdate,
  lockEligibleStudentForPassCreation,
  isEligibleStudent,
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

const student = user("STUDENT", "u-student", {
  email: "u-student@gbsw.hs.kr",
});
const parent = user("PARENT", "u-parent", { email: "u-parent@gbsw.hs.kr" });
const admin = user("ADMIN", "u-admin", { email: "u-admin@gbsw.hs.kr" });

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
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  lockEligibleStudentForPassCreation.mockReset().mockResolvedValue(true);
  isEligibleStudent.mockReset().mockResolvedValue(true);
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
  withTransaction.mockClear();
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

  it("자격 판정은 교사의 직접 부여와 같은 잠금 함수를 현재 학년도로 부른다", async () => {
    await service.requestPass(student, OUTING, NOW);

    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(lockEligibleStudentForPassCreation).toHaveBeenCalledWith(
      "sp-1",
      2026,
      txClient,
    );
    // 잠금 순서는 AcademicYear → User → StudentProfile → Enrollment다.
    expect(findCurrentYearForUpdate.mock.invocationCallOrder[0]!).toBeLessThan(
      lockEligibleStudentForPassCreation.mock.invocationCallOrder[0]!,
    );
  });

  // 재학·활성·미탈퇴를 가르는 것은 repo의 SQL이다(대조는 pass.repo.test.ts).
  // 여기서는 자격 함수가 거절하면 신청이 서지 않는다는 것만 본다.
  it.each([["전학·졸업"], ["계정 비활성"], ["탈퇴 처리"]])(
    "%s로 자격을 잃은 학생은 신청할 수 없다",
    async () => {
      lockEligibleStudentForPassCreation.mockResolvedValue(false);

      await expect(service.requestPass(student, OUTING, NOW)).rejects.toThrow(
        new PassError("NOT_ENROLLED"),
      );
      expect(createPass).not.toHaveBeenCalled();
      expect(auditEntries()).toEqual([]);
    },
  );

  it("현재 학년도가 없으면 자격을 물을 것도 없이 막힌다", async () => {
    findCurrentYearForUpdate.mockResolvedValue(null);

    await expect(service.requestPass(student, OUTING, NOW)).rejects.toThrow(
      new PassError("NOT_ENROLLED"),
    );
    expect(lockEligibleStudentForPassCreation).not.toHaveBeenCalled();
    expect(createPass).not.toHaveBeenCalled();
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

  it("승인된 출입증이 없어도 준다 — 출입증을 아예 조회하지 않는다", async () => {
    await expect(service.getMyStudentQr(student)).resolves.toBeDefined();
    expect(findPass).not.toHaveBeenCalled();
    expect(listForStudent).not.toHaveBeenCalled();
  });

  it("20초가 지나면 다른 코드가 나온다", async () => {
    const at = new Date("2026-08-27T05:30:00.000Z");
    const a = await service.getMyStudentQr(student, at);
    const b = await service.getMyStudentQr(student, new Date(at.getTime() + 20_000));
    expect(a.qr.d).not.toBe(b.qr.d);
    expect(a.validUntil).not.toBe(b.validUntil);
  });

  it("학생 역할인데 프로필 행이 없으면 User를 대상으로 거부를 기록한다", async () => {
    findStudentProfileByUserId.mockResolvedValue(null);

    await expect(service.getMyStudentQr(student)).rejects.toThrow(ForbiddenError);

    expect(auditEntries()).toEqual([
      expect.objectContaining({
        actorUserId: "u-student",
        action: "authz:denied",
        targetType: "User",
        targetId: "u-student",
        metadata: { action: "pass:request" },
      }),
    ]);
  });

  // 신청과 같은 자격을 요구한다 — 조건의 판별은 repo의 SQL이 한다.
  it.each([["전학·졸업"], ["계정 비활성"], ["탈퇴 처리"]])(
    "%s로 자격을 잃은 학생에게는 학생증도 내주지 않는다",
    async () => {
      isEligibleStudent.mockResolvedValue(false);

      await expect(service.getMyStudentQr(student)).rejects.toThrow(ForbiddenError);
      expect(toQrPath).not.toHaveBeenCalled();
      expect(auditEntries()).toEqual([
        expect.objectContaining({
          actorUserId: "u-student",
          action: "authz:denied",
          targetType: "StudentProfile",
          targetId: "sp-1",
          metadata: { action: "pass:request" },
        }),
      ]);
    },
  );

  it("자격은 현재 학년도로 묻고 학생증은 행을 잠그지 않는다", async () => {
    await service.getMyStudentQr(student);

    expect(displayYear).toHaveBeenCalled();
    expect(isEligibleStudent).toHaveBeenCalledWith("sp-1", 2026);
    expect(lockEligibleStudentForPassCreation).not.toHaveBeenCalled();
    expect(findCurrentYearForUpdate).not.toHaveBeenCalled();
  });

  it("현재 학년도가 없으면 자격을 묻지 않고 거부한다", async () => {
    displayYear.mockResolvedValue(null);

    await expect(service.getMyStudentQr(student)).rejects.toThrow(ForbiddenError);
    expect(isEligibleStudent).not.toHaveBeenCalled();
  });

  it.each([
    ["교사", admin],
    ["학부모", parent],
  ])("%s는 학생 프로필을 조회하기 전에 막힌다", async (_label, actor) => {
    await expect(service.getMyStudentQr(actor)).rejects.toThrow(ForbiddenError);
    expect(findStudentProfileByUserId).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
  });
});
