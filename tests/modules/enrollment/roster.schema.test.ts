import { describe, expect, it } from "vitest";
import { rosterRowsSchema } from "@/modules/enrollment/roster.schema";

function row(over: Record<string, unknown> = {}) {
  return {
    line: 2,
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    errors: [],
    ...over,
  };
}

describe("rosterRowsSchema", () => {
  it("실제 파서가 만드는 정상 행을 통과시킨다", () => {
    const result = rosterRowsSchema.safeParse([row()]);
    expect(result.success).toBe(true);
  });

  it("errors를 지워도 재학인데 자리가 없는 행은 통과하지 못한다 (I3) — " +
    "설계서가 오류로 잡기로 한 상태가 그대로 저장되는 걸 경계에서 막는다", () => {
    const tampered = row({ grade: null, classNo: null, number: null, errors: [] });

    const result = rosterRowsSchema.safeParse([tampered]);
    expect(result.success).toBe(false);
  });

  it("비재학이면 학년·반·번호가 비어도 통과한다 — 원래 정상 상태다", () => {
    const graduated = row({
      status: "GRADUATED",
      grade: null,
      classNo: null,
      number: null,
    });

    expect(rosterRowsSchema.safeParse([graduated]).success).toBe(true);
  });

  it("status가 목록에 없는 값이면 통과하지 못한다", () => {
    const result = rosterRowsSchema.safeParse([row({ status: "알수없음" })]);
    expect(result.success).toBe(false);
  });

  it("빈 배열은 통과하지 못한다 — 반영할 내용이 없다", () => {
    expect(rosterRowsSchema.safeParse([]).success).toBe(false);
  });

  it("2000행을 넘으면 통과하지 못한다 — apply 경로의 유일한 크기 방어다", () => {
    const rows = Array.from({ length: 2001 }, (_, i) =>
      row({ line: i + 2, name: `학생${i}`, birthDate: "2010-01-01" }),
    );

    expect(rosterRowsSchema.safeParse(rows).success).toBe(false);
  });

  it("2000행은 통과한다 (경계값)", () => {
    const rows = Array.from({ length: 2000 }, (_, i) =>
      row({ line: i + 2, name: `학생${i}`, birthDate: "2010-01-01" }),
    );

    expect(rosterRowsSchema.safeParse(rows).success).toBe(true);
  });
});
