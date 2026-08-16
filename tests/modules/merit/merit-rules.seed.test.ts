import { describe, expect, it } from "vitest";
import {
  DORM_RULES,
  MERIT_RULE_SEED,
  SCHOOL_RULES,
} from "@/../prisma/seed/merit-rules.data";
import { MERIT_KINDS, MERIT_TRACKS } from "@/core/authz/merit-track";

/**
 * 학교 규정표를 손으로 옮긴 데이터라, 가장 큰 위험은 **줄을 빠뜨리는 것**이다.
 * 개수 단언이 그걸 잡는다 — 원본 표를 세어 나온 값이며, 규정이 실제로 바뀌면
 * 이 숫자도 함께 고쳐야 한다(그때는 의도한 변경이다).
 */
describe("규정 시드 — 개수", () => {
  it("교내는 73개다 (상점 18 + 벌점 54 + 상쇄점 1)", () => {
    expect(SCHOOL_RULES).toHaveLength(73);
    expect(SCHOOL_RULES.filter((r) => r.kind === "MERIT")).toHaveLength(18);
    expect(SCHOOL_RULES.filter((r) => r.kind === "DEMERIT")).toHaveLength(54);
    expect(SCHOOL_RULES.filter((r) => r.kind === "OFFSET")).toHaveLength(1);
  });

  it("기숙사는 41개다 (상점 9 + 벌점 32)", () => {
    expect(DORM_RULES).toHaveLength(41);
    expect(DORM_RULES.filter((r) => r.kind === "MERIT")).toHaveLength(9);
    expect(DORM_RULES.filter((r) => r.kind === "DEMERIT")).toHaveLength(32);
  });

  it("전체는 114개다", () => {
    expect(MERIT_RULE_SEED).toHaveLength(114);
  });

  it("교내 벌점 분류별 개수가 원본 표와 같다", () => {
    const counts = new Map<string, number>();
    for (const rule of SCHOOL_RULES.filter((r) => r.kind === "DEMERIT")) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "교내 생활": 20,
      "교외 생활": 4,
      "스쿨 캠핑장": 3,
      "야간 자습 시간": 7,
      용의복장: 6,
      "출결 수업": 11,
      "흡연 음주 약물": 3,
    });
  });

  it("교내 상점 분류별 개수가 원본 표와 같다", () => {
    const counts = new Map<string, number>();
    for (const rule of SCHOOL_RULES.filter((r) => r.kind === "MERIT")) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "교내 환경": 3,
      "명예 표창": 2,
      "선행 질서": 5,
      "수업 관련": 4,
      "학교 활동": 4,
    });
  });

  it("상쇄점은 선도관리 위원회 항목 하나뿐이다", () => {
    const offsets = SCHOOL_RULES.filter((r) => r.kind === "OFFSET");
    expect(offsets).toHaveLength(1);
    expect(offsets[0].category).toBe("선도관리 위원회");
    expect(offsets[0].points).toBe(60);
  });

  it("기숙사에는 상쇄점이 없다", () => {
    expect(DORM_RULES.filter((r) => r.kind === "OFFSET")).toHaveLength(0);
  });

  it("기숙사 분류별 개수가 원본 표와 같다", () => {
    const counts = new Map<string, number>();
    for (const rule of DORM_RULES) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      "기숙사 생활": 4,
      신고: 4,
      "자치회 임원": 1,
      "정심관 벌점": 32,
    });
  });
});

