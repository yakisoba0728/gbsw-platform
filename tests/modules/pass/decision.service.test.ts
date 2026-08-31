import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/core/auth/session";

const createPass = vi.fn();
const findPass = vi.fn();
const findPassForVerify = vi.fn();
const listForStudent = vi.fn();
const listPendingForAdmin = vi.fn();
const listActiveNow = vi.fn();
const listHistory = vi.fn();
const listForParent = vi.fn();
const findOverlapping = vi.fn();
const lockStudentForPassCreation = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const lockEligibleStudentForPassCreation = vi.fn();
const currentDatabaseTime = vi.fn();
const transition = vi.fn();
const transitionUnexpired = vi.fn();
const findStudentProfileByUserId = vi.fn();
const isParentOf = vi.fn();
const displayYear = vi.fn();
const recordAudit = vi.fn();
const txClient = { tx: "pass-decision-service-test" };
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
  listHistory,
  listForParent,
  findOverlapping,
  lockStudentForPassCreation,
  findCurrentYearForUpdate,
  lockEligibleStudentForPassCreation,
  currentDatabaseTime,
  transition,
  transitionUnexpired,
  findStudentProfileByUserId,
  isParentOf,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { PassError } = await import("@/modules/pass/pass.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/pass/decision.service");

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
const admin = user("ADMIN", "u-admin");

/** recordAudit이 받은 입력들. 감사로그 검증이 이 헬퍼 하나를 쓴다. */
function auditEntries(): {
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}[] {
  return recordAudit.mock.calls.map(([entry]) => entry);
}

beforeEach(() => {
  createPass.mockReset().mockResolvedValue({ id: "p-1" });
  findPass.mockReset();
  findPassForVerify.mockReset();
  listForStudent.mockReset().mockResolvedValue([]);
  listPendingForAdmin.mockReset().mockResolvedValue([]);
  listActiveNow.mockReset().mockResolvedValue([]);
  listHistory.mockReset().mockResolvedValue({ entries: [], total: 0 });
  listForParent.mockReset().mockResolvedValue([]);
  findOverlapping.mockReset().mockResolvedValue(null);
  lockStudentForPassCreation.mockReset().mockResolvedValue(true);
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  lockEligibleStudentForPassCreation.mockReset().mockResolvedValue(true);
  currentDatabaseTime.mockReset().mockResolvedValue(NOW);
  transition.mockReset().mockResolvedValue(1);
  transitionUnexpired.mockReset().mockResolvedValue("UPDATED");
  findStudentProfileByUserId.mockReset().mockResolvedValue({ id: "sp-1" });
  isParentOf.mockReset().mockResolvedValue(true);
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
  withTransaction
    .mockReset()
    .mockImplementation(async <T>(fn: (tx: typeof txClient) => Promise<T>) => fn(txClient));
});

const NOW = new Date("2026-08-27T00:00:00.000Z"); // 09:00 KST

function pending(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    studentProfileId: "sp-1",
    type: "OUTING",
    status: "REQUESTED",
    startAt: new Date("2026-08-27T05:00:00.000Z"),
    endAt: new Date("2026-08-27T09:00:00.000Z"),
    consentedAt: null,
    consentByProxy: false,
    ...over,
  };
}

