import { describe, expect, it } from "vitest";
import { planRoster } from "@/modules/enrollment/roster.plan";
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
  hasGraduatedEnrollment: false,
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

  it("빈 학생코드끼리는 중복으로 잡지 않는다", () => {
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

  it("그 학년도 배정이 없던 학생은 학적변동이 아니라 새 배정이다", () => {
    const 올해배정없음 = { ...재학생, status: null };
    const plan = planRoster([row()], [올해배정없음]);

    expect(plan.newAssignment).toHaveLength(1);
    expect(plan.newAssignment[0]!.studentProfileId).toBe("sp-1");
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.reassign).toHaveLength(0);
  });

  describe("파일의 줄이 status: null(빈 학적)일 때 — Critical 결함 회귀", () => {
    it("원래도 배정이 없었으면 무변경이다", () => {
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

    it("배정이 있던 학생의 학적이 파일에서 비면 확인 필요로 보낸다", () => {
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

  it("학생코드는 맞는데 이름이 등록된 값과 다르면 확인 필요로 보낸다", () => {
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

  it("이름·생년월일이 같아도 학생코드가 다르면 다른 학생이다", () => {
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

  it("명단에 없는 졸업생은 물리 삭제 대상에서 제외한다", () => {
    const 졸업생 = {
      ...재학생,
      studentProfileId: "sp-2",
      userId: "u-2",
      studentCode: "BCDF2345",
      status: "GRADUATED",
      hasGraduatedEnrollment: true,
    };

    const plan = planRoster([], [재학생, 졸업생]);

    expect(plan.missingFromFile).toHaveLength(1);
    const ids = plan.missingFromFile.map((s) => s.studentProfileId);
    expect(ids).toContain("sp-1");
    expect(ids).not.toContain("sp-2");
    expect(plan.hasBlockingError).toBe(false);
  });

  it("배정이 없던 학생도 명단에 없으면 missingFromFile에 들어간다", () => {
    const 배정없음 = { ...재학생, status: null, grade: null, classNo: null, number: null };

    const plan = planRoster([], [배정없음]);

    expect(plan.missingFromFile).toHaveLength(1);
    expect(plan.missingFromFile[0]!.studentProfileId).toBe("sp-1");
  });

  it("이전 학년도 졸업 기록이 있으면 올해 배정이 없어도 물리 삭제 대상에서 제외한다", () => {
    const 과거졸업생 = {
      ...재학생,
      status: null,
      grade: null,
      classNo: null,
      number: null,
      hasGraduatedEnrollment: true,
    };

    const plan = planRoster([], [과거졸업생]);

    expect(plan.missingFromFile).toHaveLength(0);
    // 올해 배정이 없으면 확정해도 아무 일이 없다 — 조용히 넘기는 게 맞다.
    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.hasBlockingError).toBe(false);
  });

  describe("졸업 면제가 이번 학년도 배정을 덮어 가리지 않는다", () => {
    /** 2026 졸업 + 2027 재학(재입학·오등록). 졸업 면제만 하면 어디에도 안 잡힌다. */
    const 재입학생 = {
      ...재학생,
      studentProfileId: "sp-2",
      userId: "u-2",
      studentCode: "BCDF2345",
      name: "재입학",
      birthDate: "2008-05-05",
      status: "ENROLLED",
      hasGraduatedEnrollment: true,
    };

    it("명단에 줄이 없으면 확인 필요로 올려 확정을 막는다", () => {
      const plan = planRoster([row()], [재학생, 재입학생]);

      // 물리 삭제하지는 않는다 — repo의 삭제 가드도 이 학생을 건너뛴다.
      expect(plan.missingFromFile).toHaveLength(0);
      expect(plan.needsAttention).toHaveLength(1);
      expect(plan.needsAttention[0]!.studentProfileId).toBe("sp-2");
      expect(plan.needsAttention[0]!.reason).toContain("졸업 기록이 있는 학생");
      expect(plan.hasBlockingError).toBe(true);
    });

    it("파일에 줄이 있으면 평소대로 분류한다", () => {
      const 재입학줄 = row({
        line: 3,
        studentCode: "BCDF2345",
        name: "재입학",
        birthDate: "2008-05-05",
        classNo: 5,
      });

      const plan = planRoster([row(), 재입학줄], [재학생, 재입학생]);

      expect(plan.needsAttention).toHaveLength(0);
      expect(plan.reassign).toHaveLength(1);
      expect(plan.reassign[0]!.studentProfileId).toBe("sp-2");
      expect(plan.hasBlockingError).toBe(false);
    });

    it("올해 학적이 졸업이면 그대로 면제한다 — 올해 졸업한 학생의 보존 기록이다", () => {
      const 올해졸업생 = { ...재입학생, status: "GRADUATED", grade: null, classNo: null, number: null };

      const plan = planRoster([row()], [재학생, 올해졸업생]);

      expect(plan.missingFromFile).toHaveLength(0);
      expect(plan.needsAttention).toHaveLength(0);
      expect(plan.hasBlockingError).toBe(false);
    });
  });

  it("문제가 없으면 확정을 막지 않는다", () => {
    const plan = planRoster([row({ classNo: 5 })], [재학생]);
    expect(plan.hasBlockingError).toBe(false);
  });

  describe("예전 deletedAt 표시가 남아 있는 입력", () => {
    it("명단에 없으면 deleted 표시와 무관하게 missingFromFile에 들어간다", () => {
      const 예전삭제표시 = { ...재학생, deleted: true };
      const plan = planRoster([], [예전삭제표시]);

      expect(plan.missingFromFile).toHaveLength(1);
      expect(plan.missingFromFile[0]!.studentProfileId).toBe("sp-1");
    });
  });
});

/*
 * bulkDeleteThreshold()의 테스트 셋(절대 하한 10명·재학생의 10%·경계값 `>`)도 함께
 * 없앴다. 그 셋이 지키던 것은 "임계 계산이 화면과 서비스에서 어긋나지 않는다"인데,
 * 임계를 없애 어긋날 두 곳 자체가 사라졌다 — 지금은 양쪽 다 `deleteCount > 0`이다.
 * 임계가 정말 위험했던 지점(재학 300명 → 임계 30 → 한 반 25명이 그냥 통과)은
 * roster.service.test.ts가 "1명만 빠져도 건수를 넣지 않으면 거부한다"로 못 박는다.
 */

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

  it("학생코드 열이 없는 파일은 오류 없이 전 줄을 신규로 받는다", () => {
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
    it("학년도 전환 직후에도 이름·생년월일이 겹치면 확인 필요로 막는다", () => {
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
          hasGraduatedEnrollment: false,
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

    it("학년도 중간에 올리면 전교 배정 초기화를 확정이 막는다", () => {
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
