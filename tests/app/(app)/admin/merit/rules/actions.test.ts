import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeritError } from "@/modules/merit/merit.error";

/**
 * 규정 관리 서버 액션의 **경계** — 폼의 FormData가 zod 스키마에 닿는 지점.
 * (auth)/register/actions.test.ts와 같은 목적이다.
 *
 * FormData는 화면이 실제로 보내는 name 그대로 만든다.
 * 출처: admin/merit/rules/rule-form.tsx(생성) · rule-table.tsx(수정·삭제).
 * 수정·삭제 폼은 표 바깥의 숨은 `<form id="rule-edit-form">`에 `form=` 속성으로
 * 붙어 있어 필드가 여기저기 흩어져 있다 — 짐작하지 말고 그 파일에서 옮겼다.
 */

const requireAuth = vi.fn(async () => ({ id: "admin-1", role: "ADMIN" }));
const revalidatePath = vi.fn();

const createRule = vi.fn();
const updateRule = vi.fn();
const deleteRule = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/merit/rule.service", () => ({
  createRule,
  updateRule,
  deleteRule,
}));

const { createRuleAction, updateRuleAction, deleteRuleAction } = await import(
  "@/app/(app)/admin/merit/rules/actions"
);

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

/** rule-form.tsx가 보내는 필드 그대로. track은 hidden, kind는 Select. */
function createForm(over: Record<string, string> = {}): FormData {
  return form({
    track: "DORM",
    kind: "DEMERIT",
    label: "점호 지각",
    points: "3",
    category: "생활",
    description: "",
    ...over,
  });
}

/** rule-table.tsx의 인라인 편집이 보내는 필드 그대로. track·kind는 없다. */
function updateForm(over: Record<string, string> = {}): FormData {
  return form({
    ruleId: "rule-1",
    label: "점호 지각",
    points: "3",
    category: "생활",
    description: "",
    ...over,
  });
}

const INITIAL = { error: null, ok: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRuleAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await createRuleAction(INITIAL, createForm());

    expect(createRule).toHaveBeenCalledOnce();
    expect(state).toEqual({ error: null, ok: true });
  });

  it("폼의 여섯 필드를 모두 읽는다 — 하나라도 빠지면 스키마가 막는다", async () => {
    await createRuleAction(INITIAL, createForm({ description: "야간 점호 기준" }));

    expect(createRule).toHaveBeenCalledWith(expect.anything(), {
      track: "DORM",
      kind: "DEMERIT",
      label: "점호 지각",
      points: 3,
      category: "생활",
      description: "야간 점호 기준",
    });
  });

  it("빈 선택 입력은 null로 접힌다 — 빈 문자열과 갈리지 않게", async () => {
    await createRuleAction(INITIAL, createForm({ category: "", description: "" }));

    expect(createRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: null, description: null }),
    );
  });

  it("항목명이 비면 서비스를 부르지 않고 한국어로 알린다", async () => {
    const state = await createRuleAction(INITIAL, createForm({ label: "  " }));

    expect(createRule).not.toHaveBeenCalled();
    expect(state.error).toBe("항목명을 입력해 주세요.");
  });

  it("점수가 0·음수·소수·빈 값이면 막는다 — 부호는 kind가 정한다", async () => {
    // "0"만 정규식(\d+)을 통과하고 범위 refine에서 걸린다 — 문구가 갈리는 것이
    // 정상이지만, 어느 쪽이든 한국어여야 하고 서비스에는 닿지 말아야 한다.
    const cases: [string, string][] = [
      ["0", "점수는 1~1000 사이여야 합니다."],
      ["-3", "점수는 1 이상의 정수여야 합니다."],
      ["1.5", "점수는 1 이상의 정수여야 합니다."],
      ["", "점수는 1 이상의 정수여야 합니다."],
    ];

    for (const [points, message] of cases) {
      vi.clearAllMocks();
      const state = await createRuleAction(INITIAL, createForm({ points }));

      expect(createRule, `points=${points}`).not.toHaveBeenCalled();
      expect(state.error, `points=${points}`).toBe(message);
    }
  });

  it("트랙이 목록 밖이면 막는다", async () => {
    const state = await createRuleAction(INITIAL, createForm({ track: "LIBRARY" }));

    expect(createRule).not.toHaveBeenCalled();
    expect(state.error).not.toBeNull();
    expect(state.ok).toBe(false);
  });

  it("검증에 걸리면 화면을 다시 그리지 않는다", async () => {
    await createRuleAction(INITIAL, createForm({ label: "" }));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateRuleAction — 경계 검증", () => {
  it("폼이 보내는 값 그대로면 서비스까지 도달한다", async () => {
    const state = await updateRuleAction(INITIAL, updateForm());

    expect(updateRule).toHaveBeenCalledOnce();
    expect(state).toEqual({ error: null, ok: true });
  });

  it("track·kind를 보내도 서비스에 넘기지 않는다 — 벌점이 상점으로 변신하면 안 된다", async () => {
    await updateRuleAction(
      INITIAL,
      updateForm({ track: "SCHOOL", kind: "MERIT" }),
    );

    const input = updateRule.mock.calls[0]?.[1];
    expect(input).not.toHaveProperty("track");
    expect(input).not.toHaveProperty("kind");
  });

  it("ruleId가 비면 서비스를 부르지 않는다", async () => {
    const state = await updateRuleAction(INITIAL, updateForm({ ruleId: "" }));

    expect(updateRule).not.toHaveBeenCalled();
    expect(state.ok).toBe(false);
  });

  it("사라진 규정은 그 이유를 알린다", async () => {
    updateRule.mockRejectedValueOnce(new MeritError("RULE_NOT_FOUND"));

    const state = await updateRuleAction(INITIAL, updateForm());

    expect(state.error).toBe("규정을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.");
  });

  it("사전에 없는 코드는 영문 코드를 화면에 흘리지 않는다", async () => {
    updateRule.mockRejectedValueOnce(new MeritError("SOME_NEW_CODE"));

    const state = await updateRuleAction(INITIAL, updateForm());

    expect(state.error).toBe("처리하지 못했습니다.");
  });
});

describe("deleteRuleAction — 경계 검증", () => {
  it("폼이 보내는 ruleId 하나면 서비스까지 도달한다", async () => {
    const state = await deleteRuleAction(INITIAL, form({ ruleId: "rule-1" }));

    expect(deleteRule).toHaveBeenCalledWith(expect.anything(), "rule-1");
    expect(state).toEqual({ error: null, ok: true });
  });

  it("ruleId가 없으면 서비스를 부르지 않는다", async () => {
    const state = await deleteRuleAction(INITIAL, new FormData());

    expect(deleteRule).not.toHaveBeenCalled();
    expect(state.error).toBe("규정을 찾을 수 없습니다.");
  });
});

describe("모든 액션이 requireAuth로 시작한다", () => {
  it("검증 실패로 끝나는 경로에서도 세션을 먼저 확인한다", async () => {
    await createRuleAction(INITIAL, createForm({ label: "" }));

    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
