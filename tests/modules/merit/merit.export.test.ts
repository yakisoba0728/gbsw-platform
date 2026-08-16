import { describe, expect, it } from "vitest";
import { toHistorySheet, toRosterSheet } from "@/modules/merit/merit.export";

describe("toRosterSheet", () => {
  const rows = [
    { studentProfileId: "sp-1", studentCode: "K7M2XQ4A", name: "김민준", number: 3, merit: 15, demerit: 6, offset: 0, net: 9 },
    // 상쇄 60점을 받은 학생 — 벌점 72를 덜어내 순점수가 −12로 올라갔다.
    { studentProfileId: "sp-2", studentCode: "B3N8ZR5C", name: "정하윤", number: 4, merit: 0, demerit: 72, offset: 60, net: -12 },
  ];

  it("첫 줄은 조회 범위, 둘째 줄이 머리글이다", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });
    expect(sheet[0]).toEqual(["2026학년도 2학년 3반 · 교내"]);
    expect(sheet[1]).toEqual([
      "번호", "이름", "학생코드", "상점", "벌점", "상쇄", "순점수",
    ]);
  });

  it("기숙사는 학년도 대신 누적임을 적는다 — 같은 숫자가 전혀 다른 뜻이다", () => {
    const sheet = toRosterSheet(rows, { track: "DORM", year: 2026, grade: 2, classNo: 3 });
    expect(sheet[0]).toEqual(["2학년 3반 · 기숙사(누적)"]);
  });

  it("학생 수만큼 줄이 나온다 (범위 + 머리글 + 학생)", () => {
    const sheet = toRosterSheet(rows, { track: "SCHOOL", year: 2026, grade: 2, classNo: 3 });
    expect(sheet).toHaveLength(4);
    expect(sheet[2]).toEqual([3, "김민준", "K7M2XQ4A", 15, 6, 0, 9]);
  });

  it("순점수는 음수도 그대로 숫자로 나간다 — 엑셀에서 계산할 수 있어야 한다", () => {
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
      // 6월 12일에 일어난 일을 6월 15일에 입력했다 — 두 열이 다른 값이어야 한다.
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

  it("발생일과 입력일을 둘 다 낸다 — 시트는 화면을 떠나 돌아다닌다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][1]).toBe("2026. 6. 12.");
    expect(sheet[2][2]).toBe("2026. 6. 15.");
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

  it("취소 안 된 줄의 사유 칸은 빈 문자열이다 — null이면 엑셀에서 깨진다", () => {
    const sheet = toHistorySheet(awards, { track: "SCHOOL", studentName: "김민준" });
    expect(sheet[2][9]).toBe("");
    expect(sheet[2][6]).toBe("학급 청소");
  });

  it("메모가 없으면 빈 문자열이다", () => {
    const sheet = toHistorySheet(awards, { track: "DORM", studentName: "김민준" });
    expect(sheet[3][6]).toBe("");
  });
});
