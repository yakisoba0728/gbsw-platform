import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const createInitialAdmin = vi.fn();
const signInSilently = vi.fn();
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/modules/auth/auth.service", () => ({ signInSilently }));
vi.mock("@/modules/bootstrap/bootstrap.service", () => ({ createInitialAdmin }));

const checkInvite = vi.fn();
const completeRegistration = vi.fn();
const requestVerification = vi.fn();
const confirmCode = vi.fn();
const requireVerified = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

vi.mock("@/modules/registration/registration.service", () => ({
  RegistrationError: class RegistrationError extends Error {},
  checkInvite,
  completeRegistration,
  requestVerification,
}));
vi.mock("@/modules/verification/verification.service", () => ({
  VerificationError: class VerificationError extends Error {},
  confirmCode,
  requireVerified,
}));

const { RegistrationError } = await import(
  "@/modules/registration/registration.service"
);
const { VerificationError } = await import(
  "@/modules/verification/verification.service"
);
const {
  createInitialAdminAction,
  checkInviteAction,
  completeRegistrationAction,
  requestVerificationAction,
  confirmVerificationAction,
} = await import("@/app/(auth)/register/actions");

const BOOTSTRAP_INITIAL = {
  error: null,
  values: { name: "", email: "", phone: "" },
};

function bootstrapForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    token: "bootstrap-token",
    name: "홍길동",
    email: "admin@gbsw.hs.kr",
    phone: "010-1234-5678",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  signInSilently.mockResolvedValue(undefined);
  checkInvite.mockResolvedValue({ role: "STUDENT" });
  requestVerification.mockResolvedValue({ verified: true });
  requireVerified.mockResolvedValue({ id: "proof-1" });
});

afterAll(() => {
  consoleError.mockRestore();
});

