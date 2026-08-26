import { describe, expect, it } from "vitest";
import { passEndLabel, passPeriod } from "@/modules/pass/pass.labels";

/**
 * 외박의 `endAt`은 **종료일 다음 날 자정**이다. 그대로 그리면 「오전 12:00」이
 * 뜨고 날짜도 하루 밀린다 — 실제로 교사 화면과 판독 화면에서 한 번씩 그랬다.
 * 화면마다 손으로 그리지 않도록 규칙을 여기 모았고, 이 파일이 그것을 지킨다.
 */

/** 2026-08-26 14:00 KST ~ 18:00 KST */
const outing = {
  type: "OUTING",
  startAt: new Date("2026-08-26T05:00:00.000Z"),
  endAt: new Date("2026-08-26T09:00:00.000Z"),
};

/** 8/26 자정 ~ 8/28 자정 = 8월 26·27일 이틀 밤 */
const overnight = {
  type: "OVERNIGHT",
  startAt: new Date("2026-08-25T15:00:00.000Z"),
  endAt: new Date("2026-08-27T15:00:00.000Z"),
};

describe("passPeriod", () => {
  it("외출은 시각까지 적는다", () => {
    expect(passPeriod(outing)).toBe("26. 8. 26. 오후 2:00 ~ 26. 8. 26. 오후 6:00");
  });

  it("외박은 마지막 밤까지 적는다 — 다음 날 자정이 새어 나오지 않는다", () => {
    expect(passPeriod(overnight)).toBe("8. 26. ~ 8. 27.");
  });

  it("하루짜리 외박은 같은 날이 두 번 나온다", () => {
    expect(
      passPeriod({
        type: "OVERNIGHT",
        startAt: new Date("2026-08-25T15:00:00.000Z"),
        endAt: new Date("2026-08-26T15:00:00.000Z"),
      }),
    ).toBe("8. 26. ~ 8. 26.");
  });
});

describe("passEndLabel", () => {
  it("외출은 시각이 알맹이다", () => {
    expect(passEndLabel(outing)).toBe("오후 6:00");
  });

  it("외박은 날짜다 — 「오전 12:00」이 아니다", () => {
    expect(passEndLabel(overnight)).toBe("8. 27.");
  });

  it("월말을 넘겨도 하루가 밀리지 않는다", () => {
    expect(
      passEndLabel({
        type: "OVERNIGHT",
        endAt: new Date("2026-09-01T15:00:00.000Z"), // 9/2 자정 KST
      }),
    ).toBe("9. 1.");
  });
});
