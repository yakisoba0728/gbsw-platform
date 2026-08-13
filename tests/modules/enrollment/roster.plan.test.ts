import { describe, expect, it } from "vitest";
import { planRoster } from "@/modules/enrollment/roster.plan";
import type { RosterRow } from "@/modules/enrollment/roster.parse";

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    line: 2,
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
  name: "김동혁",
  birthDate: "2010-07-28",
  grade: 1,
  classNo: 3,
  number: 3,
  status: "ENROLLED",
};

describe("planRoster()", () => {
  it("기존 학생과 이름+생년월일로 이어붙인다", () => {
    const plan = planRoster([row({ classNo: 5, number: 7 })], [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.reassign).toHaveLength(1);
    expect(plan.reassign[0]!.studentProfileId).toBe("sp-1");
  });

  it("바뀐 게 없으면 어느 분류에도 넣지 않는다", () => {
    const plan = planRoster([row()], [재학생]);

    expect(plan.reassign).toHaveLength(0);
    expect(plan.statusChange).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
  });

  it("없던 학생은 신규다 — 초대코드가 나갈 대상", () => {
    const plan = planRoster([row({ name: "새학생" })], [재학생]);

    expect(plan.newStudents).toHaveLength(1);
    expect(plan.newStudents[0]!.studentProfileId).toBeNull();
  });

  it("학적이 바뀌면 재배정이 아니라 학적변동이다", () => {
    const plan = planRoster([row({ status: "GRADUATED", grade: null, classNo: null, number: null })], [재학생]);

    expect(plan.statusChange).toHaveLength(1);
    expect(plan.reassign).toHaveLength(0);
  });

  it("이름과 생년월일이 똑같은 사람이 둘이면 자동으로 잇지 않는다", () => {
    const plan = planRoster([row()], [
      재학생,
      { ...재학생, studentProfileId: "sp-2", userId: "u-2" },
    ]);

    expect(plan.needsAttention).toHaveLength(1);
    expect(plan.needsAttention[0]!.reason).toContain("여럿");
    expect(plan.reassign).toHaveLength(0);
    expect(plan.newStudents).toHaveLength(0);
  });

  it("파싱 오류가 있는 줄은 분류하지 않고 확정을 막는다", () => {
    const plan = planRoster([row({ errors: ["생년월일을 읽을 수 없습니다."] })], [재학생]);

    expect(plan.errorRows).toHaveLength(1);
    expect(plan.hasBlockingError).toBe(true);
  });

  it("같은 반에 번호가 겹치면 확정을 막는다", () => {
    const plan = planRoster(
      [row({ name: "가", birthDate: "2010-01-01" }), row({ line: 3, name: "나", birthDate: "2010-01-02" })],
      [],
    );

    expect(plan.hasBlockingError).toBe(true);
    expect(plan.errorRows.some((r) => r.errors.join().includes("번호"))).toBe(true);
  });

  it("같은 학생이 파일에 두 번 나오면 확정을 막는다", () => {
    const plan = planRoster([row(), row({ line: 3, number: 9 })], [재학생]);

    expect(plan.hasBlockingError).toBe(true);
  });

  it("확인 필요가 있으면 확정을 막는다 — 잘못 이으면 남의 상벌점이 붙는다", () => {
    const plan = planRoster([row()], [
      재학생,
      { ...재학생, studentProfileId: "sp-2", userId: "u-2" },
    ]);

    expect(plan.hasBlockingError).toBe(true);
  });

  it("명단에 없는 재학생을 따로 모은다 — 추측하지 않고 관리자에게 보여준다", () => {
    const plan = planRoster([], [재학생]);

    expect(plan.missingFromFile).toHaveLength(1);
    // 경고일 뿐 확정을 막지는 않는다.
    expect(plan.hasBlockingError).toBe(false);
  });

  it("문제가 없으면 확정을 막지 않는다", () => {
    const plan = planRoster([row({ classNo: 5 })], [재학생]);
    expect(plan.hasBlockingError).toBe(false);
  });
});