describe("규정 시드 — 형식", () => {
  it("트랙과 종류가 전부 아는 값이다", () => {
    for (const rule of MERIT_RULE_SEED) {
      expect(MERIT_TRACKS).toContain(rule.track);
      expect(MERIT_KINDS).toContain(rule.kind);
    }
  });

  it("점수는 전부 1~1000의 정수다 — 부호는 kind가 정하므로 음수가 없다", () => {
    for (const rule of MERIT_RULE_SEED) {
      expect(Number.isInteger(rule.points), rule.label).toBe(true);
      expect(rule.points, rule.label).toBeGreaterThanOrEqual(1);
      expect(rule.points, rule.label).toBeLessThanOrEqual(1000);
    }
  });

  it("문자열 길이가 스키마 한계 안에 있다", () => {
    for (const rule of MERIT_RULE_SEED) {
      expect(rule.label.length, rule.label).toBeGreaterThan(0);
      expect(rule.label.length, rule.label).toBeLessThanOrEqual(200);
      expect(rule.category.length, rule.category).toBeLessThanOrEqual(50);
      if (rule.description !== null) {
        expect(rule.description.length, rule.label).toBeLessThanOrEqual(500);
      }
    }
  });

  it("앞뒤 공백이 없다 — 있으면 화면에서 줄이 어긋난다", () => {
    for (const rule of MERIT_RULE_SEED) {
      expect(rule.label).toBe(rule.label.trim());
      expect(rule.category).toBe(rule.category.trim());
    }
  });

  it("같은 트랙 안에 같은 항목명이 두 번 나오지 않는다", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const rule of MERIT_RULE_SEED) {
      const key = `${rule.track}::${rule.label}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });
});

describe("규정 시드 — 범위 점수 처리", () => {
  /**
   * 원본에 "2~5점"처럼 범위로 적힌 항목이 있다. 카탈로그는 점수가 정해져 있어야
   * 하므로 1점으로 넣고 범위를 설명에 적는다 — 여러 번 부여해 조절하며,
   * 그래야 각 건이 감사로그에 따로 남는다.
   */
  const RANGE_LABELS = [
    "생활관 내 생활이 타의 모범이 되는 자(사감교사 및 사감 추천)",
    "건물 내의 환경 미화 및 공공 시설물에서의 노력 봉사자(시간당 1점, 최고 3점)",
    "위 사항에 없는 사안에 대해 정심관 운영위원회 협의회에서 상의하여 부여",
  ];

  it.each(RANGE_LABELS)("범위 항목은 1점이고 설명에 범위가 적혀 있다: %s", (label) => {
    const rule = MERIT_RULE_SEED.find((r) => r.label === label);
    expect(rule).toBeDefined();
    expect(rule!.points).toBe(1);
    expect(rule!.description).toMatch(/\d+~\d+점 범위/);
  });

  it("범위 항목은 기숙사 상점 셋뿐이다", () => {
    const ranged = MERIT_RULE_SEED.filter((r) => r.description?.includes("점 범위"));
    expect(ranged.map((r) => r.label).sort()).toEqual([...RANGE_LABELS].sort());
  });
});

describe("규정 시드 — 원본 대조 표본", () => {
  /** 옮겨 적기 오류를 잡는 표본. 점수가 큰 항목과 경계값을 고른다. */
  const SAMPLES: [track: string, label: string, kind: string, points: number][] = [
    ["SCHOOL", "재학 기간 중 문신을 한 학생", "DEMERIT", 30],
    ["SCHOOL", "교내·외에서 흡연이나 음주를 한 학생", "DEMERIT", 20],
    ["SCHOOL", "가벼운 교육적 지시 사항을 어긴 학생", "DEMERIT", 1],
    ["SCHOOL", "선도관리위원회 징계후 벌점 상쇄", "OFFSET", 60],
    ["SCHOOL", "교사의 교육활동에 도움을 주는 학생", "MERIT", 1],
    ["SCHOOL", "학교 행사 후 청소 및 정리정돈에 솔선수범하여 참여한 학생", "MERIT", 10],
    ["DORM", "무단 외출 (보호자 통보)", "DEMERIT", 20],
    ["DORM", "야간 자율시간 *야간 출입 제한 구역에 출입하는 학생", "DEMERIT", 15],
    ["DORM", "신고(폭력, 금품 갈취)", "MERIT", 3],
    ["DORM", "허위로 신고한 학생", "DEMERIT", 3],
  ];

  it.each(SAMPLES)("%s / %s", (track, label, kind, points) => {
    const rule = MERIT_RULE_SEED.find((r) => r.track === track && r.label === label);
    expect(rule, `${label} 항목이 없다`).toBeDefined();
    expect(rule!.kind).toBe(kind);
    expect(rule!.points).toBe(points);
  });

  it("원본의 오탈자를 임의로 고치지 않는다 (리숙사)", () => {
    // 공식 규정 문구라 시스템이 손대지 않는다. 학교가 표를 고치면 그때 함께 고친다.
    const rule = MERIT_RULE_SEED.find((r) => r.label.startsWith("리숙사"));
    expect(rule).toBeDefined();
  });
});
