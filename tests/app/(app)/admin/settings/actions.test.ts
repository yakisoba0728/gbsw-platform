import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeritError } from "@/modules/merit/merit.error";

const requireAuth = vi.fn(async () => ({ id: "admin-1", role: "ADMIN" }));
const revalidatePath = vi.fn();
const setDemeritThresholds = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/core/auth/session", () => ({ requireAuth }));
vi.mock("@/modules/merit/threshold.service", () => ({ setDemeritThresholds }));

const { saveThresholdAction } = await import("@/app/(app)/admin/settings/actions");

const INITIAL = { error: null, ok: false, values: null };

function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries({
    track: "SCHOOL",
    updatedAt: "2026-08-19T00:00:00.000Z",
    warn: "20",
    danger: "30",
    ...over,
  })) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveThresholdAction — 경계 검증", () => {
  it("폼이 보내는 revision과 기준 값을 서비스까지 넘긴다", async () => {
    const state = await saveThresholdAction(INITIAL, form());

    expect(setDemeritThresholds).toHaveBeenCalledWith(expect.anything(), {
      track: "SCHOOL",
      updatedAt: new Date("2026-08-19T00:00:00.000Z"),
      warn: 20,
      danger: 30,
    });
    expect(state).toEqual({ error: null, ok: true, values: null });
  });

  it("저장된 적 없는 트랙의 빈 revision은 null로 넘긴다", async () => {
    await saveThresholdAction(INITIAL, form({ updatedAt: "" }));

    expect(setDemeritThresholds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ updatedAt: null }),
    );
  });

  it("다른 교사의 선행 수정을 명확히 알린다", async () => {
    setDemeritThresholds.mockRejectedValueOnce(new MeritError("THRESHOLD_CONFLICT"));

    const state = await saveThresholdAction(INITIAL, form());

    expect(state.error).toContain("다른 교사");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("위험 기준이 경고 기준 이하면 서비스를 부르지 않는다", async () => {
    const state = await saveThresholdAction(INITIAL, form({ warn: "30", danger: "20" }));

    expect(setDemeritThresholds).not.toHaveBeenCalled();
    expect(state.error).toBe("위험 기준은 경고 기준보다 커야 합니다.");
  });

  /*
   * React 19는 액션이 끝나면 성공·실패를 가리지 않고 폼을 reset()한다. 두 칸이
   * defaultValue만 준 비제어 입력이라, 실패 상태가 제출값을 싣지 않으면 방금
   * 입력한 숫자가 저장된 값으로 되감긴다.
   */
  it("거부되면 방금 입력한 두 숫자를 돌려준다", async () => {
    const state = await saveThresholdAction(INITIAL, form({ warn: "30", danger: "20" }));

    expect(state.values).toEqual({ warn: "30", danger: "20" });
  });

  it("서비스가 거부해도 제출값을 돌려준다", async () => {
    setDemeritThresholds.mockRejectedValueOnce(new MeritError("THRESHOLD_CONFLICT"));

    const state = await saveThresholdAction(INITIAL, form({ warn: "15", danger: "25" }));

    expect(state.values).toEqual({ warn: "15", danger: "25" });
  });

  it("성공하면 제출값을 싣지 않는다 — 저장된 값이 보여야 한다", async () => {
    const state = await saveThresholdAction(INITIAL, form());

    expect(state.values).toBeNull();
  });
});
