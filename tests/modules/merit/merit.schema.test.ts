import { describe, expect, it } from "vitest";
import { MAX_YEAR, MIN_YEAR } from "@/modules/academic-year/academic-year.schema";
import {
  awardSchema,
  BULK_AWARD_LIMIT,
  bulkAwardSchema,
  cancelSchema,
  classRosterSchema,
  createRuleSchema,
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

  it("점수는 양수여야 한다 — 부호는 kind가 정한다", () => {
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
  it("track·kind는 아예 받지 않는다 — 생성 시 고정이다", () => {
    const parsed = updateRuleSchema.parse({
      ruleId: "r-1",
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

/**
 * 선택 입력의 길이 초과는 **오류**여야 한다. 예전엔 `.catch(null)`이 붙어 있어서
 * 한계를 넘긴 메모가 조용히 null이 됐다 — 화면에는 "부여했습니다"가 뜨고 메모만
 * 사라지는, 아무도 눈치채지 못하는 실패였다.
 */
describe("선택 입력(메모·분류·설명)의 길이", () => {
  it("분류가 50자를 넘으면 거부한다 — 조용히 버리지 않는다", () => {
    const result = createRuleSchema.safeParse({ ...valid, category: "가".repeat(51) });
    expect(result.success).toBe(false);
  });

  it("메모가 500자를 넘으면 거부한다", () => {
    const result = awardSchema.safeParse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: "가".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("한계 안의 값은 그대로 통과한다", () => {
    const note = "가".repeat(500);
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note,
    });
    expect(parsed.note).toBe(note);
  });

  it("칸이 아예 없으면(null) null로 떨어진다 — 폼에 그 입력이 없는 경우다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: null,
    });
    expect(parsed.note).toBeNull();
  });

  it("공백만 있으면 null이다", () => {
    const parsed = awardSchema.parse({
      studentProfileId: "sp-1",
      ruleId: "r-1",
      occurredOn: "2026-06-12",
      note: "   ",
    });
    expect(parsed.note).toBeNull();
  });
});

/**
 * 조회 학년도의 범위.
 *
 * 예전엔 2000·2100을 이 파일에 손으로 다시 적었다. 학교가 범위를 넓히면 학년도
 * 모듈과 여기가 갈리고, 갈렸다는 사실은 "왜 이 해는 안 나오지"로만 드러난다.
 */
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

  it("학년도는 선택 입력이다 — 없으면 서비스가 현재 학년도로 정한다", () => {
    expect(classRosterSchema.parse(roster).year).toBeUndefined();
  });
});

/**
 * 벌점 기준 설정.
 *
 * **여기가 뚫리면 화면이 조용히 무의미해진다.** 위험이 경고보다 작으면
 * demeritLevel이 warn 구간을 아예 못 내고(danger가 먼저 걸린다), 0을 넣으면
 * 벌점 0점인 전교생이 명단에 오른다. 그래서 순서와 범위를 여기서 못 박는다.
 */
describe("thresholdSchema", () => {
  const valid = { track: "SCHOOL", warn: "20", danger: "30" };

  it("정상 입력을 통과시키고 숫자로 바꾼다", () => {
    const parsed = thresholdSchema.parse(valid);
    expect(parsed).toEqual({ track: "SCHOOL", warn: 20, danger: 30 });
  });

  it("위험이 경고보다 작으면 거부한다", () => {
    expect(thresholdSchema.safeParse({ ...valid, warn: "30", danger: "20" }).success).toBe(
      false,
    );
  });

  it("위험과 경고가 같아도 거부한다 — 같으면 경고 구간이 사라진다", () => {
    expect(thresholdSchema.safeParse({ ...valid, warn: "20", danger: "20" }).success).toBe(
      false,
    );
  });

  it("0·음수·소수·빈 값은 거부한다", () => {
    for (const warn of ["0", "-1", "1.5", "", "  ", "abc"]) {
      expect(thresholdSchema.safeParse({ ...valid, warn }).success, warn).toBe(false);
    }
  });

  it("상한을 넘으면 거부한다 — 오타 한 번으로 영원히 안 뜨는 기준이 되지 않게", () => {
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

  it("모든 오류 문구가 한글이다 — zod의 영문 기본값이 화면에 나가면 안 된다", () => {
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

/**
 * 화면에 그대로 나가는 문구다. 다른 스키마 파일은 전부 마침표를 찍는데
 * 여기만 안 찍혀 있어서, 같은 화면에 두 어투가 섞였다.
 */
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
      firstMessage(awardSchema.safeParse({ studentProfileId: "sp-1", ruleId: "", occurredOn: "2026-06-12" })),
      firstMessage(awardSchema.safeParse({ studentProfileId: "sp-1", ruleId: "r-1", occurredOn: "" })),
      firstMessage(awardSchema.safeParse({ studentProfileId: "sp-1", ruleId: "r-1", occurredOn: "2026-13-01" })),
      firstMessage(cancelSchema.safeParse({ awardId: "a-1", reason: "" })),
      firstMessage(bulkAwardSchema.safeParse({ studentProfileIds: [], ruleId: "r-1", occurredOn: "2026-06-12" })),
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
      occurredOn: "2026-06-12",
    });

    expect(firstMessage(result)).toBe(`한 번에 ${BULK_AWARD_LIMIT}명까지 줄 수 있습니다.`);
  });
});
