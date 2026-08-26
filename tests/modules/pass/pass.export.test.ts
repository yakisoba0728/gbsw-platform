import { describe, expect, it } from "vitest";
import {
  PASS_HISTORY_SHEET_WIDTHS,
  PASS_HISTORY_SHEET_WRAP,
  toPassHistorySheet,
  type PassHistoryExportRow,
} from "@/modules/pass/pass.export";
import { passHistoryRange } from "@/modules/pass/pass.schema";

/** 조회 창 — 시트 첫 줄에 적히고 파일 이름에도 쓰인다. */
const RANGE = passHistoryRange({ from: "2026-08-01", to: "2026-08-26" });

/** 2026-08-26 14:00 ~ 18:00 KST. 외출은 시각이 알맹이다. */
const outing: PassHistoryExportRow = {
  type: "OUTING",
  status: "APPROVED",
  grade: 2,
  classNo: 3,
  number: 5,
  studentName: "김민준",
  startAt: new Date("2026-08-26T05:00:00.000Z"),
  endAt: new Date("2026-08-26T09:00:00.000Z"),
  destination: "치과",
  reason: "정기 검진",
  requestedByName: "김민준",
  consentedByName: null,
  consentedAt: null,
  consentByProxy: false,
  consentNote: null,
  decidedByName: "이정민",
  decidedAt: new Date("2026-08-26T01:00:00.000Z"),
  decisionNote: null,
  cancelledByName: null,
  cancelledAt: null,
  cancelReason: null,
};

/**
 * 8/26 자정 ~ 8/28 자정 = 8월 26·27일 이틀 밤.
 * `endAt`을 그대로 적으면 종료가 8/28이 되어 하루 밀린다.
 */
const overnight: PassHistoryExportRow = {
  type: "OVERNIGHT",
  status: "APPROVED",
  grade: 1,
  classNo: 1,
  number: 12,
  studentName: "정하윤",
  startAt: new Date("2026-08-25T15:00:00.000Z"),
  endAt: new Date("2026-08-27T15:00:00.000Z"),
  destination: "본가",
  reason: "가족 행사",
  requestedByName: "정하윤",
  consentedByName: "박서연",
  consentedAt: new Date("2026-08-24T02:00:00.000Z"),
  consentByProxy: false,
  consentNote: null,
  decidedByName: "이정민",
  decidedAt: new Date("2026-08-24T03:00:00.000Z"),
  decisionNote: null,
  cancelledByName: null,
  cancelledAt: null,
  cancelReason: null,
};

