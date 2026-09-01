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
const NOW = new Date("2026-08-27T06:00:00.000Z"); // 15:00 KST

/** 학생증 QR에서 나오는 프로필. 이름·학번은 여기서만 온다. */
function profile() {
  return {
    id: PROFILE_ID,
    user: { id: "u-1", name: "김민준", role: "STUDENT" },
    enrollments: [{ number: 7, schoolClass: { grade: 1, classNo: 3 } }],
  };
}

function pass(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    studentProfileId: PROFILE_ID,
    type: "OUTING",
    status: "APPROVED",
    startAt: new Date("2026-08-27T05:00:00.000Z"), // 14:00
    endAt: new Date("2026-08-27T09:00:00.000Z"), // 18:00
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

  // **학생증은 먼저 누구인지를 말한다.** 나갈 것이 없어도 이름이 뜬다 —
  // 정문에서 사람과 화면을 맞춰 보는 일이 이 코드가 하는 일의 절반이다.
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

  it("서명은 맞는데 학생이 없으면 UNKNOWN이다 — 명단에서 빠진 뒤의 옛 코드다", async () => {
    findStudentForCard.mockResolvedValue(null);
    const result = await service.verifyStudentQr(admin, code(), NOW);

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.student).toBeNull();
    expect(listForVerify).not.toHaveBeenCalled();
  });

  /**
   * 두 스텝 지난 코드. 학생 화면이 굳었다는 뜻이라 **누구의 화면인지는 말하고**
   * 출입증은 싣지 않는다 — 이 갈래는 서명이 안 맞은 채로 들어오므로 프로필
   * id만 알면 누구나 도달할 수 있다.
   */
  it("지난 코드는 STALE이고 이름만 나온다", async () => {
    const later = new Date(NOW.getTime() + 60_000);
    const result = await service.verifyStudentQr(admin, code(), later);

    expect(result.verdict).toBe("STALE");
    expect(result.student?.studentName).toBe("김민준");
    expect(result.pass).toBeNull();
    expect(result.detailed).toBe(false);
    expect(listForVerify).not.toHaveBeenCalled();
  });

  // pass:verify는 세 역할 모두에게 열려 있다 — 살아 있는 QR을 손에 쥔 사람은
  // 학생 화면 앞에 서 있는 사람이다. 역할이 아예 없는 계정만 막힌다.
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

/**
 * 여러 건을 들고 있는 학생에게 무엇을 말할지. 정문에서 묻는 것은 「지금 나가도
 * 되는가」 하나이므로, 답이 「된다」인 것이 하나라도 있으면 그것을 말한다.
 */
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

  // 승인 건이 하나라도 있으면 그쪽이 이긴다 — 결재 대기는 정문에서 답이 아니다.
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

/**
 * 사유·행선지는 교사에게만. 학생증은 로그인한 누구나 찍을 수 있어서, 같은 학년
 * 학생이 「병원 진료」를 읽을 수 있으면 안 된다.
 */
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
    // 이름·학번·유형·유효 시각까지는 연다 — 정문에서 확인에 필요하다.
    expect(result.student?.studentName).toBe("김민준");
    expect(result.pass?.type).toBe("OUTING");
  });
});
