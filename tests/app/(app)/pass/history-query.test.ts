import { describe, expect, it } from "vitest";
import { parseHistoryPageParams } from "@/app/(app)/pass/history/query";

describe("parseHistoryPageParams", () => {
  it("기간 순서가 틀려도 유효한 유형·상태·검색·쪽 필터는 유지한다", () => {
    const parsed = parseHistoryPageParams({
      type: "OVERNIGHT",
      status: "REQUESTED",
      q: "  김학생  ",
      from: "2026-08-27",
      to: "2026-08-26",
      page: "7",
    });

    expect(parsed.query).toEqual({
      type: "OVERNIGHT",
      status: "REQUESTED",
      q: "김학생",
      from: "2026-08-27",
      to: "2026-08-26",
      page: 7,
    });
    expect(parsed.periodError).toBe("시작일은 종료일보다 늦을 수 없습니다.");
    expect(parsed.initialFrom).toBe("2026-08-27");
    expect(parsed.initialTo).toBe("2026-08-26");
  });

  it("잘못된 필드 하나만 기본값으로 내리고 다른 유효 필터는 보존한다", () => {
    const parsed = parseHistoryPageParams({
      type: "OUTING",
      status: "EXPIRED",
      q: "치과",
      page: "3",
    });

    expect(parsed.query).toMatchObject({
      type: "OUTING",
      status: undefined,
      q: "치과",
      page: 3,
    });
    expect(parsed.periodError).toBeNull();
  });
});
