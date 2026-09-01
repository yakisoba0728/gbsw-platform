import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  fileNotices,
  normalizeRows,
  parseCsv,
  parseRoster,
  preflightXlsx,
  XLSX_PREFLIGHT_LIMITS,
} from "@/modules/enrollment/roster.parse";

const HEADER = ["이름", "생년월일", "학년", "반", "번호", "학적"];

describe("parseCsv()", () => {
  it("BOM과 CRLF를 걷어낸다 — 엑셀이 CSV UTF-8로 저장하면 둘 다 붙는다", () => {
    const table = parseCsv('﻿이름,학년\r\n김동혁,1\r\n');
    expect(table).toEqual([["이름", "학년"], ["김동혁", "1"]]);
  });

  it("따옴표 안의 쉼표와 줄바꿈을 필드로 지킨다", () => {
    const table = parseCsv('이름,비고\n"김,동혁","두 줄\n주석"\n');
    expect(table).toEqual([["이름", "비고"], ["김,동혁", "두 줄\n주석"]]);
  });

  it('두 겹 따옴표는 따옴표 한 개다', () => {
    expect(parseCsv('a\n"그는 ""안녕"" 했다"\n')).toEqual([["a"], ['그는 "안녕" 했다']]);
  });

  it("빈 줄도 표에 그대로 담는다 — 걸러내면 뒤 줄의 표 안 위치가 파일과 어긋난다", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], [""], [""], ["b"]]);
  });
});

describe("normalizeRows()", () => {
  it("열 순서가 달라도 머리글로 찾아낸다", () => {
    const rows = normalizeRows([
      ["학적", "번호", "반", "학년", "생년월일", "이름"],
      ["재학", "3", "3", "1", "2010-07-28", "김동혁"],
    ]);
    expect(rows[0]).toMatchObject({
      name: "김동혁",
      birthDate: "2010-07-28",
      grade: 1,
      classNo: 3,
      number: 3,
      status: "ENROLLED",
      errors: [],
    });
  });

  it("머리글이 빠지면 그 사실을 첫 줄 오류로 알린다", () => {
    const rows = normalizeRows([["이름", "학년"], ["김동혁", "1"]]);
    expect(rows[0]!.errors.join()).toContain("생년월일");
  });

  it("엑셀이 날짜를 숫자나 슬래시로 바꿔놔도 받아낸다", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2010/7/28", "1", "3", "3", "재학"],
    ]);
    expect(rows[0]!.birthDate).toBe("2010-07-28");
    expect(rows[0]!.errors).toEqual([]);
  });

  it("형식은 날짜처럼 보여도 실제 달력에 없는 생년월일은 오류다", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2026-02-29", "1", "3", "3", "재학"],
      ["이순신", "2010/4/31", "1", "3", "4", "재학"],
    ]);

    expect(rows[0]!.birthDate).toBe("");
    expect(rows[0]!.errors.join()).toContain("생년월일을 읽을 수 없습니다");
    expect(rows[1]!.birthDate).toBe("");
    expect(rows[1]!.errors.join()).toContain("생년월일을 읽을 수 없습니다");
  });

  it("없는 학적 값은 오류로 잡는다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "휴학"]]);
    expect(rows[0]!.errors.join()).toContain("학적");
  });

  it("셀 값을 NFC로 정규화한다 (I8) — macOS 도구를 거치면 조합형(NFD)이 섞일 수 있다", () => {
    const nfdName = "김동혁".normalize("NFD");
    const rows = normalizeRows([HEADER, [nfdName, "2010-07-28", "1", "3", "3", "재학"]]);

    expect(rows[0]!.name).toBe("김동혁".normalize("NFC"));
    expect(rows[0]!.name).not.toBe(nfdName);
  });

  it("조합형(NFD) 머리글도 NFC로 맞춰 열을 찾고 학생코드 안내를 만들지 않는다", () => {
    const header = ["학생코드", ...HEADER].map((cell) => cell.normalize("NFD"));
    const table = [
      header,
      ["ABCD2345", "김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ];

    expect(normalizeRows(table)[0]).toMatchObject({
      studentCode: "ABCD2345",
      name: "김동혁",
      errors: [],
    });
    expect(fileNotices(table)).toEqual([]);
  });

  it("재학인데 학년·반·번호가 비면 오류다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "재학"]]);
    expect(rows[0]!.errors.length).toBeGreaterThan(0);
  });

  it("졸업이면 학년·반·번호가 비어도 된다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "졸업"]]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.grade).toBeNull();
  });

  describe("재학 줄의 학년·반·번호 범위 (표 편집 경로와 같은 규칙)", () => {
    it("학년이 범위(1~3)를 벗어나면 오류다 — 오타로 11을 넣어도 미리보기가 잡아야 한다", () => {
      const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "11", "3", "3", "재학"]]);
      expect(rows[0]!.errors.join()).toContain("학년은 1~3");
    });

    it("학년이 0이어도 범위 밖이다", () => {
      const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "0", "3", "3", "재학"]]);
      expect(rows[0]!.errors.join()).toContain("학년은 1~3");
    });

    it("반이 범위(1~20)를 벗어나면 오류다", () => {
      const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "21", "3", "재학"]]);
      expect(rows[0]!.errors.join()).toContain("반은 1~20");
    });

    it("번호가 범위(1~50)를 벗어나면 오류다", () => {
      const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "51", "재학"]]);
      expect(rows[0]!.errors.join()).toContain("번호는 1~50");
    });

    it("경계값(1·3, 1·20, 1·50)은 통과한다", () => {
      const low = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "1", "1", "재학"]]);
      const high = normalizeRows([HEADER, ["이순신", "1968-04-28", "3", "20", "50", "재학"]]);
      expect(low[0]!.errors).toEqual([]);
      expect(high[0]!.errors).toEqual([]);
    });

    it("비재학 줄은 범위 검사 대상이 아니다 — grade/classNo/number가 애초에 null이다", () => {
      const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "11", "99", "999", "졸업"]]);
      expect(rows[0]!.errors).toEqual([]);
      expect(rows[0]!.grade).toBeNull();
      expect(rows[0]!.classNo).toBeNull();
      expect(rows[0]!.number).toBeNull();
    });
  });

  it("줄 번호는 파일 기준이다 — 머리글이 1행이므로 첫 학생은 2행", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "재학"]]);
    expect(rows[0]!.line).toBe(2);
  });

  it("이름이 비면 오류이고, 완전히 빈 줄은 아예 버린다", () => {
    const rows = normalizeRows([
      HEADER,
      ["", "", "", "", "", ""],
      ["", "2010-07-28", "1", "3", "3", "재학"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors.join()).toContain("이름");
  });
});

