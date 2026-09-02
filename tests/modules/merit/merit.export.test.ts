import { describe, expect, it } from "vitest";
import {
  HISTORY_SHEET_WIDTHS,
  HISTORY_SHEET_WRAP,
  RECENT_SHEET_WIDTHS,
  RECENT_SHEET_WRAP,
  ROSTER_SHEET_WIDTHS,
  toHistorySheet,
  toRecentAwardsSheet,
  toRosterSheet,
} from "@/modules/merit/merit.export";

describe("toRosterSheet", () => {
  const rows = [
    { studentProfileId: "sp-1", studentCode: "K7M2XQ4A", name: "김민준", number: 3, merit: 15, demerit: 6, offset: 0, net: 9 },
    { studentProfileId: "sp-2", studentCode: "B3N8ZR5C", name: "정하윤", number: 4, merit: 0, demerit: 72, offset: 60, net: -12 },
  ];

  it("첫 줄은 조회 범위, 둘째 줄이 머리글이다", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });
    expect(sheet[0]).toEqual(["2026학년도 2학년 3반 · 교내"]);
    expect(sheet[1]).toEqual([
      "번호", "이름", "학생코드", "상점", "벌점", "상쇄", "순점수",
    ]);
  });

  it("기숙사는 학년도 대신 누적임을 적는다", () => {
    const sheet = toRosterSheet(rows, { track: "DORM", year: 2026, grade: 2, classNo: 3 });
    expect(sheet[0]).toEqual(["2학년 3반 · 기숙사(누적)"]);
  });

  it("학생 수만큼 줄이 나온다 (범위 + 머리글 + 학생)", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });
    expect(sheet).toHaveLength(4);
    expect(sheet[2]).toEqual([3, "김민준", "K7M2XQ4A", 15, 6, 0, 9]);
  });

  it("순점수는 음수도 그대로 숫자로 나간다", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });
    expect(sheet[3][6]).toBe(-12);
  });

  it("상쇄 열이 항상 있고, 상점 + 상쇄 − 벌점이 순점수와 맞는다", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });

    for (const row of sheet.slice(2)) {
      const [, , , merit, demerit, offset, net] = row as number[];
      expect(merit + offset - demerit).toBe(net);
    }
  });

  it("빈 명단이어도 범위와 머리글은 나온다", () => {
    const sheet = toRosterSheet([], { track: "DORM", year: 2026, grade: 1, classNo: 1 });
    expect(sheet).toHaveLength(2);
  });
});

describe("toHistorySheet", () => {
  const awards = [
    {
      id: "a-1",
      year: 2026,
      kind: "MERIT",
      label: "교내 봉사활동 우수 참여",
      points: 5,
      note: "학급 청소",
      awardedByName: "이정민",
      status: "ACTIVE",
      cancelledByName: null,
      cancelledAt: null,
      cancelReason: null,
      occurredOn: new Date("2026-06-11T15:00:00.000Z"),
      createdAt: new Date("2026-06-15T04:30:00.000Z"),
    },
    {
      id: "a-2",
      year: 2026,
      kind: "DEMERIT",
      label: "복장 불량",
      points: 3,
      note: null,
      awardedByName: "박서연",
      status: "CANCELLED",
      cancelledByName: "이정민",
      cancelledAt: new Date("2026-06-16T04:30:00.000Z"),
      cancelReason: "오기입",
      occurredOn: new Date("2026-05-27T15:00:00.000Z"),
      createdAt: new Date("2026-05-28T04:30:00.000Z"),
    },
  ];

  it("첫 줄은 누구의 무엇인지, 둘째 줄이 머리글이다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[0]).toEqual(["김민준 · 교내 상벌점"]);
    expect(sheet[1]).toEqual([
      "학년도", "발생일", "입력일", "구분", "항목", "점수", "메모", "부여자", "상태", "취소사유",
    ]);
  });

  it("발생일과 입력일을 둘 다 낸다 — 글자순이 곧 날짜순인 형태로", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][1]).toBe("2026-06-12");
    expect(sheet[2][2]).toBe("2026-06-15");
  });

  it("벌점은 음수로 낸다 — 열을 그대로 더할 수 있어야 한다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][5]).toBe(5);
    expect(sheet[3][5]).toBe(-3);
  });

  it("모르는 종류는 점수를 그대로 둔다 — 0으로 접으면 그 줄이 사라진다", () => {
    const odd = [{ ...awards[0]!, kind: "MYSTERY", points: 7 }];
    const sheet = toHistorySheet(odd, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][5]).toBe(7);
  });

  it("상점·벌점을 한글로 옮긴다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][3]).toBe("상점");
    expect(sheet[3][3]).toBe("벌점");
  });

  it("취소된 줄은 상태와 사유가 채워진다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[3][8]).toBe("취소");
    expect(sheet[3][9]).toBe("오기입");
  });

  it("취소 안 된 줄의 사유 칸은 빈 문자열이다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][9]).toBe("");
    expect(sheet[2][6]).toBe("학급 청소");
  });

  it("메모가 없으면 빈 문자열이다", () => {
    const sheet = toHistorySheet(awards, { track: "DORM", studentName: "김민준" });
    expect(sheet[3][6]).toBe("");
  });
});

