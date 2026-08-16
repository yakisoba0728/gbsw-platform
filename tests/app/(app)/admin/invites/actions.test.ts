import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";

/**
 * 초대코드 발급·폐기 액션의 **경계** — 폼의 FormData가 zod 스키마에 닿는 지점.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 화면이 실제로 보내는 name 그대로 만든다.
 * 출처: admin/invites/invite-form.tsx(발급 3종, 유효기간은 ExpiryField 공용) ·
 * revoke-button.tsx(폐기).
 *
 * 특히 **ForbiddenError가 "이미 사용되었거나 폐기된 코드입니다"로 안내되지 않는지**
 * 를 본다 — 감사로그에는 authz:denied가 정확히 남는데 화면만 다른 원인을 가리키던
 * 결함이 이 파일에 있었다.
 */

// 목은 구현 없이 선언하고 기본값은 beforeEach에서 준다 —
// tests/modules/**의 서비스 테스트와 같은 방식이다.
const requireAuth = vi.fn();
const revalidatePath = vi.fn();

const createStudentInvite = vi.fn();
const createAdminInvite = vi.fn();
const createParentInviteFor = vi.fn();
const revokeInvite = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/invites/invite.service", () => ({
  InviteError: class InviteError extends Error {},
  MAX_ACTIVE_PARENT_INVITES: 3,
  createStudentInvite,
  createAdminInvite,
  createParentInviteFor,
  revokeInvite,
}));

const { InviteError } = await import("@/modules/invites/invite.service");
const {
  createStudentInviteAction,
  createAdminInviteAction,
  createParentInviteForAction,
  revokeInviteAction,
} = await import("@/app/(app)/admin/invites/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** invite-form.tsx의 StudentForm이 보내는 필드 그대로. */
function studentForm(over: Record<string, string> = {}): FormData {
  return form({
    name: "홍길동",
    birthDate: "2010-03-02",
    grade: "1",
    classNo: "2",
    number: "13",
    expiresInDays: "",
    ...over,
  });
}

/** invite-form.tsx의 AdminForm이 보내는 필드 그대로. */
function adminForm(over: Record<string, string> = {}): FormData {
  return form({ name: "김교사", expiresInDays: "", ...over });
}

/** invite-form.tsx의 ParentForm이 보내는 필드 그대로. */
function parentForm(over: Record<string, string> = {}): FormData {
  return form({
    studentId: "sp-1",
    name: "홍부모",
    expiresInDays: "",
    ...over,
  });
}

const INITIAL = { error: null, code: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
  createStudentInvite.mockResolvedValue({ code: "ABCD1234" });
  createAdminInvite.mockResolvedValue({ code: "ABCD1234" });
  createParentInviteFor.mockResolvedValue({ code: "ABCD1234" });
});

describe("createStudentInviteAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(createStudentInvite).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
    expect(state.code).toBe("GBSW-ABCD-1234");
  });

  it("폼의 여섯 필드를 모두 읽는다 — 숫자는 액션이 변환한다", async () => {
    await createStudentInviteAction(INITIAL, studentForm());

    expect(createStudentInvite).toHaveBeenCalledWith(expect.anything(), {
      name: "홍길동",
      birthDate: "2010-03-02",
      grade: 1,
      classNo: 2,
      number: 13,
      expiresInDays: undefined,
    });
  });

  it("유효기간을 비우면 무기한으로 넘어간다 (undefined)", async () => {
    await createStudentInviteAction(INITIAL, studentForm({ expiresInDays: "  " }));

    expect(createStudentInvite.mock.calls[0]?.[1].expiresInDays).toBeUndefined();
  });

  it("유효기간을 채우면 숫자로 넘어간다", async () => {
    await createStudentInviteAction(INITIAL, studentForm({ expiresInDays: "30" }));

    expect(createStudentInvite.mock.calls[0]?.[1].expiresInDays).toBe(30);
  });

  it("이름이 비면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await createStudentInviteAction(INITIAL, studentForm({ name: " " }));

    expect(createStudentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("이름을 입력해 주세요.");
  });

  it("생년월일 형식이 틀리면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await createStudentInviteAction(
      INITIAL,
      studentForm({ birthDate: "2010/03/02" }),
    );

    expect(createStudentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("생년월일은 YYYY-MM-DD 형식으로 입력해 주세요.");
  });

  /*
   * **알려진 결함을 못 박아 두는 테스트다.**
   *
   * 학년·반·번호만 스키마에 한글 문구가 없어(invite.schema.ts:37-39) zod의 영문
   * 기본 메시지가 그대로 화면에 나간다 — 액션의 `?? "입력값을 확인해 주세요."`는
   * issues[0]에 message가 있으므로 절대 닿지 않는다. 폼에 min/max/required가
   * 붙어 있어 브라우저가 대개 먼저 막지만, 서버 액션을 직접 부르면 뚫린다.
   *
   * 고치는 자리는 스키마 쪽이다(다른 필드처럼 문구를 붙인다). 고치고 나면 이
   * 테스트가 깨지므로, 그때 "한국어다"로 뒤집으면 된다.
   */
  it("학년·반·번호 범위 오류만 zod 영문 기본 메시지가 새어 나간다 (알려진 결함)", async () => {
    const cases: Record<string, string>[] = [
      { grade: "9" },
      { classNo: "0" },
      { number: "99" },
    ];

    for (const over of cases) {
      vi.clearAllMocks();
      const state = await createStudentInviteAction(INITIAL, studentForm(over));

      expect(createStudentInvite, JSON.stringify(over)).not.toHaveBeenCalled();
      expect(state.error, JSON.stringify(over)).toMatch(/^Too (big|small):/);
    }
  });

  it("칸을 비우면 Number(null)=0이 되어 막힌다 — 서비스에 0이 흘러가지 않는다", async () => {
    const fd = studentForm();
    fd.delete("grade");

    const state = await createStudentInviteAction(INITIAL, fd);

    expect(createStudentInvite).not.toHaveBeenCalled();
    expect(state.error).not.toBeNull();
  });

  it("권한 거부는 발급 실패가 아니라 권한 문제로 안내한다", async () => {
    createStudentInvite.mockRejectedValueOnce(new ForbiddenError("invite:create"));

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
  });

  it("코드 생성 실패는 다시 시도하라고 안내한다", async () => {
    createStudentInvite.mockRejectedValueOnce(
      new InviteError("CODE_GENERATION_FAILED"),
    );

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.error).toBe("코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("사전에 없는 오류는 영문 코드를 화면에 흘리지 않는다", async () => {
    createStudentInvite.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.error).toBe("코드를 발급하지 못했습니다.");
  });
});