describe("normalizeRows() — 학생코드", () => {
  const HEADER_WITH_CODE = ["학생코드", "이름", "생년월일", "학년", "반", "번호", "학적"];

  it("학생코드 열이 없어도 오류로 잡지 않는다 — 예전 서식·손으로 만든 파일을 계속 받는다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "재학"]]);

    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.studentCode).toBe("");
  });

  it("학생코드 열이 있으면 값을 읽는다", () => {
    const rows = normalizeRows([
      HEADER_WITH_CODE,
      ["ABCD2345", "김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    expect(rows[0]!.studentCode).toBe("ABCD2345");
    expect(rows[0]!.errors).toEqual([]);
  });

  it("비어 있으면 신규로 처리되고 오류가 아니다", () => {
    const rows = normalizeRows([
      HEADER_WITH_CODE,
      ["", "김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    expect(rows[0]!.studentCode).toBe("");
    expect(rows[0]!.errors).toEqual([]);
  });

  it("형식이 어긋나면 오타로 보고 오류로 잡는다", () => {
    const rows = normalizeRows([
      HEADER_WITH_CODE,
      ["1BCD2345", "김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    expect(rows[0]!.errors.join()).toContain("학생코드 형식이 올바르지 않습니다");
  });
});

describe("normalizeRows() — 학적·학년·반·번호가 빈 줄 (Critical 결함 회귀)", () => {
  const HEADER_WITH_CODE = ["학생코드", "이름", "생년월일", "학년", "반", "번호", "학적"];

  it("넷 다 비면 오류가 아니라 status:null로 통과시킨다", () => {
    const rows = normalizeRows([
      HEADER_WITH_CODE,
      ["ABCD2345", "김동혁", "2010-07-28", "", "", "", ""],
    ]);

    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.status).toBeNull();
    expect(rows[0]!.grade).toBeNull();
    expect(rows[0]!.classNo).toBeNull();
    expect(rows[0]!.number).toBeNull();
  });

  it("학생코드가 없어도(신규 서식) 넷 다 비면 마찬가지로 오류가 아니다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", ""]]);

    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.status).toBeNull();
  });

  it("학적만 비고 학년·반·번호는 차 있으면 오류다 — 손댄 흔적이지 진짜 무배정이 아니다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", ""]]);

    expect(rows[0]!.errors.length).toBeGreaterThan(0);
    expect(rows[0]!.errors.join()).toContain("학적");
  });

  it("학적은 있는데 학년·반·번호만 비면(재학) 지금처럼 오류다 — 회귀 방지", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "재학"]]);

    expect(rows[0]!.errors.length).toBeGreaterThan(0);
  });

  it("졸업처럼 학적만 있고 학년·반·번호가 비는 기존 동작은 그대로다", () => {
    const rows = normalizeRows([HEADER, ["김동혁", "2010-07-28", "", "", "", "졸업"]]);

    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.status).toBe("GRADUATED");
  });
});