describe("toRecentAwardsSheet", () => {
  const awards = [
    {
      year: 2026,
      studentName: "김민준",
      kind: "DEMERIT",
      label: "점호 지각",
      points: 3,
      note: "22시 점호",
      awardedByName: "이정민",
      status: "CANCELLED",
      cancelledByName: "박서연",
      cancelledAt: new Date("2026-08-19T03:00:00.000Z"),
      cancelReason: "오기입",
      occurredOn: new Date("2026-08-18T15:00:00.000Z"),
      createdAt: new Date("2026-08-19T01:00:00.000Z"),
    },
  ];

  it("첫 줄에 현재 필터를 적고 둘째 줄에 머리글을 둔다", () => {
    const sheet = toRecentAwardsSheet(awards, {
      track: "DORM",
      kind: "DEMERIT",
      status: "CANCELLED",
      q: "점호",
    });

    expect(sheet[0][0]).toBe("기숙사 최근 부여 · 벌점 · 취소 · 검색: 점호");
    expect(sheet[1]).toContain("학생");
    expect(sheet[1]).toContain("취소 사유");
  });

  it("벌점은 음수, 시각은 글자순이 곧 시각순인 형태다", () => {
    const sheet = toRecentAwardsSheet(awards, { track: "DORM" });

    expect(sheet[2][1]).toBe("2026-08-19 10:00:00");
    expect(sheet[2][2]).toBe("2026-08-19");
    expect(sheet[2][6]).toBe(-3);
    expect(sheet[2][11]).toBe("2026-08-19 12:00:00");
  });

  it("학생·메모·취소 정보를 빠뜨리지 않는다", () => {
    const sheet = toRecentAwardsSheet(awards, { track: "DORM" });

    expect(sheet[2]).toContain("김민준");
    expect(sheet[2]).toContain("22시 점호");
    expect(sheet[2]).toContain("박서연");
    expect(sheet[2]).toContain("오기입");
  });
});

describe("열 너비표", () => {
  it.each([
    ["반별 목록", ROSTER_SHEET_WIDTHS, toRosterSheet([], { track: "SCHOOL", year: 2026, grade: 1, classNo: 1 })],
    ["학생 내역", HISTORY_SHEET_WIDTHS, toHistorySheet([], { track: "SCHOOL", studentName: "김민준" })],
    ["최근 부여", RECENT_SHEET_WIDTHS, toRecentAwardsSheet([], { track: "SCHOOL" })],
  ])("%s의 너비 수가 머리글 수와 같다", (_name, widths, sheet) => {
    expect(widths).toHaveLength(sheet[1]!.length);
    expect(widths.every((w) => w > 0)).toBe(true);
  });

  it("접는 열은 두 시트 모두 「항목」이다", () => {
    const history = toHistorySheet([], { track: "SCHOOL", studentName: "김민준" });
    const recent = toRecentAwardsSheet([], { track: "SCHOOL" });
    expect(HISTORY_SHEET_WRAP.map((i) => history[1]![i])).toEqual(["항목"]);
    expect(RECENT_SHEET_WRAP.map((i) => recent[1]![i])).toEqual(["항목"]);
  });
});