/** 머리글 이름으로 열을 집는다 — 열이 늘거나 자리가 바뀌어도 검증이 안 어긋난다. */
function column(sheet: (string | number)[][], header: string): number {
  const index = sheet[1]!.indexOf(header);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

describe("toPassHistorySheet", () => {
  it("첫 줄은 조회 범위, 둘째 줄이 머리글이다", () => {
    const sheet = toPassHistorySheet([outing], {}, RANGE);

    expect(sheet[0]).toEqual([
      "출입증 전체 내역 · 2026-08-01 ~ 2026-08-26 · 전체 유형 · 전체 상태",
    ]);
    expect(sheet[1]).toEqual([
      "유형",
      "상태",
      "학년",
      "반",
      "번호",
      "학번",
      "이름",
      "시작",
      "종료",
      "행선지",
      "사유",
      "신청자",
      "보호자확인",
      "결재자",
      "결재시각",
      "비고",
    ]);
  });

  it("상한이 열려 있으면 끝을 「이후」로 적는다 — 오늘까지로 읽히면 안 된다", () => {
    const sheet = toPassHistorySheet([], {}, passHistoryRange({ from: "2026-08-01" }));
    expect(sheet[0]![0]).toBe(
      "출입증 전체 내역 · 2026-08-01 ~ 이후 · 전체 유형 · 전체 상태",
    );
  });

  it("고른 조건을 첫 줄에 그대로 남긴다", () => {
    const sheet = toPassHistorySheet(
      [],
      { type: "OVERNIGHT", status: "REJECTED", q: "2305" },
      RANGE,
    );
    expect(sheet[0]![0]).toBe(
      "출입증 전체 내역 · 2026-08-01 ~ 2026-08-26 · 외박 · 반려됨 · 검색: 2305",
    );
  });

  /**
   * **이 파일이 있는 이유다.** 외박의 `endAt`은 종료일 다음 날 자정이라
   * 그대로 적으면 8/27까지 나간 학생이 8/28까지로 읽힌다.
   */
  it("외박의 종료는 마지막 밤이다 — 하루 밀리지 않는다", () => {
    const sheet = toPassHistorySheet([overnight], {}, RANGE);
    const row = sheet[2]!;

    expect(row[column(sheet, "시작")]).toBe("2026-08-26");
    expect(row[column(sheet, "종료")]).toBe("2026-08-27");
  });

  it("월말을 넘겨도 하루가 밀리지 않는다", () => {
    const sheet = toPassHistorySheet(
      // 8/31 자정 ~ 9/1 자정 = 8월 31일 하룻밤.
      [
        {
          ...overnight,
          startAt: new Date("2026-08-30T15:00:00.000Z"),
          endAt: new Date("2026-08-31T15:00:00.000Z"),
        },
      ],
      {},
      RANGE,
    );

    expect(sheet[2]![column(sheet, "종료")]).toBe("2026-08-31");
  });

  it("외출은 시각까지 적고 글자순이 곧 시각순이다", () => {
    const sheet = toPassHistorySheet([outing], {}, RANGE);
    const row = sheet[2]!;

    expect(row[column(sheet, "시작")]).toBe("2026-08-26 14:00:00");
    expect(row[column(sheet, "종료")]).toBe("2026-08-26 18:00:00");
    expect(row[column(sheet, "결재시각")]).toBe("2026-08-26 10:00:00");
  });

  it("유형·상태를 한글로 옮긴다", () => {
    const sheet = toPassHistorySheet([outing, overnight], {}, RANGE);

    expect(sheet[2]![column(sheet, "유형")]).toBe("외출");
    expect(sheet[3]![column(sheet, "유형")]).toBe("외박");
    expect(sheet[2]![column(sheet, "상태")]).toBe("승인됨");
  });

  it("학년·반·번호는 수로, 학번은 글자로 낸다", () => {
    const sheet = toPassHistorySheet([outing], {}, RANGE);
    const row = sheet[2]!;

    expect(row[column(sheet, "학년")]).toBe(2);
    expect(row[column(sheet, "반")]).toBe(3);
    expect(row[column(sheet, "번호")]).toBe(5);
    // 앞자리가 뜻을 갖는 글자다 — 수로 내면 엑셀이 지수 표기로 접을 수 있다.
    expect(row[column(sheet, "학번")]).toBe("2305");
  });

  it("배정이 없으면 학급 칸은 빈 문자열이다 — null을 내보내지 않는다", () => {
    const sheet = toPassHistorySheet(
      [{ ...outing, grade: null, classNo: null, number: null }],
      {},
      RANGE,
    );
    const row = sheet[2]!;

    expect(row[column(sheet, "학년")]).toBe("");
    expect(row[column(sheet, "학번")]).toBe("");
    expect(row.every((cell) => cell !== null && cell !== undefined)).toBe(true);
  });

  it("보호자 확인은 대행 여부가 이름보다 먼저 읽힌다", () => {
    const proxy = toPassHistorySheet(
      [{ ...overnight, consentByProxy: true, consentedByName: "이정민", consentNote: "전화 확인" }],
      {},
      RANGE,
    );
    expect(proxy[2]![column(proxy, "보호자확인")]).toBe("대행 · 이정민 · 전화 확인");

    const direct = toPassHistorySheet([overnight], {}, RANGE);
    expect(direct[2]![column(direct, "보호자확인")]).toBe("박서연");

    // 외출은 보호자 확인이 없다.
    const none = toPassHistorySheet([outing], {}, RANGE);
    expect(none[2]![column(none, "보호자확인")]).toBe("");
  });

  it("반려·취소 사유는 비고 한 칸에 모인다", () => {
    const rejected = toPassHistorySheet(
      [{ ...outing, status: "REJECTED", decisionNote: "기간이 너무 깁니다" }],
      {},
      RANGE,
    );
    expect(rejected[2]![column(rejected, "비고")]).toBe("반려 사유 · 기간이 너무 깁니다");

    const cancelled = toPassHistorySheet(
      [{ ...outing, status: "CANCELLED", cancelReason: "학부모 요청" }],
      {},
      RANGE,
    );
    expect(cancelled[2]![column(cancelled, "비고")]).toBe("취소 사유 · 학부모 요청");
  });

  it("사유 없는 학생 철회도 비고에 취소로 남는다 — 빈 칸이 아니다", () => {
    const sheet = toPassHistorySheet(
      [{ ...outing, status: "CANCELLED", cancelReason: null }],
      {},
      RANGE,
    );
    expect(sheet[2]![column(sheet, "비고")]).toBe("취소");
  });

  it("결재 전이면 결재자·결재시각이 빈 칸이다", () => {
    const sheet = toPassHistorySheet(
      [{ ...outing, status: "REQUESTED", decidedByName: null, decidedAt: null }],
      {},
      RANGE,
    );
    const row = sheet[2]!;

    expect(row[column(sheet, "결재자")]).toBe("");
    expect(row[column(sheet, "결재시각")]).toBe("");
  });

  it("빈 결과여도 범위와 머리글은 나온다", () => {
    expect(toPassHistorySheet([], {}, RANGE)).toHaveLength(2);
  });
});

describe("열 너비표", () => {
  /**
   * 너비를 빠뜨린 열은 엑셀 기본 너비(8.43자)로 열려 한글이 옆 칸을 덮어쓴다.
   * 머리글이 늘었는데 표를 안 고치면 여기서 먼저 깨진다.
   */
  it("너비 수가 머리글 수와 같다", () => {
    const sheet = toPassHistorySheet([], {}, RANGE);
    expect(PASS_HISTORY_SHEET_WIDTHS).toHaveLength(sheet[1]!.length);
    expect(PASS_HISTORY_SHEET_WIDTHS.every((width) => width > 0)).toBe(true);
  });

  /** 접을 열을 잘못 짚으면 엉뚱한 열이 두 줄이 된다. */
  it("접는 열은 행선지 · 사유 · 비고다", () => {
    const sheet = toPassHistorySheet([], {}, RANGE);
    expect(PASS_HISTORY_SHEET_WRAP.map((i) => sheet[1]![i])).toEqual([
      "행선지",
      "사유",
      "비고",
    ]);
  });
});