describe("createAdminInviteAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await createAdminInviteAction(INITIAL, adminForm());

    expect(createAdminInvite).toHaveBeenCalledWith(expect.anything(), {
      name: "김교사",
      expiresInDays: undefined,
    });
    expect(state.code).toBe("GBSW-ABCD-1234");
  });

  it("이름이 비면 서비스를 부르지 않는다", async () => {
    const state = await createAdminInviteAction(INITIAL, adminForm({ name: "" }));

    expect(createAdminInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("이름을 입력해 주세요.");
  });

  it("권한 거부는 권한 문제로 안내한다", async () => {
    createAdminInvite.mockRejectedValueOnce(new ForbiddenError("invite:create"));

    const state = await createAdminInviteAction(INITIAL, adminForm());

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
  });
});

describe("createParentInviteForAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await createParentInviteForAction(INITIAL, parentForm());

    expect(createParentInviteFor).toHaveBeenCalledWith(expect.anything(), {
      studentId: "sp-1",
      name: "홍부모",
      expiresInDays: undefined,
    });
    expect(state.code).toBe("GBSW-ABCD-1234");
  });

  it("학생을 안 고르면 서비스를 부르지 않는다", async () => {
    // 조건에 맞는 학생이 없으면 <option disabled>만 남아 값이 비어 온다.
    const state = await createParentInviteForAction(
      INITIAL,
      parentForm({ studentId: "" }),
    );

    expect(createParentInviteFor).not.toHaveBeenCalled();
    expect(state.error).toBe("학생을 선택해 주세요.");
  });

  it("남은 코드 한도는 상수를 그대로 쓴 문구로 안내한다", async () => {
    createParentInviteFor.mockRejectedValueOnce(
      new InviteError("TOO_MANY_ACTIVE_INVITES"),
    );

    const state = await createParentInviteForAction(INITIAL, parentForm());

    expect(state.error).toBe("이 학생에게 아직 쓰지 않은 코드가 3개 있습니다.");
  });
});

describe("revokeInviteAction — 경계 검증", () => {
  it("revoke-button.tsx의 hidden input 하나면 서비스까지 도달한다", async () => {
    const state = await revokeInviteAction({ error: null }, form({ inviteId: "inv-1" }));

    expect(revokeInvite).toHaveBeenCalledWith(expect.anything(), "inv-1");
    expect(state.error).toBeNull();
  });

  it("관리자 목록과 학생 화면을 함께 다시 그린다 — 같은 액션을 둘이 쓴다", async () => {
    await revokeInviteAction({ error: null }, form({ inviteId: "inv-1" }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/invites");
    expect(revalidatePath).toHaveBeenCalledWith("/parent-invite");
  });

  /*
   * 이 저장소가 명시적으로 고쳤던 결함이다 — 폐기 액션의 catch-all이 권한 거부를
   * "이미 사용되었거나 폐기된 코드입니다"로 덮었다. 되돌아오면 여기서 잡힌다.
   */
  it("권한 거부를 '이미 사용된 코드'로 안내하지 않는다", async () => {
    revokeInvite.mockRejectedValueOnce(new ForbiddenError("invite:revoke"));

    const state = await revokeInviteAction({ error: null }, form({ inviteId: "inv-1" }));

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
    expect(state.error).not.toBe("이미 사용되었거나 폐기된 코드입니다.");
  });

  it("정말 사용된 코드일 때만 그 문구를 쓴다", async () => {
    revokeInvite.mockRejectedValueOnce(new InviteError("NOT_PENDING"));

    const state = await revokeInviteAction({ error: null }, form({ inviteId: "inv-1" }));

    expect(state.error).toBe("이미 사용되었거나 폐기된 코드입니다.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    revokeInvite.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await revokeInviteAction({ error: null }, form({ inviteId: "inv-1" }));

    expect(state.error).toBe("폐기하지 못했습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await createAdminInviteAction(INITIAL, adminForm({ name: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
