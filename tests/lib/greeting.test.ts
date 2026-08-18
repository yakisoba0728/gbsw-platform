import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/greeting";

/** `+09:00`으로 적은 시각의 KST 시(hour)가 곧 경계다. */
function at(hour: number, minute = 0): Date {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`2026-08-18T${hh}:${mm}:00+09:00`);
}

describe("greetingFor", () => {
  it("경계마다 문구가 바뀐다", () => {
    expect(greetingFor(at(0))).toBe("이른 시간입니다");
    expect(greetingFor(at(5, 59))).toBe("이른 시간입니다");
    expect(greetingFor(at(6))).toBe("좋은 아침입니다");
    expect(greetingFor(at(11, 59))).toBe("좋은 아침입니다");
    expect(greetingFor(at(12))).toBe("좋은 오후입니다");
    expect(greetingFor(at(17, 59))).toBe("좋은 오후입니다");
    expect(greetingFor(at(18))).toBe("좋은 저녁입니다");
    expect(greetingFor(at(21, 59))).toBe("좋은 저녁입니다");
    expect(greetingFor(at(22))).toBe("늦은 시간입니다");
    expect(greetingFor(at(23, 59))).toBe("늦은 시간입니다");
  });

  it("새벽과 밤은 다른 문구다 — 자정을 넘어도 같은 말을 하지 않는다", () => {
    expect(greetingFor(at(23))).not.toBe(greetingFor(at(1)));
  });

  // 컨테이너는 UTC로 돈다. 이 검사가 없으면 한국 아침 8시에 밤 인사가 나간다.
  it("서버 시간대가 아니라 KST를 본다", () => {
    // UTC 23:00 = KST 다음 날 08:00
    expect(greetingFor(new Date("2026-08-17T23:00:00Z"))).toBe("좋은 아침입니다");
    // UTC 09:00 = KST 18:00
    expect(greetingFor(new Date("2026-08-18T09:00:00Z"))).toBe("좋은 저녁입니다");
  });
});
