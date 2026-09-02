import { describe, expect, it } from "vitest";
import { foldClasses } from "@/modules/merit/stats.service";

function rosterRow(
  id: string,
  grade: number | null,
  classNo: number | null,
  totals: { merit?: number; demerit?: number; offset?: number } = {},
) {
  const merit = totals.merit ?? 0;
  const demerit = totals.demerit ?? 0;
  const offset = totals.offset ?? 0;
  return {
    studentProfileId: id,
    studentCode: `CODE-${id}`,
    name: `학생${id}`,
    grade,
    classNo,
    number: 1,
    merit,
    demerit,
    offset,
    net: merit + offset - demerit,
  };
}

describe("foldClasses()", () => {
  it("학생 합계를 반별로 모아 종류별 합계와 순점수를 낸다", () => {
    const [row] = foldClasses([
      rosterRow("sp-1", 2, 3, { merit: 10, demerit: 4 }),
      rosterRow("sp-2", 2, 3, { merit: 2, offset: 3 }),
    ]);

    expect(row).toEqual({
      grade: 2,
      classNo: 3,
      students: 2,
      merit: 12,
      demerit: 4,
      offset: 3,
      net: 11,
      avgNet: 5.5,
    });
  });

  it("기록이 없는 학생도 평균의 분모에 넣고 한 자리에서 반올림한다", () => {
    const [row] = foldClasses([
      rosterRow("sp-1", 1, 1, { merit: 10 }),
      rosterRow("sp-2", 1, 1),
      rosterRow("sp-3", 1, 1),
    ]);

    expect(row.students).toBe(3);
    expect(row.avgNet).toBe(3.3);
  });

  it("기록이 없는 학생만 있는 반도 0점 요약으로 남긴다", () => {
    expect(
      foldClasses([
        rosterRow("sp-1", 1, 1),
        rosterRow("sp-2", 1, 1),
      ]),
    ).toEqual([
      {
        grade: 1,
        classNo: 1,
        students: 2,
        merit: 0,
        demerit: 0,
        offset: 0,
        net: 0,
        avgNet: 0,
      },
    ]);
  });

  it("학년·반 순으로 세운다", () => {
    const rows = foldClasses([
      rosterRow("sp-1", 3, 1),
      rosterRow("sp-2", 1, 2),
      rosterRow("sp-3", 1, 1),
    ]);

    expect(rows.map((row) => `${row.grade}-${row.classNo}`)).toEqual([
      "1-1",
      "1-2",
      "3-1",
    ]);
  });

  it("반 미배정 학생은 반별 표에서만 제외한다", () => {
    const rows = foldClasses([
      rosterRow("sp-assigned", 1, 2, { demerit: 5 }),
      rosterRow("sp-no-grade", null, 2, { demerit: 9 }),
      rosterRow("sp-no-class", 1, null, { demerit: 9 }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ grade: 1, classNo: 2, students: 1, demerit: 5 });
  });

  it("빈 명단은 빈 요약이다", () => {
    expect(foldClasses([])).toEqual([]);
  });
});
