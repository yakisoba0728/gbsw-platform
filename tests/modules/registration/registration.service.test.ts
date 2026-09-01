import { beforeEach, describe, expect, it, vi } from "vitest";
import { coreMocks } from "../../helpers/core-mocks";

const findInviteByCode = vi.fn();
const emailExists = vi.fn();
const registerFailedAttempt = vi.fn();
const findCurrentYearForUpdate = vi.fn();
const completeStudentRegistration = vi.fn();
const completeAdminRegistration = vi.fn();
const completeParentRegistration = vi.fn();
const {
  recordAudit,
  txClient,
  bareWithTransaction: withTransaction,
} = coreMocks("registration-service-test");
const requireVerified = vi.fn();
const consumeVerifications = vi.fn();
const createTemporaryVerifiedProof = vi.fn();
const isStudentCodeCollision = vi.fn();

class InviteRaceError extends Error {}
class NumberTakenError extends Error {}

vi.mock("@/modules/registration/registration.repo", () => ({
  findInviteByCode,
  emailExists,
  registerFailedAttempt,
  findCurrentYearForUpdate,
  completeStudentRegistration,
  completeAdminRegistration,
  completeParentRegistration,
  InviteRaceError,
  isStudentCodeCollision,
  NumberTakenError,
}));
vi.mock("@/core/audit/audit", () => ({ recordAudit }));
vi.mock("@/core/db/client", () => ({ withTransaction }));
vi.mock("@/modules/verification/verification.service", () => ({
  createTemporaryVerifiedProof,
  requireVerified,
  consumeVerifications,
}));
vi.mock("@/modules/academic-year/academic-year.service", () => ({
  AcademicYearError: class extends Error {},
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
  findCurrentYearForUpdate.mockReset().mockResolvedValue(2026);
  completeStudentRegistration.mockReset().mockResolvedValue(undefined);
  completeAdminRegistration.mockReset().mockResolvedValue(undefined);
  completeParentRegistration.mockReset().mockResolvedValue(undefined);
  recordAudit.mockReset();
  requireVerified.mockReset().mockResolvedValue({ id: "v1" });
  consumeVerifications.mockReset();
  createTemporaryVerifiedProof.mockReset().mockResolvedValue({ id: "proof-1" });
  withTransaction
    .mockReset()
    .mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
      fn(txClient),
    );
  isStudentCodeCollision.mockReset().mockReturnValue(false);
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
        "가입코드 또는 입력한 정보가 맞지 않습니다.",
      );
    }
  });
});

