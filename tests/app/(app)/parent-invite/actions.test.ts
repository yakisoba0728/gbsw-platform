import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/core/authz/errors";

/**
 * 학생이 직접 만드는 학부모 코드 액션의 **경계**.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 parent-invite-form.tsx가 실제로 보내는 name 그대로 만든다 —
 * 이 폼은 `name` 하나만 보낸다(관리자 발급 화면과 달리 유효기간 칸이 없다).
 *
 * **studentId를 받지 않는 것이 이 액션의 핵심 규약이다** — 세션에서 유도할 수
 * 있는 식별자를 클라이언트 입력으로 받지 않는다(CLAUDE.md). 폼에 없는 값을
 * 억지로 넣어 보내도 서비스로 새지 않아야 한다.
 */

// 목은 구현 없이 선언하고 기본값은 beforeEach에서 준다.
const requireAuth = vi.fn();
const revalidatePath = vi.fn();
const createParentInvite = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/invites/invite.service", () => ({
  InviteError: class InviteError extends Error {},
  MAX_ACTIVE_PARENT_INVITES: 3,
  createParentInvite,
}));

const { InviteError } = await import("@/modules/invites/invite.service");
const { createParentInviteAction } = await import(
  "@/app/(app)/parent-invite/actions"
);

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const INITIAL = { error: null, code: null };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "stu-1", role: "STUDENT" });
  createParentInvite.mockResolvedValue({ code: "ABCD1234" });
});

describe("createParentInviteAction — 경계 검증", () => {
  it("폼이 보내는 name 하나면 서비스까지 도달한다", async () => {
    const state = await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(createParentInvite).toHaveBeenCalledOnce();
    expect(state.error).toBeNull();
    expect(state.code).toBe("GBSW-ABCD-1234");
  });

  it("유효기간 칸이 없는 폼이라 무기한으로 넘어간다", async () => {
    await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(createParentInvite).toHaveBeenCalledWith(expect.anything(), {
      name: "홍부모",
      expiresInDays: undefined,
    });
  });

  it("studentId를 끼워 보내도 서비스로 새지 않는다 — 본인은 세션이 정한다", async () => {
    await createParentInviteAction(
      INITIAL,
      form({ name: "홍부모", studentId: "남의-학생-id" }),
    );

    expect(createParentInvite.mock.calls[0]?.[1]).not.toHaveProperty("studentId");
    // 서비스 인자도 (actor, input) 둘뿐이다 — 세 번째로 새어 나가지 않는다.
    expect(createParentInvite.mock.calls[0]).toHaveLength(2);
  });

  it("이름이 비면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await createParentInviteAction(INITIAL, form({ name: "  " }));

    expect(createParentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("이름을 입력해 주세요.");
  });

  it("이름이 너무 길면 서비스를 부르지 않는다", async () => {
    const state = await createParentInviteAction(
      INITIAL,
      form({ name: "가".repeat(51) }),
    );

    expect(createParentInvite).not.toHaveBeenCalled();
    expect(state.error).toBe("이름이 너무 깁니다.");
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await createParentInviteAction(INITIAL, form({ name: "" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("한도 초과 문구는 학생 본인 시점으로 쓰인다 — 관리자 화면과 다르다", async () => {
    createParentInvite.mockRejectedValueOnce(
      new InviteError("TOO_MANY_ACTIVE_INVITES"),
    );

    const state = await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(state.error).toContain("사용하지 않은 코드가 이미 3개 있습니다");
  });

  it("권한 거부를 '코드를 만들지 못했습니다'로 덮지 않는다", async () => {
    createParentInvite.mockRejectedValueOnce(new ForbiddenError("invite:create-own"));

    const state = await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(state.error).toBe("이 작업을 할 권한이 없습니다.");
  });

  it("학생이 아닌 계정은 그 이유를 알린다", async () => {
    createParentInvite.mockRejectedValueOnce(new InviteError("NOT_A_STUDENT"));

    const state = await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(state.error).toBe("학생 계정만 만들 수 있습니다.");
  });

  it("사전에 없는 오류는 영문을 화면에 흘리지 않는다", async () => {
    createParentInvite.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const state = await createParentInviteAction(INITIAL, form({ name: "홍부모" }));

    expect(state.error).toBe("코드를 만들지 못했습니다.");
  });

  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await createParentInviteAction(INITIAL, form({ name: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
