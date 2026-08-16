import { beforeEach, describe, expect, it, vi } from "vitest";

const findInviteByCode = vi.fn();
const emailExists = vi.fn();
const registerFailedAttempt = vi.fn();
const completeStudentRegistration = vi.fn();
const completeAdminRegistration = vi.fn();
const completeParentRegistration = vi.fn();
const recordAudit = vi.fn();
const requireVerified = vi.fn();
const consumeVerifications = vi.fn();
const requestCode = vi.fn();

class InviteRaceError extends Error {}
class NumberTakenError extends Error {}

vi.mock("@/modules/registration/registration.repo", () => ({
  findInviteByCode,
  emailExists,
  registerFailedAttempt,
  completeStudentRegistration,
  completeAdminRegistration,
  completeParentRegistration,
  InviteRaceError,
  NumberTakenError,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/modules/verification/verification.service", () => ({
  requireVerified,
  consumeVerifications,
  requestCode,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  getCurrentYear: vi.fn().mockResolvedValue(2026),
}));

const { checkInvite, completeRegistration, requestVerification } = await import(
  "@/modules/registration/registration.service"
);

const STUDENT_META = {
  name: "김학생",
  birthDate: "2010-03-04",
  grade: 1,
  classNo: 2,
  number: 15,
};

function invite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    code: "GBSWA3K92M7P",
    role: "STUDENT",
    status: "PENDING",
    expiresAt: null,
    metadata: STUDENT_META,
    studentId: null,
    ...overrides,
  };
}

const base = {
  code: "GBSWA3K92M7P",
  email: "new@gbsw.hs.kr",
  phone: "010-1234-5678",
  password: "long-enough-password",
  confirmPassword: "long-enough-password",
};

beforeEach(() => {
  findInviteByCode.mockReset();
  emailExists.mockReset().mockResolvedValue(false);
  registerFailedAttempt.mockReset().mockResolvedValue({ revoked: false });
  completeStudentRegistration.mockReset().mockResolvedValue(undefined);
  completeAdminRegistration.mockReset().mockResolvedValue(undefined);
  completeParentRegistration.mockReset().mockResolvedValue(undefined);
  recordAudit.mockReset();
  requireVerified.mockReset().mockResolvedValue({ id: "v1" });
  consumeVerifications.mockReset();
  requestCode.mockReset().mockResolvedValue({});
});

describe("checkInvite()", () => {
  it("역할만 돌려주고 사전등록 개인정보는 흘리지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    const result = await checkInvite("gbsw-a3k9 2m7p");

    // 표기가 흔들려도 정규화해서 찾는다.
    expect(findInviteByCode).toHaveBeenCalledWith("GBSWA3K92M7P");
    expect(result).toEqual({ role: "STUDENT" });
    expect(JSON.stringify(result)).not.toContain("김학생");
    expect(JSON.stringify(result)).not.toContain("2010-03-04");
  });

  it("없는·사용된·폐기된·만료된 코드를 모두 같은 이유로 거부한다", async () => {
    const cases = [
      null,
      invite({ status: "USED" }),
      invite({ status: "REVOKED" }),
      invite({ expiresAt: new Date(Date.now() - 1000) }),
    ];

    for (const value of cases) {
      findInviteByCode.mockResolvedValue(value);
      await expect(checkInvite("GBSWA3K92M7P")).rejects.toThrow(
        "가입코드 또는 입력한 정보가 올바르지 않습니다.",
      );
    }
  });
});

describe("requestVerification() (I4)", () => {
  it("유효한 가입코드면 인증코드 발송으로 넘어간다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await requestVerification("GBSWA3K92M7P", "EMAIL", "a@b.kr");

    expect(requestCode).toHaveBeenCalledWith("EMAIL", "a@b.kr");
  });

  it("가입코드가 없거나 이미 쓰였거나 폐기됐으면 발송하지 않는다 — 대상만 " +
    "바꿔가며 문자를 촉발하는 것을 막는 구조적 방어", async () => {
    const cases = [null, invite({ status: "USED" }), invite({ status: "REVOKED" })];

    for (const value of cases) {
      findInviteByCode.mockResolvedValue(value);
      await expect(
        requestVerification("GBSWA3K92M7P", "PHONE", "010-1234-5678"),
      ).rejects.toThrow("가입코드 또는 입력한 정보가 올바르지 않습니다.");
    }

    expect(requestCode).not.toHaveBeenCalled();
  });
});

