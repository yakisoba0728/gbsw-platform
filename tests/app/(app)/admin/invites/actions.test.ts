import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";
import {
  CLASS_NO_RANGE_MESSAGE,
  GRADE_RANGE_MESSAGE,
  NUMBER_RANGE_MESSAGE,
} from "@/modules/enrollment/enrollment.schema";

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
  MAX_ACTIVE_PARENT_INVITES: 2,
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

function adminForm(over: Record<string, string> = {}): FormData {
  return form({ name: "김교사", expiresInDays: "", ...over });
}

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

  it.each([
    ["0", "하한 미만"],
    ["366", "상한 초과"],
    ["1.5", "정수가 아님"],
    ["abc", "숫자가 아님"],
  ])("유효기간이 %s(%s)이면 한국어로 알리고 서비스를 부르지 않는다", async (value) => {
    const state = await createStudentInviteAction(
      INITIAL,
      studentForm({ expiresInDays: value }),
    );

    expect(createStudentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("유효기간은 1~365일 사이의 정수여야 합니다.");
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

  it("달력에 없는 생년월일은 서비스를 부르지 않는다", async () => {
    const state = await createStudentInviteAction(
      INITIAL,
      studentForm({ birthDate: "2010-02-30" }),
    );

    expect(createStudentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("존재하지 않는 날짜입니다.");
  });

  it("학년·반·번호 범위 오류도 한국어로 알린다", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ grade: "9" }, GRADE_RANGE_MESSAGE],
      [{ classNo: "0" }, CLASS_NO_RANGE_MESSAGE],
      [{ number: "99" }, NUMBER_RANGE_MESSAGE],
    ];

    for (const [over, message] of cases) {
      vi.clearAllMocks();
      const state = await createStudentInviteAction(INITIAL, studentForm(over));

      expect(createStudentInvite, JSON.stringify(over)).not.toHaveBeenCalled();
      expect(state.error, JSON.stringify(over)).toBe(message);
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

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("코드 생성 실패는 다시 시도하라고 안내한다", async () => {
    createStudentInvite.mockRejectedValueOnce(
      new InviteError("CODE_GENERATION_FAILED"),
    );

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.error).toBe("코드를 만들지 못했습니다. 다시 시도해 주세요.");
  });

  it("사전에 없는 오류는 영문 코드를 화면에 흘리지 않는다", async () => {
    createStudentInvite.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.error).toBe("코드를 발급하지 못했습니다.");
  });

  it("실패하면 여섯 칸을 그대로 돌려준다", async () => {
    const state = await createStudentInviteAction(
      INITIAL,
      studentForm({ grade: "9", expiresInDays: "30" }),
    );

    expect(state.values).toEqual({
      name: "홍길동",
      birthDate: "2010-03-02",
      grade: "9",
      classNo: "2",
      number: "13",
      expiresInDays: "30",
    });
  });

  it("서비스가 던진 오류로 실패해도 제출값을 돌려준다", async () => {
    createStudentInvite.mockRejectedValueOnce(new ForbiddenError("invite:create"));

    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.values?.name).toBe("홍길동");
  });

  it("성공하면 제출값을 싣지 않는다 — 폼은 비어야 한다", async () => {
    const state = await createStudentInviteAction(INITIAL, studentForm());

    expect(state.values).toBeUndefined();
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

    expect(state.error).toBe("권한이 없습니다.");
  });

  it("실패하면 두 칸을 그대로 돌려준다", async () => {
    const state = await createAdminInviteAction(
      INITIAL,
      adminForm({ name: "", expiresInDays: "7" }),
    );

    expect(state.values).toEqual({ name: "", expiresInDays: "7" });
  });
});

describe("초대 목록 재검증", () => {
  it.each([
    ["학생", createStudentInviteAction, studentForm],
    ["교사", createAdminInviteAction, adminForm],
    ["학부모", createParentInviteForAction, parentForm],
  ])("%s 코드 발급 뒤 실제 목록 경로를 다시 그린다", async (_label, action, makeForm) => {
    await action(INITIAL, makeForm());

    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).not.toHaveBeenCalledWith("/admin/invites");
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

    expect(state.error).toBe("이 학생에게 쓰지 않은 코드가 2개 있습니다.");
  });

  it("실패하면 고른 학생을 그대로 돌려준다", async () => {
    createParentInviteFor.mockRejectedValueOnce(
      new InviteError("TOO_MANY_ACTIVE_INVITES"),
    );

    const state = await createParentInviteForAction(INITIAL, parentForm());

    expect(state.values).toEqual({
      studentId: "sp-1",
      name: "홍부모",
      expiresInDays: "",
    });
  });

  it("성공하면 제출값을 싣지 않는다", async () => {
    const state = await createParentInviteForAction(INITIAL, parentForm());

    expect(state.values).toBeUndefined();
  });
});

describe("revokeInviteAction — 경계 검증", () => {
  const REVOKE = { ok: false, error: null };

  it("사유가 비면 서비스를 부르지 않는다", async () => {
    const state = await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "  " }));

    expect(revokeInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("폐기 사유를 입력해 주세요.");
    expect(state.ok).toBe(false);
  });

  it("revoke-button.tsx의 hidden input 하나면 서비스까지 도달한다", async () => {
    const state = await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "잘못 발급" }));

    expect(revokeInvite).toHaveBeenCalledWith(expect.anything(), {
      inviteId: "inv-1",
      reason: "잘못 발급",
    });
    expect(state.error).toBeNull();
    expect(state.ok).toBe(true);
  });

  it("관리자 목록과 학생 화면을 함께 다시 그린다 — 같은 액션을 둘이 쓴다", async () => {
    await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "잘못 발급" }));

    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(revalidatePath).not.toHaveBeenCalledWith("/admin/invites");
    expect(revalidatePath).toHaveBeenCalledWith("/parent-invite");
  });

  it("권한 거부를 '이미 사용된 코드'로 안내하지 않는다", async () => {
    revokeInvite.mockRejectedValueOnce(new ForbiddenError("invite:revoke"));

    const state = await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "잘못 발급" }));

    expect(state.error).toBe("권한이 없습니다.");
    expect(state.error).not.toBe("이미 쓰였거나 폐기된 코드입니다.");
  });

  it("정말 사용된 코드일 때만 그 문구를 쓴다", async () => {
    revokeInvite.mockRejectedValueOnce(new InviteError("NOT_PENDING"));

    const state = await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "잘못 발급" }));

    expect(state.error).toBe("이미 쓰였거나 폐기된 코드입니다.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    revokeInvite.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await revokeInviteAction(REVOKE, form({ inviteId: "inv-1", reason: "잘못 발급" }));

    expect(state.error).toBe("폐기하지 못했습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await createAdminInviteAction(INITIAL, adminForm({ name: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
