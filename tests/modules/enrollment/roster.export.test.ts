import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";
import { toStyledSheetData } from "@/lib/xlsx-sheet";
import {
  buildExportRows,
  ROSTER_COLUMN_WIDTHS,
  ROSTER_COLUMNS,
  ROSTER_INFO_COLUMNS,
  type ExportStudent,
} from "@/modules/enrollment/roster.export";
import { parseRoster } from "@/modules/enrollment/roster.parse";
import { planRoster, type ExistingStudent } from "@/modules/enrollment/roster.plan";

function student(overrides: Partial<ExportStudent> = {}): ExportStudent {
  return {
    studentCode: "CE74CQXT",
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    entryClassNo: 3,
    entryNumber: 3,
    ...overrides,
  };
}

describe("buildExportRows()", () => {
  it("머리글이 ROSTER_COLUMNS 순서와 정확히 같다 — 파서가 그 순서로 읽는다", () => {
    const [header] = buildExportRows([]);
    expect(header!.slice(0, ROSTER_COLUMNS.length)).toEqual([...ROSTER_COLUMNS]);
  });

  it("참고 열(입학반·입학번호)이 머리글 마지막에 붙는다", () => {
    const [header] = buildExportRows([]);
    expect(header).toEqual([...ROSTER_COLUMNS, ...ROSTER_INFO_COLUMNS]);
  });

  it("학적을 한글 라벨로 되돌린다", () => {
    const rows = buildExportRows([
      student({ status: "ENROLLED" }),
      student({ studentCode: "BCDF2345", status: "GRADUATED", grade: null, classNo: null, number: null }),
    ]);
    expect(rows[1]![6]).toBe("재학");
    expect(rows[2]![6]).toBe("졸업");
  });

  it("그 학년도 배정이 없는 학생은 학년·반·번호·학적을 빈 칸으로 둔다", () => {
    const rows = buildExportRows([
      student({ status: null, grade: null, classNo: null, number: null }),
    ]);
    expect(rows[1]).toEqual(["CE74CQXT", "김동혁", "2010-07-28", null, null, null, "", 3, 3]);
  });

  it("학생마다 한 줄, 참고 열까지 포함해 값을 그대로 옮긴다", () => {
    const rows = buildExportRows([student({ entryClassNo: 5, entryNumber: 12 })]);
    expect(rows[1]).toEqual(["CE74CQXT", "김동혁", "2010-07-28", 1, 3, 3, "재학", 5, 12]);
  });
});

describe("왕복: 내보내기 → xlsx 바이트 → 파서 → 분류", () => {
  const 재학생: ExistingStudent = {
    studentProfileId: "sp-1",
    userId: "u-1",
    studentCode: "CE74CQXT",
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    hasGraduatedEnrollment: false,
    accountActive: true,
    removed: false,
  };

  async function exportAndReparse(existing: ExistingStudent[]) {
    const exportable: ExportStudent[] = existing.map((s) => ({
      ...s,
      entryClassNo: s.classNo,
      entryNumber: s.number,
    }));
    const rows = buildExportRows(exportable);
    const sheetData = toStyledSheetData(rows, {
      infoColumnCount: ROSTER_INFO_COLUMNS.length,
    });
    const buffer = await writeXlsxFile(sheetData, {
      columns: ROSTER_COLUMN_WIDTHS.map((width) => ({ width })),
      stickyRowsCount: 1,
    }).toBuffer();

    const { rows: parsed } = await parseRoster({ filename: "roundtrip.xlsx", buffer });
    return planRoster(parsed, existing);
  }

  it("고치지 않고 그대로 올리면 모든 분류가 0건이다", async () => {
    const plan = await exportAndReparse([재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(0);
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.newAssignment).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.errorRows).toHaveLength(0);
    expect(plan.missingFromFile).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("배정이 없는 학생(졸업 등)을 내려받아 그대로 올리면 변경 0건이다 — Critical 회귀", async () => {
    const 배정없는학생: ExistingStudent = {
      studentProfileId: "sp-2",
      userId: "u-2",
      studentCode: "BCDF2345",
      name: "이순신",
      birthDate: "1968-04-28",
      grade: null,
      classNo: null,
      number: null,
      status: null,
      hasGraduatedEnrollment: false,
      accountActive: false,
      removed: false,
    };

    const plan = await exportAndReparse([재학생, 배정없는학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(0);
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.newAssignment).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.errorRows).toHaveLength(0);
    expect(plan.missingFromFile).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("여러 학생 중 일부만 배정이 없어도 왕복에서 나머지 반영은 그대로 0건이다", async () => {
    const 배정없는학생: ExistingStudent = {
      studentProfileId: "sp-2",
      userId: "u-2",
      studentCode: "BCDF2345",
      name: "이순신",
      birthDate: "1968-04-28",
      grade: null,
      classNo: null,
      number: null,
      status: null,
      hasGraduatedEnrollment: false,
      accountActive: false,
      removed: false,
    };
    const 다른재학생: ExistingStudent = {
      studentProfileId: "sp-3",
      userId: "u-3",
      studentCode: "CDEF2345",
      name: "강감찬",
      birthDate: "2009-12-01",
      grade: 3,
      classNo: 2,
      number: 15,
      status: "ENROLLED",
      hasGraduatedEnrollment: false,
      accountActive: true,
      removed: false,
    };

    const plan = await exportAndReparse([재학생, 배정없는학생, 다른재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.errorRows).toHaveLength(0);
    expect(plan.missingFromFile).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("반을 5로 고쳐 올리면 재배정 1건이다", async () => {
    const exportable: ExportStudent[] = [
      { ...재학생, classNo: 5, entryClassNo: 재학생.classNo, entryNumber: 재학생.number },
    ];
    const rows = buildExportRows(exportable);
    const sheetData = toStyledSheetData(rows, {
      infoColumnCount: ROSTER_INFO_COLUMNS.length,
    });
    const buffer = await writeXlsxFile(sheetData, {
      columns: ROSTER_COLUMN_WIDTHS.map((width) => ({ width })),
      stickyRowsCount: 1,
    }).toBuffer();

    const { rows: parsed } = await parseRoster({ filename: "roundtrip.xlsx", buffer });
    const plan = planRoster(parsed, [재학생]);

    expect(plan.reassign).toHaveLength(1);
    expect(plan.reassign[0]!.classNo).toBe(5);
    expect(plan.newStudents).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("학생코드를 지우고 올리면 신규가 아니라 확인 필요로 간다", async () => {
    const rows = buildExportRows([
      { ...재학생, studentCode: "", entryClassNo: 재학생.classNo, entryNumber: 재학생.number },
    ]);
    const sheetData = toStyledSheetData(rows, {
      infoColumnCount: ROSTER_INFO_COLUMNS.length,
    });
    const buffer = await writeXlsxFile(sheetData, {
      columns: ROSTER_COLUMN_WIDTHS.map((width) => ({ width })),
      stickyRowsCount: 1,
    }).toBuffer();

    const { rows: parsed } = await parseRoster({ filename: "roundtrip.xlsx", buffer });
    const plan = planRoster(parsed, [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.reason).toContain("이름·생년월일이 같은 기존 학생이 있습니다");
    expect(plan.missingFromFile).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(true);
  });

  it("엑셀이 학생코드를 수로 바꾸지 않는다 — 문자열로 강제해서 지수 표기가 안 생긴다", async () => {
    const plan = await exportAndReparse([재학생]);
    expect(plan.newStudents).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(0);
  });
});