describe("completeRegistration() — 학생", () => {
  it("이름과 생년월일이 맞으면 계정을 만든다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    const result = await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(result).toEqual({ role: "STUDENT" });
    expect(completeStudentRegistration).toHaveBeenCalledTimes(1);

    const [inviteId, account, student] = completeStudentRegistration.mock.calls[0]!;
    expect(inviteId).toBe("inv1");
    expect(account.email).toBe("new@gbsw.hs.kr");
    // 평문 비밀번호가 저장 경로로 새어나가면 안 된다.
    expect(account.passwordHash).not.toBe(base.password);
    // 학반번호는 가입자가 입력하지 않는다 — 코드에 박힌 값이 그대로 쓰인다.
    expect(student).toMatchObject({ grade: 1, classNo: 2, number: 15 });
    // KST 자정으로 저장한다 — admin-users의 관리자 수정과 같은 기준이어야
    // 3단계 명단 매칭에서 이름+생년월일 대조가 갈리지 않는다.
    expect((student as { birthDate: Date }).birthDate.toISOString()).toBe(
      "2010-03-03T15:00:00.000Z",
    );
  });

  it("생년월일이 틀리면 실패 횟수를 올리고 계정을 만들지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-05" }),
    ).rejects.toThrow();

    expect(registerFailedAttempt).toHaveBeenCalledWith("inv1", 5);
    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("이름이 틀려도 같은 처리를 한다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await expect(
      completeRegistration({ ...base, name: "김학샹", birthDate: "2010-03-04" }),
    ).rejects.toThrow();

    expect(registerFailedAttempt).toHaveBeenCalled();
    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("실패가 쌓여 코드가 자동 폐기되면 감사로그를 남긴다 (I9) — 행위자 없이", async () => {
    findInviteByCode.mockResolvedValue(invite());
    registerFailedAttempt.mockResolvedValue({ revoked: true });

    await expect(
      completeRegistration({ ...base, name: "김학샹", birthDate: "2010-03-04" }),
    ).rejects.toThrow();

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        action: "invite:auto-revoke",
        targetType: "Invite",
        targetId: "inv1",
      }),
    );
  });

  it("실패가 쌓여도 폐기되지 않았으면 감사로그를 남기지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    registerFailedAttempt.mockResolvedValue({ revoked: false });

    await expect(
      completeRegistration({ ...base, name: "김학샹", birthDate: "2010-03-04" }),
    ).rejects.toThrow();

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("생년월일을 비우면 통과하지 못한다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "" }),
    ).rejects.toThrow();

    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("이름은 관리자가 등록한 표기로 저장한다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await completeRegistration({
      ...base,
      name: "  김학생  ",
      birthDate: "2010-03-04",
    });

    const [, account] = completeStudentRegistration.mock.calls[0]!;
    expect(account.name).toBe("김학생");
  });
});

describe("completeRegistration() — 관리자 / 학부모", () => {
  it("관리자는 이름만 맞으면 된다", async () => {
    findInviteByCode.mockResolvedValue(
      invite({ role: "ADMIN", metadata: { name: "박교사" } }),
    );

    const result = await completeRegistration({ ...base, name: "박교사" });

    expect(result).toEqual({ role: "ADMIN" });
    expect(completeAdminRegistration).toHaveBeenCalledTimes(1);
  });

  it("학부모는 코드에 귀속된 학생과 연결된다", async () => {
    findInviteByCode.mockResolvedValue(
      invite({
        role: "PARENT",
        metadata: { name: "이보호" },
        studentId: "student-1",
      }),
    );

    await completeRegistration({ ...base, name: "이보호" });

    const [, , studentId] = completeParentRegistration.mock.calls[0]!;
    expect(studentId).toBe("student-1");
  });

  it("학부모 코드에 학생이 없으면 만들지 않는다", async () => {
    findInviteByCode.mockResolvedValue(
      invite({ role: "PARENT", metadata: { name: "이보호" }, studentId: null }),
    );

    await expect(
      completeRegistration({ ...base, name: "이보호" }),
    ).rejects.toThrow();
    expect(completeParentRegistration).not.toHaveBeenCalled();
  });
});

describe("completeRegistration() — 공통 방어", () => {
  it("역할은 코드에서만 읽는다 — 클라이언트 입력에 role이 있어도 무시한다", async () => {
    findInviteByCode.mockResolvedValue(
      invite({ role: "ADMIN", metadata: { name: "박교사" } }),
    );

    const result = await completeRegistration({
      ...base,
      name: "박교사",
      // @ts-expect-error 스키마에 없는 필드를 억지로 넣어 본다
      role: "STUDENT",
    });

    expect(result.role).toBe("ADMIN");
    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("이미 쓰는 이메일이면 코드를 소진하지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    emailExists.mockResolvedValue(true);

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("이미 사용 중인 이메일입니다.");

    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("동시 사용으로 코드를 뺏기면 그렇게 알린다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    completeStudentRegistration.mockRejectedValue(
      new InviteRaceError("ALREADY_USED"),
    );

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("이미 사용된 가입코드입니다.");

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("관리자가 이미 쓰인 반·번호로 코드를 발급했으면 우리 문구로 바꾼다 — Prisma 원문이 새면 안 된다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    completeStudentRegistration.mockRejectedValue(
      Object.assign(new NumberTakenError(), {
        // 저장소가 실제로 던지는 값은 메시지가 없는 NumberTakenError뿐이지만,
        // 혹시라도 Prisma 원문이 메시지에 섞여 들어와도 새 나가지 않는지 같이 본다.
        message: "Unique constraint failed on the fields: (`classId`,`number`)",
      }),
    );

    // 우리가 정한 문구로 완전히 바뀐다 — Prisma 원문("Unique constraint...")이
    // 메시지 어디에도 섞여 들어오지 않는다. exact match라 섞였으면 여기서 이미 실패한다.
    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow(
      "이 반·번호에 이미 다른 학생이 있습니다. 관리자에게 문의해 주세요.",
    );

    // 실패했으니 코드도 소진되지 않고 감사로그도 남지 않는다.
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("성공하면 감사로그를 남긴다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "registration:complete",
        targetType: "User",
        metadata: { role: "STUDENT", inviteId: "inv1" },
      }),
    );
  });
});