describe("approvePass", () => {
  it("종료 시각에 도달한 신청은 승인할 수 없다", async () => {
    findPass.mockResolvedValue(pending({ endAt: NOW }));

    await expect(
      service.approvePass(
        admin,
        { passId: "p-1", decisionNote: null, consentNote: null },
        NOW,
      ),
    ).rejects.toThrow(new PassError("PASS_EXPIRED"));
    expect(transition).not.toHaveBeenCalled();
    expect(transitionUnexpired).not.toHaveBeenCalled();
  });

  it("외출은 그대로 승인된다", async () => {
    findPass.mockResolvedValue(pending());
    await service.approvePass(
      admin,
      { passId: "p-1", decisionNote: "병원 예약 확인", consentNote: null },
      NOW,
    );

    expect(transitionUnexpired).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      NOW,
      expect.objectContaining({
        status: "APPROVED",
        decidedByUserId: "u-admin",
        decidedByName: "테스트",
        decisionNote: "병원 예약 확인",
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "pass:approve",
        metadata: expect.objectContaining({
          byProxy: false,
          decisionNote: "병원 예약 확인",
          consentNote: null,
        }),
      }),
    ]);
  });

  it("외박인데 동의도 대행도 없으면 CONSENT_REQUIRED", async () => {
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    await expect(
      service.approvePass(
        admin,
        { passId: "p-1", decisionNote: null, consentNote: null },
        NOW,
      ),
    ).rejects.toThrow(new PassError("CONSENT_REQUIRED"));
    expect(transitionUnexpired).not.toHaveBeenCalled();
  });

  it("보호자가 이미 동의했으면 그대로 승인된다", async () => {
    findPass.mockResolvedValue(
      pending({ type: "OVERNIGHT", status: "CONSENTED", consentedAt: new Date() }),
    );
    await expect(
      service.approvePass(
        admin,
        { passId: "p-1", decisionNote: "확인 완료", consentNote: null },
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(transitionUnexpired).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      NOW,
      expect.objectContaining({
        status: "APPROVED",
        decisionNote: "확인 완료",
      }),
      txClient,
    );
  });

  it("이미 보호자가 확인한 외박은 임의의 대행 값으로 확인 기록을 덮지 않는다", async () => {
    findPass.mockResolvedValue(
      pending({ type: "OVERNIGHT", status: "CONSENTED", consentedAt: new Date() }),
    );

    await service.approvePass(
      admin,
      {
        passId: "p-1",
        byProxy: "on",
        decisionNote: "교사 승인 메모",
        consentNote: "덮어쓰면 안 되는 값",
      },
      NOW,
    );

    const update = transitionUnexpired.mock.calls[0]?.[3];
    expect(update).toMatchObject({
      status: "APPROVED",
      decisionNote: "교사 승인 메모",
    });
    expect(update).not.toHaveProperty("consentedAt");
    expect(update).not.toHaveProperty("consentNote");
  });

  it("대행 체크가 있으면 교사 이름으로 보호자 확인이 함께 찍힌다", async () => {
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    await service.approvePass(
      admin,
      {
        passId: "p-1",
        byProxy: "on",
        decisionNote: null,
        consentNote: "어머니와 전화 확인",
      },
      NOW,
    );

    expect(transitionUnexpired).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED"],
      NOW,
      expect.objectContaining({
        status: "APPROVED",
        consentByProxy: true,
        consentedByUserId: "u-admin",
        consentedByName: "테스트",
        consentNote: "어머니와 전화 확인",
        decisionNote: null,
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          byProxy: true,
          decisionNote: null,
          consentNote: "어머니와 전화 확인",
        }),
      }),
    ]);
  });

  it("대행 승인 직전 보호자가 확인하면 보호자 기록을 덮지 않고 승인만 한다", async () => {
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    transitionUnexpired
      .mockResolvedValueOnce("UNCHANGED")
      .mockResolvedValueOnce("UPDATED");

    await service.approvePass(
      admin,
      {
        passId: "p-1",
        byProxy: "on",
        decisionNote: null,
        consentNote: "어머니와 전화 확인",
      },
      NOW,
    );

    expect(transitionUnexpired).toHaveBeenNthCalledWith(
      1,
      "p-1",
      ["REQUESTED"],
      NOW,
      expect.objectContaining({
        consentByProxy: true,
        consentNote: "어머니와 전화 확인",
      }),
      txClient,
    );
    expect(transitionUnexpired).toHaveBeenNthCalledWith(
      2,
      "p-1",
      ["CONSENTED"],
      NOW,
      expect.not.objectContaining({
        consentByProxy: true,
        consentNote: "어머니와 전화 확인",
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          byProxy: false,
          decisionNote: null,
          consentNote: null,
        }),
      }),
    ]);
  });

  it("이미 처리된 신청은 ALREADY_DECIDED이고 감사로그가 두 줄 남지 않는다", async () => {
    findPass.mockResolvedValue(pending());
    transitionUnexpired.mockResolvedValue("UNCHANGED");
    await expect(
      service.approvePass(
        admin,
        { passId: "p-1", decisionNote: null, consentNote: null },
        NOW,
      ),
    ).rejects.toThrow(new PassError("ALREADY_DECIDED"));
    expect(auditEntries()).toEqual([]);
  });

  it("원자 전이가 DB 시각 만료를 알리면 PASS_EXPIRED로 옮긴다", async () => {
    findPass.mockResolvedValue(pending());
    transitionUnexpired.mockResolvedValue("EXPIRED");

    await expect(
      service.approvePass(
        admin,
        { passId: "p-1", decisionNote: null, consentNote: null },
        NOW,
      ),
    ).rejects.toThrow(new PassError("PASS_EXPIRED"));
    expect(auditEntries()).toEqual([]);
  });

  it("학생은 승인할 수 없다", async () => {
    findPass.mockResolvedValue(pending());
    await expect(
      service.approvePass(student, {
        passId: "p-1",
        decisionNote: null,
        consentNote: null,
      }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("rejectPass", () => {
  it("사유와 함께 반려하고 감사로그에 사유가 남는다", async () => {
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    await service.rejectPass(admin, { passId: "p-1", decisionNote: "기간이 너무 깁니다" });

    expect(transition).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      expect.objectContaining({ status: "REJECTED", decisionNote: "기간이 너무 깁니다" }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "pass:reject",
        metadata: expect.objectContaining({ reason: "기간이 너무 깁니다" }),
      }),
    ]);
  });

  it("동의 전에도 반려할 수 있다", async () => {
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT", status: "REQUESTED" }));
    await expect(
      service.rejectPass(admin, { passId: "p-1", decisionNote: "안 됩니다" }),
    ).resolves.toBeUndefined();
  });
});

describe("issuePass", () => {
  const OUTING = {
    type: "OUTING" as const,
    studentId: "sp-1",
    endTime: "18:00",
    destination: "치과",
    reason: "정기 검진",
  };

  it("바로 APPROVED로 만들고 시작은 지금이다", async () => {
    await service.issuePass(admin, OUTING, NOW);

    expect(createPass).toHaveBeenCalledWith(
      expect.objectContaining({
        studentProfileId: "sp-1",
        status: "APPROVED",
        startAt: NOW,
        decidedByUserId: "u-admin",
        requestedByUserId: "u-admin",
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({ action: "pass:issue", targetId: "p-1" }),
    ]);
    expect(withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 130_000,
      maxWait: 10_000,
    });
  });

  it("외박은 보호자 확인이 함께 찍힌다", async () => {
    await service.issuePass(
      admin,
      {
        type: "OVERNIGHT",
        studentId: "sp-1",
        endDate: "2026-08-29",
        endTime: "21:00",
        destination: "본가",
        reason: "가족 행사",
        guardianConfirmed: "on",
        consentNote: "아버지와 전화 확인",
      },
      NOW,
    );

    expect(createPass).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "APPROVED",
        consentByProxy: true,
        consentedByName: "테스트",
        consentNote: "아버지와 전화 확인",
      }),
      txClient,
    );
  });

  it("겹치면 직접 부여도 막힌다", async () => {
    findOverlapping.mockResolvedValue({ id: "p-other" });
    await expect(service.issuePass(admin, OUTING, NOW)).rejects.toThrow(
      new PassError("OVERLAPPING_PASS"),
    );
  });

  it("현재 학년도 재학생이 아니거나 계정이 비활성이면 직접 부여할 수 없다", async () => {
    lockEligibleStudentForPassCreation.mockResolvedValue(false);

    await expect(service.issuePass(admin, OUTING, NOW)).rejects.toThrow(
      new PassError("STUDENT_NOT_ELIGIBLE"),
    );
    expect(createPass).not.toHaveBeenCalled();
  });

  it("잠금을 얻은 DB 시각에 이미 끝났으면 승인 출입증을 만들지 않는다", async () => {
    currentDatabaseTime.mockResolvedValue(new Date("2026-08-27T09:00:00.000Z"));

    await expect(service.issuePass(admin, OUTING, NOW)).rejects.toThrow(
      new PassError("PASS_EXPIRED"),
    );
    expect(findOverlapping).not.toHaveBeenCalled();
    expect(createPass).not.toHaveBeenCalled();
  });

  it("명단 반영 잠금이 제한을 넘기면 재시도 가능한 업무 오류로 옮긴다", async () => {
    withTransaction.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "P2028" }));

    await expect(service.issuePass(admin, OUTING, NOW)).rejects.toThrow(
      new PassError("PASS_BUSY"),
    );
  });

  it("학생은 직접 부여할 수 없다", async () => {
    await expect(service.issuePass(student, OUTING, NOW)).rejects.toThrow(ForbiddenError);
  });
});