describe("createInitialAdminAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    await expect(
      createInitialAdminAction(BOOTSTRAP_INITIAL, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createInitialAdmin).toHaveBeenCalledOnce();
  });

  it("폼의 phone을 읽는다 — 안 읽으면 스키마가 막아 서비스에 못 간다", async () => {
    await expect(
      createInitialAdminAction(BOOTSTRAP_INITIAL, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(createInitialAdmin).toHaveBeenCalledWith(
      "bootstrap-token",
      expect.objectContaining({ phone: "010-1234-5678" }),
    );
  });

  it("검증 실패 문구는 한글이다", async () => {
    const state = await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm({ phone: "01012" }),
    );

    expect(createInitialAdmin).not.toHaveBeenCalled();
    expect(state.error).toBe("휴대폰 번호 형식이 올바르지 않습니다.");
  });

  it("검증에 걸리면 토큰을 쓰지 않는다", async () => {
    await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm({ name: "" }),
    );

    expect(createInitialAdmin).not.toHaveBeenCalled();
  });

  it("서비스가 던지면 실패 원인을 구분해 알리지 않는다", async () => {
    createInitialAdmin.mockRejectedValueOnce(new Error("ALREADY_SET"));

    const state = await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm(),
    );

    expect(state.error).toContain("교사 계정을 만들 수 없습니다");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("검증에 걸리면 제출한 이름·이메일·전화를 그대로 돌려준다", async () => {
    const state = await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm({ phone: "01012", email: "Admin@GBSW.hs.kr" }),
    );

    expect(state.values).toEqual({
      name: "홍길동",
      email: "Admin@GBSW.hs.kr",
      phone: "01012",
    });
  });

  it("서비스가 던져도 제출한 이름·이메일·전화를 그대로 돌려준다", async () => {
    createInitialAdmin.mockRejectedValueOnce(new Error("ALREADY_SET"));

    const state = await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm({ name: "김철수", email: "kim@gbsw.hs.kr" }),
    );

    expect(state.values).toEqual({
      name: "김철수",
      email: "kim@gbsw.hs.kr",
      phone: "010-1234-5678",
    });
  });

  it("돌려주는 값에 비밀번호는 없다", async () => {
    const state = await createInitialAdminAction(
      BOOTSTRAP_INITIAL,
      bootstrapForm({ confirmPassword: "다른-비밀번호-입니다" }),
    );

    expect(Object.keys(state.values).sort()).toEqual([
      "email",
      "name",
      "phone",
    ]);
  });

  it("성공하면 바로 로그인시킨다", async () => {
    await expect(
      createInitialAdminAction(BOOTSTRAP_INITIAL, bootstrapForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(signInSilently).toHaveBeenCalledWith(
      "admin@gbsw.hs.kr",
      "correct-horse-battery",
      expect.any(Promise),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });
});

const CODE = "GBSW-A3K9-2M7P";

const REGISTER_INITIAL = {
  error: null,
  values: { name: "", birthDate: "" },
};

function registerForm(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string> = {
    code: CODE,
    name: "홍길동",
    birthDate: "2010-03-02",
    email: "hong@gbsw.hs.kr",
    phone: "010-1234-5678",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
    ...over,
  };
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("checkInviteAction — 경계 검증", () => {
  it("폼이 보내는 code 하나면 서비스까지 도달한다", async () => {
    const state = await checkInviteAction(
      { code: null, role: null, error: null },
      registerForm(),
    );

    expect(checkInvite).toHaveBeenCalledWith(CODE);
    expect(state).toEqual({ code: CODE, role: "STUDENT", error: null });
  });

  it("코드가 비면 서비스를 부르지 않는다", async () => {
    const fd = new FormData();
    fd.set("code", "");

    const state = await checkInviteAction(
      { code: null, role: null, error: null },
      fd,
    );

    expect(checkInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("가입코드를 입력해 주세요.");
  });

  it("검증에 걸려도 제출한 가입코드를 그대로 돌려준다", async () => {
    const submitted = "GBSW-TOO-LONG-INVITE-CODE-123456789";
    const fd = new FormData();
    fd.set("code", submitted);

    const state = await checkInviteAction(
      { code: null, role: null, error: null },
      fd,
    );

    expect(checkInvite).not.toHaveBeenCalled();
    expect(state.values).toEqual({ code: submitted });
  });

  it("가입 서비스가 정제한 오류 문구는 그대로 보여준다", async () => {
    checkInvite.mockRejectedValueOnce(
      new RegistrationError("가입코드 또는 입력한 정보가 맞지 않습니다."),
    );

    const state = await checkInviteAction(
      { code: null, role: null, error: null },
      registerForm(),
    );

    expect(state.error).toBe("가입코드 또는 입력한 정보가 맞지 않습니다.");
    expect(state.code).toBeNull();
    expect(state.values).toEqual({ code: CODE });
  });

  it("예상 못 한 오류는 원문을 감추고 서버 로그에 남긴다", async () => {
    const error = new Error("connect ECONNREFUSED");
    checkInvite.mockRejectedValueOnce(error);

    const state = await checkInviteAction(
      { code: null, role: null, error: null },
      registerForm(),
    );

    expect(state.error).toBe("쓸 수 없는 가입코드입니다.");
    expect(consoleError).toHaveBeenCalledWith(
      "[registration] 가입코드를 확인하지 못했습니다.",
      error,
    );
  });
});

describe("completeRegistrationAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    await expect(
      completeRegistrationAction(REGISTER_INITIAL, registerForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(completeRegistration).toHaveBeenCalledOnce();
  });

  it("폼의 일곱 필드를 모두 읽는다", async () => {
    await expect(
      completeRegistrationAction(REGISTER_INITIAL, registerForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(completeRegistration).toHaveBeenCalledWith({
      code: CODE,
      name: "홍길동",
      birthDate: "2010-03-02",
      email: "hong@gbsw.hs.kr",
      phone: "010-1234-5678",
      password: "correct-horse-battery",
      confirmPassword: "correct-horse-battery",
    });
  });

  it("학생이 아니면 생년월일 칸이 없어도 통과한다", async () => {
    const fd = registerForm();
    fd.delete("birthDate");

    await expect(
      completeRegistrationAction(REGISTER_INITIAL, fd),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(completeRegistration.mock.calls[0]?.[0].birthDate).toBe("");
  });

  it("비밀번호 확인이 다르면 서비스를 부르지 않는다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ confirmPassword: "다른-비밀번호-입니다" }),
    );

    expect(completeRegistration).not.toHaveBeenCalled();
    expect(state.error).toBe("비밀번호가 서로 다릅니다.");
  });

  it("휴대폰 형식이 틀리면 서비스를 부르지 않는다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ phone: "01012" }),
    );

    expect(completeRegistration).not.toHaveBeenCalled();
    expect(state.error).toBe("휴대폰 번호 형식이 올바르지 않습니다.");
  });

  it("생년월일 형식이 틀리면 서비스를 부르지 않는다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ birthDate: "2010/03/02" }),
    );

    expect(completeRegistration).not.toHaveBeenCalled();
    expect(state.error).toBe("생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  });

  it("존재하지 않는 생년월일이면 서비스를 부르지 않는다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ birthDate: "2010-02-30" }),
    );

    expect(completeRegistration).not.toHaveBeenCalled();
    expect(state.error).toBe("존재하지 않는 생년월일입니다.");
  });

  it("우리가 던진 오류는 문구를 그대로 보여준다", async () => {
    completeRegistration.mockRejectedValueOnce(
      new RegistrationError("이름 또는 생년월일이 코드와 다릅니다."),
    );

    const state = await completeRegistrationAction(REGISTER_INITIAL, registerForm());

    expect(state.error).toBe("이름 또는 생년월일이 코드와 다릅니다.");
  });

  it("인증 오류도 정제된 문구를 그대로 보여준다", async () => {
    completeRegistration.mockRejectedValueOnce(
      new VerificationError("휴대폰 인증을 먼저 완료해 주세요."),
    );

    const state = await completeRegistrationAction(REGISTER_INITIAL, registerForm());

    expect(state.error).toBe("휴대폰 인증을 먼저 완료해 주세요.");
  });

  it("그 밖의 오류는 원문을 감춘다", async () => {
    completeRegistration.mockRejectedValueOnce(
      new Error("Unique constraint failed on the fields: (`email`)"),
    );

    const state = await completeRegistrationAction(REGISTER_INITIAL, registerForm());

    expect(state.error).toBe("가입하지 못했습니다.");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("검증에 걸리면 제출한 이름·생년월일을 그대로 돌려준다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ confirmPassword: "다른-비밀번호-입니다" }),
    );

    expect(state.values).toEqual({ name: "홍길동", birthDate: "2010-03-02" });
  });

  it("서비스가 던져도 제출한 이름·생년월일을 그대로 돌려준다", async () => {
    completeRegistration.mockRejectedValueOnce(
      new RegistrationError("이름 또는 생년월일이 코드와 다릅니다."),
    );

    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ name: "김철수", birthDate: "2009-12-31" }),
    );

    expect(state.values).toEqual({ name: "김철수", birthDate: "2009-12-31" });
  });

  it("돌려주는 값에 비밀번호는 없다", async () => {
    const state = await completeRegistrationAction(
      REGISTER_INITIAL,
      registerForm({ confirmPassword: "다른-비밀번호-입니다" }),
    );

    expect(Object.keys(state.values).sort()).toEqual(["birthDate", "name"]);
  });

  it("생년월일 칸이 없으면 빈 문자열로 돌려준다", async () => {
    const fd = registerForm({ phone: "01012" });
    fd.delete("birthDate");

    const state = await completeRegistrationAction(REGISTER_INITIAL, fd);

    expect(state.values).toEqual({ name: "홍길동", birthDate: "" });
  });

  it("성공하면 바로 로그인시킨다", async () => {
    await expect(
      completeRegistrationAction(REGISTER_INITIAL, registerForm()),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(signInSilently).toHaveBeenCalledWith(
      "hong@gbsw.hs.kr",
      "correct-horse-battery",
      expect.any(Promise),
    );
  });
});

