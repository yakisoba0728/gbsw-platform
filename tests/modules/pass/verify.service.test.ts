import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";
import { user } from "../../helpers/session";

const listForVerify = vi.fn();
const findStudentForCard = vi.fn();
const displayYear = vi.fn();
const { recordAudit } = coreMocks("pass-verify-service-test");

vi.mock("@/modules/pass/pass.repo", () => ({
  listForVerify,
  findStudentForCard,
  displayYear,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));

const { ForbiddenError } = await import("@/core/authz/errors");
const service = await import("@/modules/pass/verify.service");
const { issueStudentCode } = await import("@/modules/pass/pass.token");

const student = user("STUDENT", "u-student", {
  email: "u-student@gbsw.hs.kr",
});
const parent = user("PARENT", "u-parent", { email: "u-parent@gbsw.hs.kr" });
const admin = user("ADMIN", "u-admin", { email: "u-admin@gbsw.hs.kr" });

const PROFILE_ID = "clx0000000000000000000abc";
const NOW = new Date("2026-08-27T06:00:00.000Z");

function profile() {
  return {
    id: PROFILE_ID,
    user: { id: "u-1", name: "김민준", role: "STUDENT" },
    enrollments: [{ grade: 1, classNo: 3, number: 7 }],
  };
}

function pass(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    studentProfileId: PROFILE_ID,
    type: "OUTING",
    status: "APPROVED",
    startAt: new Date("2026-08-27T05:00:00.000Z"),
    endAt: new Date("2026-08-27T09:00:00.000Z"),
    destination: "치과",
    reason: "정기 검진",
    studentProfile: profile(),
    ...over,
  };
}

const code = () => issueStudentCode(PROFILE_ID, NOW).code;

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-for-pass-token-0123456789";
  listForVerify.mockReset().mockResolvedValue([]);
  findStudentForCard.mockReset().mockResolvedValue(profile());
  displayYear.mockReset().mockResolvedValue(2026);
  recordAudit.mockReset().mockResolvedValue(undefined);
});