describe("cancelPass", () => {
  it("승인된 것도 무를 수 있다", async () => {
    findPass.mockResolvedValue(pending({ status: "APPROVED" }));
    await service.cancelPass(admin, { passId: "p-1", reason: "학부모 요청" });

    expect(transition).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED", "APPROVED"],
      expect.objectContaining({ status: "CANCELLED", cancelReason: "학부모 요청" }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        action: "pass:cancel",
        metadata: expect.objectContaining({ byOwner: false, reason: "학부모 요청" }),
      }),
    ]);
  });

  it("이미 취소된 것은 ALREADY_CANCELLED", async () => {
    findPass.mockResolvedValue(pending({ status: "CANCELLED" }));
    transition.mockResolvedValue(0);
    await expect(
      service.cancelPass(admin, { passId: "p-1", reason: null }),
    ).rejects.toThrow(new PassError("ALREADY_CANCELLED"));
  });
});

describe("목록", () => {
  it("결재 대기는 교사만 본다", async () => {
    await expect(service.listPendingPasses(student, NOW)).rejects.toThrow(ForbiddenError);
    await service.listPendingPasses(admin, NOW);
    expect(listPendingForAdmin).toHaveBeenCalledWith(NOW, 2026);
  });

  it("지금 유효한 목록도 교사만 본다", async () => {
    await service.listActivePasses(admin, NOW);
    expect(listActiveNow).toHaveBeenCalledWith(NOW, 2026);
  });
});

