import { describe, expect, it } from "vitest";
import {
  groupRecentAwards,
  type RecentAwardEntry,
} from "@/components/merit/recent-feed";

/**
 * 최근 부여를 날짜·부여 단위로 접는 규칙.
 *
 * 이 파일이 있는 이유는 `batchId` 열이 없기 때문이다 — 한 번의 부여를 입력 시각으로
 * 알아내므로, 그 판정이 틀리면 다섯 명에게 한 번 준 것이 다섯 번으로 보이거나
 * 서로 다른 부여가 하나로 합쳐진다. 둘 다 화면은 멀쩡해 보인다.
 */

/** 2026-08-25 17:17 KST. */
const BULK_AT = new Date("2026-08-25T08:17:00.000Z");
/** 같은 날 17:42 KST. */
const LATER_AT = new Date("2026-08-25T08:42:00.000Z");
/** 하루 전 09:00 KST — UTC로는 전날 자정이라 시간대를 틀리면 날짜가 갈린다. */
const YESTERDAY_AT = new Date("2026-08-24T00:00:00.000Z");

/** 화면이 "지금"으로 삼는 시각. 오늘·어제 라벨은 여기서 나온다. */
const NOW = new Date("2026-08-25T09:00:00.000Z");

let seq = 0;

function entry(patch: Partial<RecentAwardEntry> = {}): RecentAwardEntry {
  seq += 1;
  return {
    id: `a-${seq}`,
    kind: "DEMERIT",
    label: "전자기기 미제출",
    points: 10,
    note: null,
    status: "ACTIVE",
    awardedByName: "이정민",
    occurredOn: BULK_AT,
    createdAt: BULK_AT,
    studentProfileId: `sp-${seq}`,
    studentName: `학생${seq}`,
    grade: 1,
    classNo: 1,
    number: seq,
    ...patch,
  };
}

describe("groupRecentAwards", () => {
  it("같은 시각·항목·부여자면 한 번의 부여로 접는다", () => {
    const days = groupRecentAwards([entry(), entry(), entry()], NOW);

    expect(days).toHaveLength(1);
    expect(days[0].batches).toHaveLength(1);
    expect(days[0].batches[0].entries).toHaveLength(3);
  });

  it("항목이 다르면 나눈다 — 같은 순간에 두 번 준 것이다", () => {
    const days = groupRecentAwards(
      [entry({ label: "지각" }), entry({ label: "복장" })],
      NOW,
    );

    expect(days[0].batches).toHaveLength(2);
  });

  it("부여자가 다르면 나눈다", () => {
    const days = groupRecentAwards(
      [entry(), entry({ awardedByName: "박서준" })],
      NOW,
    );

    expect(days[0].batches).toHaveLength(2);
  });

  it("시각이 다르면 나눈다", () => {
    const days = groupRecentAwards([entry({ createdAt: LATER_AT }), entry()], NOW);

    expect(days[0].batches).toHaveLength(2);
  });

  /** 다섯 명 중 한 명만 취소해도 그것은 여전히 한 번의 부여다. */
  it("한 명만 취소돼도 같은 부여로 남는다", () => {
    const days = groupRecentAwards(
      [entry(), entry({ status: "CANCELLED" }), entry()],
      NOW,
    );

    expect(days[0].batches).toHaveLength(1);
    expect(days[0].batches[0].entries.map((e) => e.status)).toEqual([
      "ACTIVE",
      "CANCELLED",
      "ACTIVE",
    ]);
  });

  /**
   * 이어 붙은 줄만 묶는다. 사전으로 모으면 사이에 낀 다른 부여를 건너뛰고
   * 합쳐져, 목록이 입력순이라는 약속이 깨진다.
   */
  it("사이에 다른 부여가 끼면 합치지 않는다", () => {
    const days = groupRecentAwards(
      [
        entry({ createdAt: LATER_AT, label: "지각" }),
        entry({ createdAt: BULK_AT, label: "복장" }),
        entry({ createdAt: LATER_AT, label: "지각" }),
      ],
      NOW,
    );

    expect(days[0].batches.map((b) => b.entries.length)).toEqual([1, 1, 1]);
  });

  it("날짜가 바뀌면 하루를 새로 연다", () => {
    const days = groupRecentAwards([entry(), entry({ createdAt: YESTERDAY_AT })], NOW);

    expect(days.map((d) => d.label)).toEqual(["오늘", "어제"]);
  });

  /**
   * 서버는 UTC로 돈다. 날짜 열쇠를 UTC로 자르면 KST 오전 0~9시 기록이 전날로
   * 밀린다 — 이 기록은 KST로 8월 24일 09:00, UTC로는 8월 24일 00:00이다.
   */
  it("날짜는 KST로 자른다", () => {
    const days = groupRecentAwards([entry({ createdAt: YESTERDAY_AT })], NOW);

    expect(days[0].key).toBe("2026-08-24");
  });

  it("오늘도 어제도 아니면 날짜를 적는다", () => {
    const days = groupRecentAwards(
      [entry({ createdAt: new Date("2026-08-20T08:00:00.000Z") })],
      NOW,
    );

    expect(days[0].label).toBe("8월 20일 (목)");
  });

  it("한 부여 안에서는 학급·번호 순으로 세운다", () => {
    const days = groupRecentAwards(
      [
        entry({ studentName: "다", grade: 2, classNo: 1, number: 1 }),
        entry({ studentName: "가", grade: 1, classNo: 1, number: 9 }),
        entry({ studentName: "나", grade: 1, classNo: 3, number: 2 }),
      ],
      NOW,
    );

    expect(days[0].batches[0].entries.map((e) => e.studentName)).toEqual([
      "가",
      "나",
      "다",
    ]);
  });

  it("반이 없는 학생은 뒤에 서되 사라지지 않는다", () => {
    const days = groupRecentAwards(
      [
        entry({ studentName: "미배정", grade: null, classNo: null, number: null }),
        entry({ studentName: "배정", grade: 3, classNo: 4, number: 20 }),
      ],
      NOW,
    );

    expect(days[0].batches[0].entries.map((e) => e.studentName)).toEqual([
      "배정",
      "미배정",
    ]);
  });

  it("빈 목록은 빈 배열이다", () => {
    expect(groupRecentAwards([], NOW)).toEqual([]);
  });
});