describe("verifyStudentQr", () => {
  it("지금 시각을 품은 승인 건이 있으면 VALID이고 이름·학번이 나온다", async () => {
    listForVerify.mockResolvedValue([pass()]);
    const result = await service.verifyStudentQr(admin, code(), NOW);

    expect(result.verdict).toBe("VALID");
    expect(result.student).toMatchObject({
      studentName: "김민준",
      studentNumber: "1307",
    });
    expect(result.pass?.type).toBe("OUTING");
  });

  it("승인된 것도 대기 중인 것도 없으면 NO_PASS인데 학생은 나온다", async () => {
    listForVerify.mockResolvedValue([]);
    const result = await service.verifyStudentQr(admin, code(), NOW);

    expect(result.verdict).toBe("NO_PASS");
    expect(result.student?.studentName).toBe("김민준");
    expect(result.pass).toBeNull();
  });

  it("서명이 안 맞으면 조회조차 하지 않는다", async () => {
    const result = await service.verifyStudentQr(admin, "아무거나", NOW);

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.student).toBeNull();
    expect(findStudentForCard).not.toHaveBeenCalled();
  });

  it("형식이 맞아도 변조된 서명이면 학생 정보를 조회하거나 노출하지 않는다", async () => {
    const [profileId, step, signature] = code().split(".");
    const changed = signature[0] === "A" ? "B" : "A";
    const tampered = `${profileId}.${step}.${changed}${signature.slice(1)}`;

    const result = await service.verifyStudentQr(student, tampered, NOW);

    expect(result).toEqual({
      verdict: "UNKNOWN",
      student: null,
      pass: null,
      detailed: false,
    });
    expect(displayYear).not.toHaveBeenCalled();
    expect(findStudentForCard).not.toHaveBeenCalled();
    expect(listForVerify).not.toHaveBeenCalled();
  });

  it("서명은 맞는데 학생이 없으면 UNKNOWN이다 — 명단에서 빠진 뒤의 옛 코드다", async () => {
    findStudentForCard.mockResolvedValue(null);
    const result = await service.verifyStudentQr(admin, code(), NOW);

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.student).toBeNull();
    expect(listForVerify).not.toHaveBeenCalled();
  });

  it("지난 코드는 STALE이고 이름만 나온다", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    const result = await service.verifyStudentQr(admin, code(), later);

    expect(result.verdict).toBe("STALE");
    expect(result.student?.studentName).toBe("김민준");
    expect(result.pass).toBeNull();
    expect(result.detailed).toBe(false);
    expect(listForVerify).not.toHaveBeenCalled();
  });

  it("스텝이 없는 배포 직전 코드는 만료 뒤 조회 없이 STALE만 알린다", async () => {
    const [profileId, , signature] = code().split(".");
    const later = new Date(NOW.getTime() + 60_000);

    const result = await service.verifyStudentQr(
      student,
      `${profileId}.${signature}`,
      later,
    );

    expect(result).toEqual({
      verdict: "STALE",
      student: null,
      pass: null,
      detailed: false,
    });
    expect(displayYear).not.toHaveBeenCalled();
    expect(findStudentForCard).not.toHaveBeenCalled();
    expect(listForVerify).not.toHaveBeenCalled();
  });

  it("역할이 없으면 던진다", async () => {
    await expect(
      service.verifyStudentQr({ ...admin, role: null }, code(), NOW),
    ).rejects.toThrow(ForbiddenError);
  });

  it("아무것도 쓰지 않는다", async () => {
    listForVerify.mockResolvedValue([pass()]);
    await service.verifyStudentQr(admin, code(), NOW);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("여러 건을 고르는 순서", () => {
  it("지난 것과 앞으로의 것 사이에 유효한 것이 있으면 그것을 고른다", async () => {
    listForVerify.mockResolvedValue([
      pass({ id: "지남", endAt: new Date("2026-08-27T02:00:00.000Z") }),
      pass({ id: "지금" }),
      pass({
        id: "나중",
        startAt: new Date("2026-08-28T05:00:00.000Z"),
        endAt: new Date("2026-08-28T09:00:00.000Z"),
      }),
    ]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.verdict).toBe("VALID");
    expect(result.pass?.startAt).toEqual(new Date("2026-08-27T05:00:00.000Z"));
  });

  it("유효한 게 없고 앞으로의 것이 있으면 가장 이른 것으로 NOT_YET", async () => {
    listForVerify.mockResolvedValue([
      pass({
        id: "이른",
        startAt: new Date("2026-08-27T08:00:00.000Z"),
        endAt: new Date("2026-08-27T10:00:00.000Z"),
      }),
      pass({
        id: "늦은",
        startAt: new Date("2026-08-28T08:00:00.000Z"),
        endAt: new Date("2026-08-28T10:00:00.000Z"),
      }),
    ]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.verdict).toBe("NOT_YET");
    expect(result.pass?.startAt).toEqual(new Date("2026-08-27T08:00:00.000Z"));
  });

  it("오늘 끝난 승인 건만 있으면 EXPIRED", async () => {
    listForVerify.mockResolvedValue([
      pass({
        startAt: new Date("2026-08-27T01:00:00.000Z"),
        endAt: new Date("2026-08-27T02:00:00.000Z"),
      }),
    ]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.verdict).toBe("EXPIRED");
  });

  it("종료 시각과 정확히 같으면 더는 유효하지 않고 EXPIRED다", async () => {
    listForVerify.mockResolvedValue([
      pass({
        startAt: new Date("2026-08-26T23:00:00.000Z"),
        endAt: NOW,
      }),
    ]);

    const result = await service.verifyStudentQr(admin, code(), NOW);

    expect(result.verdict).toBe("EXPIRED");
  });

  it("결재 대기만 있으면 NOT_APPROVED", async () => {
    listForVerify.mockResolvedValue([pass({ status: "REQUESTED" })]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.verdict).toBe("NOT_APPROVED");
  });

  it("승인 건과 대기 건이 함께 있으면 승인 건을 말한다", async () => {
    listForVerify.mockResolvedValue([
      pass({ id: "대기", status: "CONSENTED" }),
      pass({ id: "승인" }),
    ]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.verdict).toBe("VALID");
  });
});

describe("사유·행선지 가리기", () => {
  it("교사에게는 보인다", async () => {
    listForVerify.mockResolvedValue([pass()]);
    const result = await service.verifyStudentQr(admin, code(), NOW);
    expect(result.detailed).toBe(true);
    expect(result.pass?.destination).toBe("치과");
    expect(result.pass?.reason).toBe("정기 검진");
  });

  it.each([
    ["학생", student],
    ["학부모", parent],
  ])("%s에게는 null이다", async (_label, actor) => {
    listForVerify.mockResolvedValue([pass()]);
    const result = await service.verifyStudentQr(actor, code(), NOW);
    expect(result.detailed).toBe(false);
    expect(result.pass?.destination).toBeNull();
    expect(result.pass?.reason).toBeNull();
    expect(result.student?.studentName).toBe("김민준");
    expect(result.pass?.type).toBe("OUTING");
  });
});