describe("전체 내역", () => {
  const query = {
    type: undefined,
    status: undefined,
    q: undefined,
    from: "2026-08-01",
    to: "2026-08-26",
    page: 1,
  };

  it("학생은 볼 수 없다 — 남의 외출까지 통째로 읽히는 자리다", async () => {
    await expect(service.listPassHistory(student, query)).rejects.toThrow(ForbiddenError);
    expect(listHistory).not.toHaveBeenCalled();
  });

  /** 내보내기 조건은 쪽 번호만 빠진 같은 모양이다. */
  const exportInput = {
    type: undefined,
    status: undefined,
    q: undefined,
    from: "2026-08-01",
    to: "2026-08-26",
  };

  it("학생은 내보낼 수도 없다", async () => {
    await expect(service.exportPassHistory(student, exportInput)).rejects.toThrow(
      ForbiddenError,
    );
    expect(listHistory).not.toHaveBeenCalled();
  });

  it("교사는 고른 기간과 쪽으로 조회한다", async () => {
    listHistory.mockResolvedValue({ entries: [], total: 45 });
    const result = await service.listPassHistory(admin, { ...query, page: 3 });

    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        // 8/1 00:00 KST ~ 8/27 00:00 KST (끝날을 통째로 포함한다)
        since: new Date("2026-07-31T15:00:00.000Z"),
        until: new Date("2026-08-26T15:00:00.000Z"),
        skip: 40,
        take: 20,
      }),
      2026,
    );
    expect(result.pageCount).toBe(3); // 45건 / 20
  });

  it("검색어가 4자리면 학번으로도 읽는다", async () => {
    await service.listPassHistory(admin, { ...query, q: "2305" });
    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "2305",
        studentNumber: { grade: 2, classNo: 3, number: 5 },
      }),
      2026,
    );
  });

  it("이름 검색에는 학번 조건이 붙지 않는다", async () => {
    await service.listPassHistory(admin, { ...query, q: "김민준" });
    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ q: "김민준", studentNumber: undefined }),
      2026,
    );
  });

  it("내보내기는 쪽을 나누지 않는다 — 조건에 맞는 전부가 한 파일이다", async () => {
    const { filename } = await service.exportPassHistory(admin, exportInput);

    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: null }),
      2026,
    );
    // 파일 이름이 곧 기간이다 — 조건을 바꿔 두 번 받아도 서로 덮어쓰지 않는다.
    expect(filename).toBe("출입증내역_2026-08-01~2026-08-26.xlsx");
  });
});
