import { describe, expect, it } from "vitest";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelSchema,
  classRosterSchema,
  createRuleSchema,
  deleteRuleSchema,
  MAX_THRESHOLD,
  studentHistoryExportSchema,
  thresholdSchema,
  updateRuleSchema,
} from "@/modules/merit/merit.schema";

const valid = {
  track: "SCHOOL",
  kind: "MERIT",
  label: "교내 봉사활동 우수 참여",
  points: "5",
  category: "봉사",
  description: "",
};

describe("createRuleSchema", () => {
  it("정상 입력을 통과시키고 points를 숫자로 바꾼다", () => {
    const parsed = createRuleSchema.parse(valid);
    expect(parsed.points).toBe(5);
    expect(parsed.track).toBe("SCHOOL");
  });

  it("빈 문자열 category·description은 null이 된다", () => {
    const parsed = createRuleSchema.parse(valid);
    expect(parsed.category).toBe("봉사");
    expect(parsed.description).toBeNull();
  });

  it("점수는 양수여야 한다", () => {
    expect(createRuleSchema.safeParse({ ...valid, points: "0" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "-3" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "1.5" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, points: "abc" }).success).toBe(false);
  });

  it("모르는 트랙·종류는 거부한다", () => {
    expect(createRuleSchema.safeParse({ ...valid, track: "CLUB" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, kind: "BONUS" }).success).toBe(false);
  });

  it("항목명은 비어 있을 수 없다", () => {
    expect(createRuleSchema.safeParse({ ...valid, label: "" }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...valid, label: "   " }).success).toBe(false);
  });
});

describe("updateRuleSchema", () => {
  it("track·kind는 아예 받지 않는다", () => {
    const parsed = updateRuleSchema.parse({
      ruleId: "r-1",
      updatedAt: "2026-08-19T00:00:00.000Z",
      label: "고친 이름",
      points: "7",
      category: "",
      description: "",
      track: "DORM",
      kind: "DEMERIT",
    });
    expect(parsed).not.toHaveProperty("track");
    expect(parsed).not.toHaveProperty("kind");
    expect(parsed.label).toBe("고친 이름");
    expect(parsed.points).toBe(7);
  });

  it("ruleId가 없으면 거부한다", () => {
    expect(
      updateRuleSchema.safeParse({ label: "x", points: "1" }).success,
    ).toBe(false);
  });
});

describe("deleteRuleSchema", () => {
  it("삭제도 화면이 읽은 revision을 Date로 바꿔 전달한다", () => {
    const updatedAt = "2026-08-19T00:00:00.000Z";
    expect(
      deleteRuleSchema.parse({ ruleId: "r-1", updatedAt, reason: "규정 개정" }),
    ).toEqual({ ruleId: "r-1", updatedAt: new Date(updatedAt), reason: "규정 개정" });
  });
});

/** 선택 입력의 길이 초과는 오류여야 한다 — 조용히 버리면 메모만 사라진다. */
describe("선택 입력(메모·분류·설명)의 길이", () => {
  it("분류가 50자를 넘으면 거부한다", () => {
    const result = createRuleSchema.safeParse({ ...valid, category: "가".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("메모가 500자를 넘으면 거부한다", () => {
    const result = awardSchema.safeParse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      note: "가".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("한계 안의 값은 그대로 통과한다", () => {
    const note = "가".repeat(500);
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      note,
    });
    expect(parsed.note).toBe(note);
  });

  it("칸이 아예 없으면(null) null로 떨어진다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      note: null,
    });
    expect(parsed.note).toBeNull();
  });

  it("공백만 있으면 null이다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      note: "   ",
    });
    expect(parsed.note).toBeNull();
  });
});

/** 조회 학년도의 범위. 상수를 손으로 다시 적으면 학년도 모듈과 갈린다. */
describe("조회 학년도", () => {
  const roster = { grade: "2", classNo: "3", track: "SCHOOL" };

  it("학년도 모듈의 범위를 그대로 쓴다", () => {
    expect(classRosterSchema.safeParse({ ...roster, year: MIN_YEAR }).success).toBe(true);
    expect(classRosterSchema.safeParse({ ...roster, year: MAX_YEAR }).success).toBe(true);
    expect(classRosterSchema.safeParse({ ...roster, year: MIN_YEAR - 1 }).success).toBe(
      false,
    );
    expect(classRosterSchema.safeParse({ ...roster, year: MAX_YEAR + 1 }).success).toBe(
      false,
    );
  });

  it("내보내기 조건도 같은 범위다", () => {
    const base = { studentProfileId: "sp-1", track: "SCHOOL" };
    expect(studentHistoryExportSchema.safeParse({ ...base, year: MIN_YEAR }).success).toBe(
      true,
    );
    expect(
      studentHistoryExportSchema.safeParse({ ...base, year: MAX_YEAR + 1 }).success,
    ).toBe(false);
  });

  it("학년도는 선택 입력이다", () => {
    expect(classRosterSchema.parse(roster).year).toBeUndefined();
  });
});