describe("requestVerificationAction — 경계 검증", () => {
  it("채널·대상·가입코드가 맞으면 서비스까지 도달한다", async () => {
    const result = await requestVerificationAction(
      "PHONE",
      "010-1234-5678",
      CODE,
    );

    expect(requestVerification).toHaveBeenCalledWith(CODE, "PHONE", "010-1234-5678");
    expect(result.ok).toBe(true);
  });

  it("가입코드가 비면 발송을 촉발하지 않는다", async () => {
    const result = await requestVerificationAction("PHONE", "010-1234-5678", "");

    expect(requestVerification).not.toHaveBeenCalled();
    expect(result.error).toBe("형식을 확인해 주세요.");
  });

  it("모르는 채널이면 서비스를 부르지 않는다", async () => {
    const result = await requestVerificationAction("FAX", "010-1234-5678", CODE);

    expect(requestVerification).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("임시 우회 확인 결과는 그대로 화면까지 전달한다", async () => {
    requestVerification.mockResolvedValueOnce({ verified: true });

    const result = await requestVerificationAction("EMAIL", "a@b.kr", CODE);

    expect(result.verified).toBe(true);
  });

  it("정제된 문구는 그대로, 그 밖의 오류는 감춘다", async () => {
    requestVerification.mockRejectedValueOnce(
      new VerificationError("잠시 후 다시 시도해 주세요."),
    );
    expect((await requestVerificationAction("EMAIL", "a@b.kr", CODE)).error).toBe(
      "잠시 후 다시 시도해 주세요.",
    );

    requestVerification.mockRejectedValueOnce(new Error("SMTP 535"));
    expect((await requestVerificationAction("EMAIL", "a@b.kr", CODE)).error).toBe(
      "인증번호를 보내지 못했습니다.",
    );
  });
});

describe("confirmVerificationAction — 경계 검증", () => {
  it("임시 우회 proof가 이미 있으면 인증번호 없이 확인된다", async () => {
    const result = await confirmVerificationAction("PHONE", "010-1234-5678", "");

    expect(requireVerified).toHaveBeenCalledWith("PHONE", "010-1234-5678");
    expect(confirmCode).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, error: null, verified: true });
  });

  it("여섯 자리면 서비스까지 도달한다", async () => {
    const result = await confirmVerificationAction("PHONE", "010-1234-5678", "123456");

    expect(confirmCode).toHaveBeenCalledWith("PHONE", "010-1234-5678", "123456");
    expect(result.ok).toBe(true);
  });

  it("자릿수가 다르면 서비스를 부르지 않는다", async () => {
    const result = await confirmVerificationAction("PHONE", "010-1234-5678", "12345");

    expect(confirmCode).not.toHaveBeenCalled();
    expect(result.error).toBe("인증번호 6자리를 입력해 주세요.");
  });

  it("정제된 문구는 그대로, 그 밖의 오류는 감춘다", async () => {
    confirmCode.mockRejectedValueOnce(
      new VerificationError("인증번호가 올바르지 않습니다."),
    );
    expect(
      (await confirmVerificationAction("PHONE", "010-1234-5678", "123456")).error,
    ).toBe("인증번호가 올바르지 않습니다.");

    confirmCode.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(
      (await confirmVerificationAction("PHONE", "010-1234-5678", "123456")).error,
    ).toBe("인증하지 못했습니다.");
  });
});