describe("requestVerification() (I4)", () => {
  it("유효한 가입코드면 발송 없이 확인 proof를 만든다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    const result = await requestVerification("GBSWA3K92M7P", "EMAIL", "a@b.kr");

    expect(result).toEqual({ verified: true });
    expect(createTemporaryVerifiedProof).toHaveBeenCalledWith("EMAIL", "a@b.kr");
  });

  it("가입코드가 없거나 이미 쓰였거나 폐기됐으면 발송하지 않는다 — 대상만 " +
    "바꿔가며 문자를 촉발하는 것을 막는 구조적 방어", async () => {
    const cases = [null, invite({ status: "USED" }), invite({ status: "REVOKED" })];

    for (const value of cases) {
      findInviteByCode.mockResolvedValue(value);
      await expect(
        requestVerification("GBSWA3K92M7P", "PHONE", "010-1234-5678"),
      ).rejects.toThrow("가입코드 또는 입력한 정보가 맞지 않습니다.");
    }

    expect(createTemporaryVerifiedProof).not.toHaveBeenCalled();
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
    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(completeStudentRegistration.mock.calls[0]![3]).toBe(2026);
    expect(completeStudentRegistration.mock.calls[0]![4]).toBe(txClient);
  });

  it("학생 가입은 성공 트랜잭션 안에서 잠근 현재 학년도를 쓴다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    findCurrentYearForUpdate.mockResolvedValue(2027);

    await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(withTransaction).toHaveBeenCalledWith(
      expect.any(Function),
      // 명단 반영이 같은 잠금을 오래 쥐므로 가입은 기다렸다 들어간다.
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
    expect(findCurrentYearForUpdate).toHaveBeenCalledWith(txClient);
    expect(completeStudentRegistration.mock.calls[0]![3]).toBe(2027);
  });

  it("생년월일이 틀리면 실패 횟수를 올리고 계정을 만들지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite());

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-05" }),
    ).rejects.toThrow();

    expect(registerFailedAttempt).toHaveBeenCalledWith("inv1", 5, txClient);
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
      txClient,
    );
  });

  it("자동 폐기 실패 처리를 커밋한 뒤 공통 가입 실패를 던진다", async () => {
    const events: string[] = [];
    findInviteByCode.mockResolvedValue(invite());
    registerFailedAttempt.mockResolvedValue({ revoked: true });
    withTransaction.mockImplementationOnce(
      async (fn: (tx: typeof txClient) => Promise<unknown>) => {
        await fn(txClient);
        events.push("transaction resolved");
      },
    );

    await expect(
      completeRegistration({ ...base, name: "김학샹", birthDate: "2010-03-04" }),
    ).rejects.toThrow("가입코드 또는 입력한 정보가 맞지 않습니다.");
    events.push("error observed");

    expect(events).toEqual(["transaction resolved", "error observed"]);
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

describe("completeRegistration() — 초대코드 유효성", () => {
  /**
   * 2단계는 1단계 checkInvite를 다시 부르지 않고 같은 검사를 제 손으로 한다.
   * 이 검사가 빠지면 만료·소진·폐기된 코드로 계정이 만들어진다 — 화면이 1단계를
   * 통과한 뒤 코드가 죽어도 2단계 요청은 그대로 도착하기 때문이다.
   */
  const unusable: [string, ReturnType<typeof invite> | null][] = [
    ["만료된 코드", invite({ expiresAt: new Date(Date.now() - 1000) })],
    ["이미 쓰인 코드", invite({ status: "USED" })],
    ["폐기된 코드", invite({ status: "REVOKED" })],
    ["없는 코드", null],
  ];

  it.each(unusable)("%s로는 계정을 만들지 않는다", async (_label, value) => {
    findInviteByCode.mockResolvedValue(value);

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("가입코드 또는 입력한 정보가 맞지 않습니다.");

    // 2차 요소 대조보다 먼저 막는다 — 트랜잭션도 인증 확인도 시작하지 않는다.
    expect(withTransaction).not.toHaveBeenCalled();
    expect(completeStudentRegistration).not.toHaveBeenCalled();
    expect(completeAdminRegistration).not.toHaveBeenCalled();
    expect(completeParentRegistration).not.toHaveBeenCalled();
    expect(registerFailedAttempt).not.toHaveBeenCalled();
    expect(requireVerified).not.toHaveBeenCalled();
    expect(emailExists).not.toHaveBeenCalled();
  });

  it("이름·생년월일이 맞아도 만료된 코드는 거절한다", async () => {
    // 이름이 틀려서 막힌 것이 아님을 못 박는다 — 같은 입력이 유효한 코드에서는
    // 위쪽 「이름과 생년월일이 맞으면 계정을 만든다」로 통과한다.
    findInviteByCode.mockResolvedValue(
      invite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("가입코드 또는 입력한 정보가 맞지 않습니다.");

    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("역할이 우리가 아는 셋이 아니면 만들지 않는다", async () => {
    findInviteByCode.mockResolvedValue(invite({ role: "SUPERUSER" }));

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("가입코드 또는 입력한 정보가 맞지 않습니다.");

    expect(withTransaction).not.toHaveBeenCalled();
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
    expect(findCurrentYearForUpdate).not.toHaveBeenCalled();
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
    expect(findCurrentYearForUpdate).not.toHaveBeenCalled();
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
    ).rejects.toThrow("이미 쓰이고 있는 이메일입니다.");

    expect(completeStudentRegistration).not.toHaveBeenCalled();
  });

  it("동시 사용으로 코드를 뺏기면 그렇게 알린다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    completeStudentRegistration.mockRejectedValue(
      new InviteRaceError("ALREADY_USED"),
    );

    await expect(
      completeRegistration({ ...base, name: "김학생", birthDate: "2010-03-04" }),
    ).rejects.toThrow("이미 쓰인 가입코드입니다.");

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("이미 쓰인 반·번호면 우리 문구로 바꾼다 — Prisma 원문이 새면 안 된다", async () => {
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
      "이 반·번호에 다른 학생이 있습니다. 선생님께 문의해 주세요.",
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
      txClient,
    );
    expect(consumeVerifications).toHaveBeenCalledWith(["v1", "v1"], txClient);
  });

  it("학생코드가 겹치면 성공 가입 트랜잭션 전체를 새로 연다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    const collision = new Error("studentCode collision");
    completeStudentRegistration
      .mockRejectedValueOnce(collision)
      .mockResolvedValue(undefined);
    isStudentCodeCollision.mockImplementation((error) => error === collision);

    await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(completeStudentRegistration).toHaveBeenCalledTimes(2);
    expect(consumeVerifications).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("Serializable 충돌도 학생 가입 트랜잭션 전체를 다시 연다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    withTransaction
      .mockRejectedValueOnce(Object.assign(new Error("write conflict"), { code: "P2034" }))
      .mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
        fn(txClient),
      );

    await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(completeStudentRegistration).toHaveBeenCalledTimes(1);
  });

  it("어댑터가 40001을 P2010으로 감싸도 학생 가입 트랜잭션을 다시 연다", async () => {
    findInviteByCode.mockResolvedValue(invite());
    withTransaction
      .mockRejectedValueOnce(
        Object.assign(new Error("could not serialize access"), {
          code: "P2010",
          meta: {
            driverAdapterError: {
              cause: {
                originalCode: "40001",
                kind: "TransactionWriteConflict",
              },
            },
          },
        }),
      )
      .mockImplementation(async (fn: (tx: typeof txClient) => Promise<unknown>) =>
        fn(txClient),
      );

    await completeRegistration({
      ...base,
      name: "김학생",
      birthDate: "2010-03-04",
    });

    expect(withTransaction).toHaveBeenCalledTimes(2);
    expect(completeStudentRegistration).toHaveBeenCalledTimes(1);
  });
});
