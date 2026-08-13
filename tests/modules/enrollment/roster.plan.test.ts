import { describe, expect, it } from "vitest";
import { bulkDeleteThreshold, planRoster } from "@/modules/enrollment/roster.plan";
import { normalizeRows, type RosterRow } from "@/modules/enrollment/roster.parse";

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    line: 2,
    studentCode: "AAAA2345",
    name: "김동혁",
    birthDate: "2010-07-28",
    grade: 1,
    classNo: 3,
    number: 3,
    status: "ENROLLED",
    errors: [],
    ...over,
  };
}

const 재학생 = {
  studentProfileId: "sp-1",
  userId: "u-1",
  studentCode: "AAAA2345",
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
  accountActive: true,
};

describe("planRoster()", () => {
  it("기존 학생과 학생코드로 이어붙인다", () => {
    const plan = planRoster([row({ classNo: 5, number: 7 })], [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(1);
    expect(plan.reassign[0]!.studentProfileId).toBe("sp-1");
  });

  it("바뀐 게 없으면 어느 분류에도 넣지 않는다", () => {
    const plan = planRoster([row()], [재학생]);

    expect(plan.reassign).toHaveLength(0);
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.newAssignment).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
  });

  it("학생코드가 비면 신규다 — 초대코드가 나갈 대상", () => {
    // 이름·생년월일을 기존 학생과 다르게 둔다 — 같으면 "코드가 지워진 것 같다"는
    // needsAttention 상관관계(아래 describe 참고)에 걸려 이 테스트의 의도(순수 신규)와
    // 섞인다.
    const plan = planRoster(
      [row({ studentCode: "", name: "새학생", birthDate: "2012-01-01" })],
      [재학생],
    );

    expect(plan.newStudents).toHaveLength(1);
    expect(plan.newStudents[0]!.studentProfileId).toBeNull();
  });

  it("학생코드가 빈 신규 학생이 여럿이어도 서로 겹친 것으로 잡지 않는다 — " +
    "빈 값끼리는 중복 검사 대상이 아니다", () => {
    const plan = planRoster(
      [
        row({ studentCode: "", name: "새학생1", classNo: 5, number: 1 }),
        row({ line: 3, studentCode: "", name: "새학생2", classNo: 5, number: 2 }),
      ],
      [재학생],
    );

    expect(plan.newStudents).toHaveLength(2);
    expect(plan.errorRows).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("학적이 바뀌면 재배정이 아니라 학적변동이다", () => {
    const plan = planRoster([row({ status: "GRADUATED", grade: null, classNo: null, number: null })], [재학생]);

    expect(plan.statusChange).toHaveLength(1);
    expect(plan.reassign).toHaveLength(0);
  });

  it("그 학년도 배정이 아예 없던 학생(status===null)은 학적변동이 아니라 새 배정이다 (I7) — " +
    "학년도가 막 넘어간 시점엔 전교생이 여기로 온다. statusChange로 섞이면 미리보기가 " +
    "신학년 첫 반영에서 무엇이 바뀌는지 보여주지 못한다.", () => {
    const 올해배정없음 = { ...재학생, status: null };
    const plan = planRoster([row()], [올해배정없음]);

    expect(plan.newAssignment).toHaveLength(1);
    expect(plan.newAssignment[0]!.studentProfileId).toBe("sp-1");
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.reassign).toHaveLength(0);
  });

  describe("파일의 줄이 status: null(빈 학적)일 때 — Critical 결함 회귀", () => {
    it("원래도 그 학년도 배정이 없었으면(before.status===null) 무변경이다 — " +
      "왕복 불변식의 핵심: 배정 없는 학생을 그대로 다시 올려도 아무 분류에도 안 잡힌다", () => {
      const 올해배정없음 = { ...재학생, status: null, grade: null, classNo: null, number: null };
      const 빈줄 = row({ status: null, grade: null, classNo: null, number: null });

      const plan = planRoster([빈줄], [올해배정없음]);

      expect(plan.newAssignment).toHaveLength(0);
      expect(plan.statusChange).toHaveLength(0);
      expect(plan.reassign).toHaveLength(0);
      expect(plan.needsAttention).toHaveLength(0);
      expect(plan.missingFromFile).toHaveLength(0);
      expect(plan.hasBlockingError).toBe(false);
    });

    it("원래는 배정이 있었는데(before.status!==null) 파일에서 학적이 비면 " +
      "확인 필요로 보낸다 — 자동으로 배정을 지우지 않는다", () => {
      const 빈줄 = row({ status: null, grade: null, classNo: null, number: null });

      const plan = planRoster([빈줄], [재학생]);

      expect(plan.newAssignment).toHaveLength(0);
      expect(plan.statusChange).toHaveLength(0);
      expect(plan.reassign).toHaveLength(0);
      expect(plan.needsAttention).toHaveLength(1);
      expect(plan.needsAttention[0]!.studentProfileId).toBe("sp-1");
      expect(plan.needsAttention[0]!.reason).toContain("배정이 삭제됩니다");
      expect(plan.hasBlockingError).toBe(true);
    });
  });

  it("학생코드는 맞는데 이름이 등록된 값과 다르면 확인 필요로 보낸다 — " +
    "이름 대조를 없앤 대가라 한 열만 밀려도 두 학생이 조용히 맞바뀔 수 있다. " +
    "매칭 자체는 여전히 코드로만 하되(studentProfileId는 정확히 잇는다), 자동으로 " +
    "반영하지 않고 사람이 보게 한다. 진짜 개명이면 상세 화면에서 이름을 먼저 고친다.", () => {
    const plan = planRoster([row({ name: "개명후", classNo: 5 })], [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.studentProfileId).toBe("sp-1");
    expect(plan.needsAttention[0]!.reason).toContain(
      "파일의 이름/생년월일이 등록된 학생과 다릅니다",
    );
    expect(plan.hasBlockingError).toBe(true);
  });

  it("학생코드는 맞는데 생년월일이 등록된 값과 다르면 확인 필요로 보낸다", () => {
    const plan = planRoster([row({ birthDate: "1999-09-09" })], [재학생]);

    expect(plan.reassign).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.reason).toContain(
      "파일의 이름/생년월일이 등록된 학생과 다릅니다",
    );
  });

  it("이름·생년월일이 완전히 같아도 학생코드가 다르면 각각 다른 학생이다 — " +
    "동명이인이 같은 생일인 것이 이제 정상이다", () => {
    const 동명이인 = { ...재학생, studentProfileId: "sp-2", userId: "u-2", studentCode: "BCDF2345" };

    const plan = planRoster(
      [
        row({ studentCode: "AAAA2345", classNo: 5 }),
        row({ line: 3, studentCode: "BCDF2345", classNo: 6 }),
      ],
      [재학생, 동명이인],
    );

    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.reassign).toHaveLength(2);
    const byId = new Map(plan.reassign.map((r) => [r.studentProfileId, r.classNo]));
    expect(byId.get("sp-1")).toBe(5);
    expect(byId.get("sp-2")).toBe(6);
  });

  it("명단에 없는 학생코드면 확인 필요로 보내고 확정을 막는다 — 오타이거나 다른 학교 파일일 수 있다", () => {
    const plan = planRoster([row({ studentCode: "ZZZZ9999" })], [재학생]);

    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.reason).toContain("명단에 없는 학생코드");
    expect(plan.reassign).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(true);
  });

  it("파싱 오류가 있는 줄은 분류하지 않고 확정을 막는다", () => {
    const plan = planRoster([row({ errors: ["생년월일을 읽을 수 없습니다."] })], [재학생]);

    expect(plan.errorRows).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(true);
  });

  it("같은 반에 번호가 겹치면 확정을 막는다", () => {
    const plan = planRoster(
      [
        row({ studentCode: "AAAA2345", name: "가", birthDate: "2010-01-01" }),
        row({ line: 3, studentCode: "BCDF2345", name: "나", birthDate: "2010-01-02" }),
      ],
      [],
    );

    expect(plan.hasBlockingError).toBe(true);
    expect(plan.errorRows.some((r) => r.errors.join().includes("번호"))).toBe(true);
  });

  it("같은 학생코드가 파일에 두 번 나오면 확정을 막는다", () => {
    const plan = planRoster([row(), row({ line: 3, number: 9 })], [재학생]);

    expect(plan.hasBlockingError).toBe(true);
    expect(plan.errorRows.some((r) => r.errors.join().includes("학생코드"))).toBe(true);
  });

  it("명단에 없는 재학생을 따로 모은다 — 추측하지 않고 관리자에게 보여준다", () => {
    const plan = planRoster([], [재학생]);

    expect(plan.missingFromFile).toHaveLength(1);
    // missingFromFile 자체는 확정을 막지 않는다 — 삭제 대상 집합·건수 대조는
    // 서비스 계층(applyRosterPlan, I-2·I-3)이 별도로 강제한다.
    expect(plan.hasBlockingError).toBe(false);
  });

  it("명단에 없으면 학적과 무관하게 missingFromFile에 들어간다 — 재학·졸업 둘 다 " +
    "(파일이 전교생 완성본이므로 졸업생 줄을 지워도 삭제 대상이어야 한다)", () => {
    const 졸업생 = { ...재학생, studentProfileId: "sp-2", userId: "u-2", studentCode: "BCDF2345", status: "GRADUATED" };

    const plan = planRoster([], [재학생, 졸업생]);

    expect(plan.missingFromFile).toHaveLength(2);
    const ids = plan.missingFromFile.map((s) => s.studentProfileId);
    expect(ids).toContain("sp-1");
    expect(ids).toContain("sp-2");
    expect(plan.hasBlockingError).toBe(false);
  });

  it("배정 자체가 없던 학생(status: null)도 명단에 없으면 missingFromFile에 들어간다 — " +
    "예전엔 ENROLLED만 걸러서 이 학생은 빠졌지만, 파일이 전교생 완성본이 된 뒤로는 " +
    "학적 유무와 무관하게 명단에 없다는 사실 자체가 삭제 대상이라는 뜻이다", () => {
    const 배정없음 = { ...재학생, status: null, grade: null, classNo: null, number: null };

    const plan = planRoster([], [배정없음]);

    expect(plan.missingFromFile).toHaveLength(1);
    expect(plan.missingFromFile[0]!.studentProfileId).toBe("sp-1");
  });

  it("문제가 없으면 확정을 막지 않는다", () => {
    const plan = planRoster([row({ classNo: 5 })], [재학생]);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("totalStudents는 existing.length다 — 화면(import-form.tsx)과 서비스가 같은 " +
    "분모로 대량 삭제 임계를 계산해야 한다 (I-3)", () => {
    const 재학생2 = { ...재학생, studentProfileId: "sp-2", userId: "u-2", studentCode: "BCDF2345" };
    const plan = planRoster([], [재학생, 재학생2]);

    expect(plan.totalStudents).toBe(2);
  });
});

describe("bulkDeleteThreshold() — 대량 삭제 확인이 필요해지는 삭제 건수 (I-3)", () => {
  it("전체 학생이 적으면 절대 하한 10명을 쓴다 — 10%가 10명 미만이어도 내려가지 않는다", () => {
    expect(bulkDeleteThreshold(50)).toBe(10);
    expect(bulkDeleteThreshold(0)).toBe(10);
  });

  it("전체 학생이 많으면 10% 쪽이 더 크다", () => {
    expect(bulkDeleteThreshold(300)).toBe(30);
  });

  it("경계값: 삭제 건수가 임계와 같으면(초과가 아니면) 대량 삭제가 아니다", () => {
    // 전체 100명 → 임계 10. 정확히 10명 삭제는 초과가 아니다.
    expect(10 > bulkDeleteThreshold(100)).toBe(false);
    expect(11 > bulkDeleteThreshold(100)).toBe(true);
  });
});

describe("planRoster() + normalizeRows() — 회귀: 명단 업로드의 학년·반·번호 범위", () => {
  const HEADER = ["이름", "생년월일", "학년", "반", "번호", "학적"];

  it("엑셀에 학년 11 같은 오타가 있으면 파싱 단계에서 오류로 잡혀 확정이 막힌다", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2010-07-28", "11", "3", "3", "재학"],
    ]);

    const plan = planRoster(rows, []);

    expect(plan.errorRows).toHaveLength(1);
    expect(plan.errorRows[0]!.errors.join()).toContain("학년은 1~3");
    expect(plan.hasBlockingError).toBe(true);
  });

  it("범위 안이면 정상적으로 신규 학생으로 분류되고 확정이 막히지 않는다", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    const plan = planRoster(rows, []);

    expect(plan.newStudents).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(false);
  });

  it("학생코드 열이 아예 없는 파일도 오류 없이 받는다 — 전 줄이 신규가 된다 " +
    "(예전 서식·손으로 만든 파일도 계속 받아야 한다)", () => {
    const rows = normalizeRows([
      HEADER,
      ["김동혁", "2010-07-28", "1", "3", "3", "재학"],
    ]);

    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.studentCode).toBe("");

    const plan = planRoster(rows, []);
    expect(plan.newStudents).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(false);
  });

  describe("학생코드 열이 없는 파일 × 재학생이 있는 학교 — Important 결함 상호작용", () => {
    it("학년도 전환 직후(모든 재학생이 아직 이번 학년도 배정이 없음)여도 이름·생년월일이 " +
      "겹치면 확인 필요로 막는다 — missingFromFile이 학적과 무관하게 명단에 없는 " +
      "학생 전체로 넓어진 뒤로는(5단계) 이 학생도 거기 걸리므로, '학년도 전환 " +
      "직후라 대조할 대상이 없다'는 예전 빈틈이 막힌다. 이 빈틈은 " +
      "docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md의 " +
      "'4단계가 남긴 것'에 5단계에서 처리하기로 명시돼 있었다", () => {
        const 배정없는재학생 = {
          studentProfileId: "sp-1",
          userId: "u-1",
          studentCode: "AAAA2345",
          name: "김동혁",
          birthDate: "2010-07-28",
          grade: null,
          classNo: null,
          number: null,
          status: null,
          accountActive: true,
        };
        const rows = normalizeRows([
          HEADER,
          ["김동혁", "2010-07-28", "1", "3", "3", "재학"],
        ]);

        const plan = planRoster(rows, [배정없는재학생]);

        expect(plan.newStudents).toHaveLength(0);
        expect(plan.needsAttention).toHaveLength(1);
        expect(plan.needsAttention[0]!.reason).toContain("학생코드가 지워진 것 같습니다");
        expect(plan.missingFromFile).toHaveLength(1);
        expect(plan.hasBlockingError).toBe(true);
      });

    it("이미 배정된 재학생이 있는 학년도 중간에 이 파일을 올리면 " +
      "전교 배정 초기화(모두 신규 + 모두 명단에 없는 재학생)를 확정이 막는다 — " +
      "이름·생년월일이 일치하는 재학생마다 코드가 지워진 것으로 의심해 확인 필요로 보낸다", () => {
      const rows = normalizeRows([
        HEADER,
        ["김동혁", "2010-07-28", "1", "3", "3", "재학"],
      ]);

      const plan = planRoster(rows, [재학생]);

      expect(plan.newStudents).toHaveLength(0);
      expect(plan.needsAttention).toHaveLength(1);
      expect(plan.needsAttention[0]!.reason).toContain("학생코드가 지워진 것 같습니다");
      expect(plan.missingFromFile).toHaveLength(1);
      expect(plan.hasBlockingError).toBe(true);
    });
  });
});
