import { describe, expect, it } from "vitest";
import {
  passEndLabel,
  passPeriod,
  passStatusLabel,
} from "@/modules/pass/pass.labels";

const outing = {
  type: "OUTING",
  startAt: new Date("2026-08-26T05:00:00.000Z"),
  endAt: new Date("2026-08-26T09:00:00.000Z"),
};

const overnight = {
  type: "OVERNIGHT",
  startAt: new Date("2026-08-26T09:00:00.000Z"),
  endAt: new Date("2026-08-28T00:00:00.000Z"),
};

describe("passPeriod", () => {
  it("외출은 종료에 날짜를 되풀이하지 않는다 — 같은 날임이 보장된다", () => {
    expect(passPeriod(outing)).toBe("26. 8. 26. 오후 2:00 ~ 오후 6:00");
  });

  it("외박은 양끝에 날짜와 시각을 적는다 — 적은 시각이 그대로 나온다", () => {
    expect(passPeriod(overnight)).toBe("26. 8. 26. 오후 6:00 ~ 26. 8. 28. 오전 9:00");
  });

  it("종료가 자정이어도 그 자정을 그대로 적는다 — 하루를 되돌리지 않는다", () => {
    expect(
      passPeriod({
        type: "OVERNIGHT",
        startAt: new Date("2026-08-26T09:00:00.000Z"),
        endAt: new Date("2026-08-27T15:00:00.000Z"),
      }),
    ).toBe("26. 8. 26. 오후 6:00 ~ 26. 8. 28. 오전 12:00");
  });

  it("같은 날 안에서 끝나는 외박도 날짜를 두 번 적는다 — 유형이 눈금을 정한다", () => {
    expect(
      passPeriod({
        type: "OVERNIGHT",
        startAt: new Date("2026-08-26T09:00:00.000Z"),
        endAt: new Date("2026-08-26T13:00:00.000Z"),
      }),
    ).toBe("26. 8. 26. 오후 6:00 ~ 26. 8. 26. 오후 10:00");
  });
});

describe("passEndLabel", () => {
  it("외출은 시각이 알맹이다", () => {
    expect(passEndLabel(outing)).toBe("오후 6:00");
  });

  it("외박은 날짜와 시각이다 — 연도는 뺀다", () => {
    expect(passEndLabel(overnight)).toBe("8. 28. 오전 9:00");
  });

  it("월말을 넘겨도 적은 날 그대로다", () => {
    expect(
      passEndLabel({
        type: "OVERNIGHT",
        endAt: new Date("2026-08-31T12:00:00.000Z"),
      }),
    ).toBe("8. 31. 오후 9:00");
  });
});

describe("passStatusLabel — 다음 처리 단계", () => {
  it("보호자 확인 전 외박은 보호자 확인 대기다", () => {
    expect(passStatusLabel({ type: "OVERNIGHT", status: "REQUESTED" })).toBe(
      "보호자 확인 대기",
    );
  });

  it("보호자 확인 뒤 외박과 외출 신청은 교사 승인 대기다", () => {
    expect(passStatusLabel({ type: "OVERNIGHT", status: "CONSENTED" })).toBe(
      "교사 승인 대기",
    );
    expect(passStatusLabel({ type: "OUTING", status: "REQUESTED" })).toBe(
      "교사 승인 대기",
    );
  });

  it("결정된 상태와 모르는 상태는 기존 문구를 유지한다", () => {
    expect(passStatusLabel({ type: "OVERNIGHT", status: "APPROVED" })).toBe(
      "승인됨",
    );
    expect(passStatusLabel({ type: "OVERNIGHT", status: "UNKNOWN" })).toBe(
      "UNKNOWN",
    );
  });
});