describe("fileNotices() — 파일 단위 안내 (Important 결함 회귀)", () => {
  it("학생코드 열이 없으면 전 줄을 신규로 처리한다는 안내를 돌려준다", () => {
    const notices = fileNotices([HEADER, ["김동혁", "2010-07-28", "1", "3", "3", "재학"]]);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("학생코드 열이 없어");
  });

  it("학생코드 열이 있으면 안내가 없다", () => {
    const notices = fileNotices([
      ["학생코드", ...HEADER],
      ["ABCD2345", "김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    expect(notices).toHaveLength(0);
  });

  it("빈 파일은 안내도 없다", () => {
    expect(fileNotices([])).toHaveLength(0);
  });
});

describe("parseCsv() + normalizeRows() — 회귀: 빈 줄 뒤 줄 번호", () => {
  it("CSV 중간에 빈 줄이 있어도 뒤 줄의 line이 파일 기준과 같다", () => {
    // 파일 기준 줄 번호: 1행 머리글, 2행 김동혁, 3행 빈 줄, 4행 이순신.
    const csv = [
      HEADER.join(","),
      "김동혁,2010-07-28,1,3,3,재학",
      "",
      "이순신,1968-04-28,1,3,4,재학",
      "",
    ].join("\n");

    const rows = normalizeRows(parseCsv(csv));

    expect(rows.map((r) => r.name)).toEqual(["김동혁", "이순신"]);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
  });
});

function zip(entries: {
  filename: string;
  data: string;
  localFilename?: string;
  centralFilename?: string;
  includeInCentral?: boolean;
  localCompressedSizeOverride?: number;
  centralCompressedSizeOverride?: number;
  localUncompressedSizeOverride?: number;
  uncompressedSizeOverride?: number;
}[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const localFilename = Buffer.from(entry.localFilename ?? entry.filename);
    const centralFilename = Buffer.from(entry.centralFilename ?? entry.filename);
    const raw = Buffer.from(entry.data);
    const compressed = deflateRawSync(raw);
    const localHeaderOffset = offset;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(
      entry.localCompressedSizeOverride ?? compressed.length,
      18,
    );
    localHeader.writeUInt32LE(entry.localUncompressedSizeOverride ?? raw.length, 22);
    localHeader.writeUInt16LE(localFilename.length, 26);
    localParts.push(localHeader, localFilename, compressed);
    offset += localHeader.length + localFilename.length + compressed.length;

    if (entry.includeInCentral === false) continue;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(
      entry.centralCompressedSizeOverride ?? compressed.length,
      20,
    );
    centralHeader.writeUInt32LE(
      entry.uncompressedSizeOverride ?? raw.length,
      24,
    );
    centralHeader.writeUInt16LE(centralFilename.length, 28);
    centralHeader.writeUInt32LE(localHeaderOffset, 42);
    centralParts.push(centralHeader, centralFilename);
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;
  const centralEntryCount = centralParts.length / 2;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centralEntryCount, 8);
  eocd.writeUInt16LE(centralEntryCount, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

describe("preflightXlsx()", () => {
  it("중앙 디렉터리가 없으면 xlsx를 거부한다", () => {
    expect(() => preflightXlsx(Buffer.from("not a zip"))).toThrow("XLSX_ZIP_INVALID");
  });

  it("압축 해제 크기가 상한을 넘으면 zip bomb으로 거부한다", () => {
    const buffer = zip([
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData /></worksheet>",
        uncompressedSizeOverride: XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes + 1,
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_BOMB");
  });

  it("sharedStrings.xml의 실제 압축 해제 크기도 bounded inflate로 검사한다", () => {
    const buffer = zip([
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>",
      },
      {
        filename: "xl/sharedStrings.xml",
        data: "x".repeat(XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes + 1),
        localUncompressedSizeOverride: 1,
        uncompressedSizeOverride: 1,
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_BOMB");
  });

  it("central 디렉터리와 local header의 파일명이 다르면 거부한다", () => {
    const buffer = zip([
      {
        filename: "xl/worksheets/sheet1.xml",
        localFilename: "xl/sharedStrings.xml",
        data: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>",
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_INVALID");
  });

  it("central 디렉터리에 없는 local entry가 앞에 숨어 있으면 거부한다", () => {
    const buffer = zip([
      {
        filename: "xl/sharedStrings.xml",
        data: "x".repeat(XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes + 1),
        includeInCentral: false,
      },
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>",
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_INVALID");
  });

  it("central 디렉터리와 local header의 크기가 다르면 거부한다", () => {
    const buffer = zip([
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>",
        localUncompressedSizeOverride: 1,
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_INVALID");
  });

  it("같은 경로가 두 번 나오면 ambiguous xlsx로 보고 거부한다", () => {
    const buffer = zip([
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData><row r=\"1\"/></sheetData></worksheet>",
      },
      {
        filename: "xl/worksheets/sheet1.xml",
        data: "<worksheet><sheetData><row r=\"2\"/></sheetData></worksheet>",
      },
    ]);

    expect(() => preflightXlsx(buffer)).toThrow("XLSX_ZIP_INVALID");
  });

  it("워크시트 행이 2000개를 넘으면 비싼 xlsx 파서 전에 거부한다", async () => {
    const rows = Array.from(
      { length: XLSX_PREFLIGHT_LIMITS.maxSheetRows + 1 },
      (_, i) => `<row r="${i + 1}"/>`,
    ).join("");
    const buffer = zip([
      { filename: "xl/worksheets/sheet1.xml", data: `<worksheet><sheetData>${rows}</sheetData></worksheet>` },
    ]);

    await expect(parseRoster({ filename: "too-many.xlsx", buffer })).rejects.toThrow(
      "TOO_MANY_ROWS",
    );
  });
});
