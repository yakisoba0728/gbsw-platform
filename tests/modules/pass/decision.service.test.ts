import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const createPass = vi.fn();
const findPass = vi.fn();
const lockPassForDecision = vi.fn();
const listPendingForAdmin = vi.fn();
const listActiveNow = vi.fn();
const listEnrolledStudents = vi.fn();
const listHistory = vi.fn();
const countStatusesForStudent = vi.fn();
const findOverlapping = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const lockEligibleStudentForPassCreation = vi.fn();
const currentDatabaseTime = vi.fn();
const transition = vi.fn();
const transitionUnexpired = vi.fn();
const displayYear = vi.fn();
const {
  recordAudit,
  auditEntries,
  txClient,
  prewiredWithTransaction: withTransaction,
} = coreMocks("pass-decision-service-test");

vi.mock("@/modules/pass/pass.repo", () => ({
  createPass,
  findPass,
  lockPassForDecision,
  listPendingForAdmin,
  listActiveNow,
  listEnrolledStudents,
  listHistory,
  countStatusesForStudent,
  findOverlapping,
  findCurrentYearForUpdate,
  lockEligibleStudentForPassCreation,
  currentDatabaseTime,
  transition,
  transitionUnexpired,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));

const { PassError } = await import("@/modules/pass/pass.error");
const { ForbiddenError } = await import("@/core/authz/errors");
const { PASS_ADMIN_PAGE_SIZE, PASS_HISTORY_EXPORT_MAX_ROWS } = await import(
  "@/modules/pass/pass.schema",
);
const service = await import("@/modules/pass/decision.service");

const student = user("STUDENT", "u-student", {
  email: "u-student@gbsw.hs.kr",
});
const admin = user("ADMIN", "u-admin", { email: "u-admin@gbsw.hs.kr" });

beforeEach(() => {
  createPass.mockReset().mockResolvedValue({ id: "p-1" });
  findPass.mockReset();
  lockPassForDecision
    .mockReset()
    .mockResolvedValue({ id: "p-1", status: "REQUESTED" });
  listPendingForAdmin.mockReset().mockResolvedValue([]);
  listActiveNow.mockReset().mockResolvedValue([]);
  listEnrolledStudents.mockReset().mockResolvedValue([]);
  listHistory.mockReset().mockResolvedValue({ entries: [], total: 0 });
  countStatusesForStudent.mockReset().mockResolvedValue([]);
  findOverlapping.mockReset().mockResolvedValue(null);
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  lockEligibleStudentForPassCreation.mockReset().mockResolvedValue(true);
  currentDatabaseTime.mockReset().mockResolvedValue(NOW);
  transition.mockReset().mockResolvedValue(1);
  transitionUnexpired.mockReset().mockResolvedValue("UPDATED");
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
  withTransaction.mockClear();
});

const NOW = new Date("2026-08-27T00:00:00.000Z");

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
    // 잠금 후 판정이므로 거부까지 행 잠금을 거친다.
    expect(lockPassForDecision).toHaveBeenCalledWith("p-1", txClient);
    expect(transitionUnexpired).not.toHaveBeenCalled();
  });

  it("선체크 뒤에 보호자가 동의했으면 CONSENT_REQUIRED 대신 그대로 승인한다", async () => {
    // findPass는 아직 REQUESTED(동의 전)이지만, 잠금 시점엔 보호자가 확인한 상태다.
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    lockPassForDecision.mockResolvedValue({ id: "p-1", status: "CONSENTED" });

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
      expect.objectContaining({
        status: "APPROVED",
        decisionNote: "확인 완료",
      }),
      txClient,
    );
    expect(auditEntries()).toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ byProxy: false }) }),
    ]);
  });

  it("보호자가 이미 동의했으면 그대로 승인된다", async () => {
    findPass.mockResolvedValue(
      pending({ type: "OVERNIGHT", status: "CONSENTED", consentedAt: new Date() }),
    );
    lockPassForDecision.mockResolvedValue({ id: "p-1", status: "CONSENTED" });
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
    lockPassForDecision.mockResolvedValue({ id: "p-1", status: "CONSENTED" });

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

    const update = transitionUnexpired.mock.calls[0]?.[2];
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

  it("대행 체크 시점에 이미 보호자가 확인했으면 보호자 기록을 새로 찍지 않고 승인만 한다", async () => {
    // findPass는 REQUESTED(동의 전)로 보이지만, 잠금 시점엔 보호자가 먼저 확인했다.
    findPass.mockResolvedValue(pending({ type: "OVERNIGHT" }));
    lockPassForDecision.mockResolvedValue({ id: "p-1", status: "CONSENTED" });

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

    // 대행 없이 승인만 한다 — 동의 기록을 건드리는 필드가 전혀 없어야 한다.
    expect(transitionUnexpired).toHaveBeenCalledTimes(1);
    expect(transitionUnexpired).toHaveBeenCalledWith(
      "p-1",
      ["REQUESTED", "CONSENTED"],
      expect.objectContaining({
        status: "APPROVED",
        decisionNote: "어머니와 전화 확인",
      }),
      txClient,
    );
    const update = transitionUnexpired.mock.calls[0]![2];
    expect(update).not.toHaveProperty("consentByProxy");
    expect(update).not.toHaveProperty("consentedByUserId");
    expect(update).not.toHaveProperty("consentedAt");
    expect(update).not.toHaveProperty("consentNote");
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({
          byProxy: false,
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

  it("학생은 반려할 수 없다", async () => {
    findPass.mockResolvedValue(pending());
    await expect(
      service.rejectPass(student, { passId: "p-1", decisionNote: "안 됩니다" }),
    ).rejects.toThrow(ForbiddenError);
    expect(transition).not.toHaveBeenCalled();
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
    expect(findOverlapping).toHaveBeenCalledWith(
      "sp-1",
      new Date("2026-08-26T23:00:00.000Z"),
      new Date("2026-08-27T10:00:00.000Z"),
      txClient,
    );
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

  it("학생은 취소할 수 없다", async () => {
    findPass.mockResolvedValue(pending({ status: "APPROVED" }));
    await expect(
      service.cancelPass(student, { passId: "p-1", reason: null }),
    ).rejects.toThrow(ForbiddenError);
    expect(transition).not.toHaveBeenCalled();
  });
});

describe("목록", () => {
  const window = { cursor: null, take: PASS_ADMIN_PAGE_SIZE };

  it("결재 대기는 교사만 본다", async () => {
    await expect(service.listPendingPasses(student, NOW)).rejects.toThrow(ForbiddenError);
    await service.listPendingPasses(admin, NOW);
    expect(listPendingForAdmin).toHaveBeenCalledWith(NOW, 2026, window);
  });

  it("지금 유효한 목록도 교사만 본다", async () => {
    await expect(service.listActivePasses(student, NOW)).rejects.toThrow(ForbiddenError);
    expect(listActiveNow).not.toHaveBeenCalled();

    await service.listActivePasses(admin, NOW);
    expect(listActiveNow).toHaveBeenCalledWith(NOW, 2026, window);
  });

  it("커서를 받은 목록만 그 자리에서 이어 읽는다", async () => {
    await service.listPendingPasses(admin, NOW, "pending-50");
    await service.listActivePasses(admin, NOW);

    expect(listPendingForAdmin).toHaveBeenCalledWith(NOW, 2026, {
      cursor: "pending-50",
      take: PASS_ADMIN_PAGE_SIZE,
    });
    expect(listActiveNow).toHaveBeenCalledWith(NOW, 2026, window);
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
        since: new Date("2026-07-31T15:00:00.000Z"),
        until: new Date("2026-08-26T15:00:00.000Z"),
        skip: 40,
        take: 20,
      }),
      2026,
    );
    expect(result.pageCount).toBe(3);
  });

  it("한 학생으로 좁히고 시작일을 안 골랐으면 30일 하한을 걷는다", async () => {
    await service.listPassHistory(admin, {
      ...query,
      from: undefined,
      to: undefined,
      studentProfileId: "sp-1",
    });

    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileId: "sp-1", since: undefined }),
      2026,
    );
  });

  it("좁힌 조회라도 사람이 고른 시작일은 그대로 지킨다", async () => {
    await service.listPassHistory(admin, { ...query, studentProfileId: "sp-1" });

    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        studentProfileId: "sp-1",
        since: new Date("2026-07-31T15:00:00.000Z"),
      }),
      2026,
    );
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

  /* 시트로 옮길 수 있는 최소한의 한 줄. 건수만 바꿔 상한을 넘겨 본다. */
  function exported(count: number) {
    return Array.from({ length: count }, () => ({
      type: "OUTING",
      status: "APPROVED",
      startAt: NOW,
      endAt: NOW,
      destination: "병원",
      reason: "진료",
      requestedByName: "김민준",
      consentedByName: null,
      consentedAt: null,
      consentByProxy: false,
      consentNote: null,
      decidedByName: "이정민",
      decidedAt: NOW,
      decisionNote: null,
      cancelledByName: null,
      cancelledAt: null,
      cancelReason: null,
      studentProfile: {
        user: { name: "김민준" },
        enrollments: [{ grade: 2, classNo: 3, number: 5 }],
      },
    }));
  }

  it("내보내기는 쪽을 나누지 않는다 — 조건에 맞는 전부가 한 파일이다", async () => {
    const { filename } = await service.exportPassHistory(admin, exportInput);

    // 상한을 넘겼는지 보려고 한 건 더 받는다. 쪽을 나누는 것이 아니다.
    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: PASS_HISTORY_EXPORT_MAX_ROWS + 1 }),
      2026,
    );
    expect(filename).toBe("출입증내역_2026-08-01~2026-08-26.xlsx");
  });

  /*
   * 상한이 없으면 조회·시트 생성·전송이 한 요청에 몰려 그동안 다른 요청이 밀린다.
   * 기간을 좁히라고 되돌려 주는 편이 낫다 — 전교 300명의 기본 30일은 천 건 안쪽이다.
   */
  it("상한을 넘으면 시트를 만들지 않고 기간을 좁히라고 한다", async () => {
    listHistory.mockResolvedValue({
      entries: exported(PASS_HISTORY_EXPORT_MAX_ROWS + 1),
      total: PASS_HISTORY_EXPORT_MAX_ROWS + 1,
    });

    await expect(service.exportPassHistory(admin, exportInput)).rejects.toThrow(
      new PassError("EXPORT_TOO_LARGE"),
    );
  });

  it("상한과 같은 건수까지는 그대로 내보낸다", async () => {
    listHistory.mockResolvedValue({
      entries: exported(PASS_HISTORY_EXPORT_MAX_ROWS),
      total: PASS_HISTORY_EXPORT_MAX_ROWS,
    });

    const { rows } = await service.exportPassHistory(admin, exportInput);

    // 머리글이 붙으므로 자료 줄은 상한만큼이다.
    expect(rows.length).toBeGreaterThanOrEqual(PASS_HISTORY_EXPORT_MAX_ROWS);
  });
});
