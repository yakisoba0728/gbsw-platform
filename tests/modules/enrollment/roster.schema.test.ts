import { describe, expect, it } from "vitest";
import {
  MAX_ROSTER_ROWS,
  rosterRowsSchema,
} from "@/modules/enrollment/roster.schema";

function row(over: Record<string, unknown> = {}) {
  return {
    line: 2,
    studentCode: "",
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

  it("이름은 trim하고 NFC로 정규화해서 내보낸다", () => {
    const decomposed = "김동혁";

    const result = rosterRowsSchema.parse([row({ name: `  ${decomposed}  ` })]);

    expect(result[0]!.name).toBe("김동혁");
  });

  it("공백뿐인 이름은 통과하지 못한다", () => {
    const result = rosterRowsSchema.safeParse([row({ name: "   " })]);

    expect(result.success).toBe(false);
  });

  it("실제 달력 날짜가 아닌 생년월일은 통과하지 못한다", () => {
    const result = rosterRowsSchema.safeParse([row({ birthDate: "2010-02-30" })]);

    expect(result.success).toBe(false);
  });

  it("YYYY-MM-DD 정규형이 아닌 생년월일은 통과하지 못한다", () => {
    const result = rosterRowsSchema.safeParse([row({ birthDate: "2010-2-03" })]);

    expect(result.success).toBe(false);
  });

  it("클라이언트가 보낸 errors는 무시하고 빈 배열로 정규화한다", () => {
    const result = rosterRowsSchema.parse([
      row({ errors: ["조작된 오류", "생년월일을 읽을 수 없습니다."] }),
    ]);

    expect(result[0]!.errors).toEqual([]);
  });

  it("errors를 지워도 재학인데 자리가 없는 행은 통과하지 못한다", () => {
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

  it.each(["GRADUATED", "WITHDRAWN", null] as const)(
    "비재학(%s) 행은 조작된 학년·반·번호를 null로 정규화한다",
    (status) => {
      const result = rosterRowsSchema.parse([
        row({ status, grade: 1, classNo: 3, number: 7 }),
      ]);

      expect(result[0]).toMatchObject({
        status,
        grade: null,
        classNo: null,
        number: null,
      });
    },
  );

  it("status:null이고 학년·반·번호가 비면 통과한다", () => {
    const noAssignment = row({
      status: null,
      grade: null,
      classNo: null,
      number: null,
    });

    expect(rosterRowsSchema.safeParse([noAssignment]).success).toBe(true);
  });

  it("status가 목록에 없는 값이면 통과하지 못한다", () => {
    const result = rosterRowsSchema.safeParse([row({ status: "알수없음" })]);
    expect(result.success).toBe(false);
  });

  it("빈 배열은 통과하지 못한다 — 반영할 내용이 없다", () => {
    expect(rosterRowsSchema.safeParse([]).success).toBe(false);
  });

  it("행 상한을 넘으면 통과하지 못한다 — apply 경로의 유일한 크기 방어다", () => {
    const rows = Array.from({ length: MAX_ROSTER_ROWS + 1 }, (_, i) =>
      row({ line: i + 2, name: `학생${i}`, birthDate: "2010-01-01" }),
    );

    expect(rosterRowsSchema.safeParse(rows).success).toBe(false);
  });

  it("행 상한은 통과한다 (경계값)", () => {
    const rows = Array.from({ length: MAX_ROSTER_ROWS }, (_, i) =>
      row({ line: i + 2, name: `학생${i}`, birthDate: "2010-01-01" }),
    );

    expect(rosterRowsSchema.safeParse(rows).success).toBe(true);
  });

  describe("학생코드 — 파서(roster.parse.ts)와 같은 규칙", () => {
    it("비어 있으면 통과한다 — 신규 학생이다", () => {
      expect(rosterRowsSchema.safeParse([row({ studentCode: "" })]).success).toBe(true);
    });

    it("형식이 올바르면 통과한다", () => {
      expect(rosterRowsSchema.safeParse([row({ studentCode: "ABCD2345" })]).success).toBe(true);
    });

    it("errors를 지워도 형식이 어긋난 학생코드는 통과하지 못한다", () => {
      const tampered = row({ studentCode: "1BCD2345", errors: [] });
      expect(rosterRowsSchema.safeParse([tampered]).success).toBe(false);
    });
  });

  describe("학년·반·번호 범위 — 표 편집 경로(enrollment.schema.ts)와 같은 규칙", () => {
    it("errors를 지워도 범위 밖 학년은 통과하지 못한다 — 파서와 이 경계가 어긋나면 안 된다", () => {
      const tampered = row({ grade: 11, errors: [] });
      expect(rosterRowsSchema.safeParse([tampered]).success).toBe(false);
    });

    it("범위 밖 반은 통과하지 못한다", () => {
      const tampered = row({ classNo: 21, errors: [] });
      expect(rosterRowsSchema.safeParse([tampered]).success).toBe(false);
    });

    it("범위 밖 번호는 통과하지 못한다", () => {
      const tampered = row({ number: 51, errors: [] });
      expect(rosterRowsSchema.safeParse([tampered]).success).toBe(false);
    });

    it("경계값(1·3, 1·20, 1·50)은 통과한다", () => {
      expect(
        rosterRowsSchema.safeParse([row({ grade: 1, classNo: 1, number: 1 })]).success,
      ).toBe(true);
      expect(
        rosterRowsSchema.safeParse([row({ grade: 3, classNo: 20, number: 50 })]).success,
      ).toBe(true);
    });
  });
});