/**
 * 벌점 기준 설정. 위험이 경고보다 작으면 warn 구간이 사라지고, 0을 넣으면
 * 벌점 0점인 전교생이 명단에 오른다. 순서와 범위를 여기서 못 박는다.
 */
describe("thresholdSchema", () => {
  const valid = {
    track: "SCHOOL",
    updatedAt: "2026-08-19T00:00:00.000Z",
    warn: "20",
    danger: "30",
  };

  it("정상 입력을 통과시키고 숫자와 revision Date로 바꾼다", () => {
    const parsed = thresholdSchema.parse(valid);
    expect(parsed).toEqual({
      track: "SCHOOL",
      updatedAt: new Date("2026-08-19T00:00:00.000Z"),
      warn: 20,
      danger: 30,
    });
  });

  it("아직 저장된 행이 없으면 updatedAt 빈 값이 null이 된다", () => {
    expect(thresholdSchema.parse({ ...valid, updatedAt: "" }).updatedAt).toBeNull();
  });

  it("위험이 경고보다 작으면 거부한다", () => {
    expect(thresholdSchema.safeParse({ ...valid, warn: "30", danger: "20" }).success).toBe(
      false,
    );
  });

  it("위험과 경고가 같아도 거부한다", () => {
    expect(thresholdSchema.safeParse({ ...valid, warn: "20", danger: "20" }).success).toBe(
      false,
    );
  });

  it("0·음수·소수·빈 값은 거부한다", () => {
    for (const warn of ["0", "-1", "1.5", "", "  ", "abc"]) {
      expect(thresholdSchema.safeParse({ ...valid, warn }).success, warn).toBe(false);
    }
  });

  it("상한을 넘으면 거부한다", () => {
    expect(
      thresholdSchema.safeParse({
        track: "SCHOOL",
        warn: String(MAX_THRESHOLD),
        danger: String(MAX_THRESHOLD + 1),
      }).success,
    ).toBe(false);
  });

  it("상한 정확히는 통과한다", () => {
    expect(
      thresholdSchema.safeParse({
        track: "SCHOOL",
        warn: String(MAX_THRESHOLD - 1),
        danger: String(MAX_THRESHOLD),
      }).success,
    ).toBe(true);
  });

  it("모르는 트랙은 거부한다", () => {
    expect(thresholdSchema.safeParse({ ...valid, track: "CLUB" }).success).toBe(false);
  });

  it("모든 오류 문구가 한글이다", () => {
    const cases = [
      { ...valid, warn: "0" },
      { ...valid, warn: "abc" },
      { ...valid, danger: String(MAX_THRESHOLD + 1) },
      { ...valid, warn: "30", danger: "20" },
    ];

    for (const input of cases) {
      const result = thresholdSchema.safeParse(input);
      expect(result.success, JSON.stringify(input)).toBe(false);
      for (const issue of result.error!.issues) {
        // 한글 음절이 하나라도 있어야 우리가 붙인 문구다.
        expect(issue.message, issue.message).toMatch(/[가-힣]/);
        expect(issue.message, issue.message).toMatch(/\.$/);
      }
    }
  });
});

/** 화면에 그대로 나가는 문구다 — 어투가 섞이지 않게 마침표를 맞춘다. */
describe("검증 실패 문구", () => {
  function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
    expect(result.success).toBe(false);
    return result.error!.issues[0].message;
  }

  it("모두 마침표로 끝난다", () => {
    const messages = [
      firstMessage(createRuleSchema.safeParse({ track: "SCHOOL", kind: "MERIT", label: "", points: "5" })),
      firstMessage(createRuleSchema.safeParse({ track: "SCHOOL", kind: "MERIT", label: "x", points: "0" })),
      firstMessage(createRuleSchema.safeParse({ track: "SCHOOL", kind: "MERIT", label: "x", points: "5", category: "가".repeat(51) })),
      firstMessage(awardSchema.safeParse({ studentProfileId: "sp-1", ruleId: "" })),
      firstMessage(cancelSchema.safeParse({ awardId: "a-1", reason: "" })),
      firstMessage(bulkAwardSchema.safeParse({ studentProfileIds: [], ruleId: "r-1" })),
    ];

    for (const message of messages) {
      expect(message, message).toMatch(/\.$/);
    }
  });

  /** 상한을 손으로 다시 적으면 스키마를 고쳐도 문구가 옛 숫자로 남는다. */
  it("인원 상한 문구는 BULK_AWARD_LIMIT에서 만들어진다", () => {
    const result = bulkAwardSchema.safeParse({
      studentProfileIds: Array.from({ length: BULK_AWARD_LIMIT + 1 }, (_, i) => `sp-${i}`),
      ruleId: "r-1",
    });

    expect(firstMessage(result)).toBe(`한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`);
  });
});
