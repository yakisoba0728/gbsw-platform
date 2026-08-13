import { describe, expect, it } from "vitest";
import { planRoster } from "@/modules/enrollment/roster.plan";
import { normalizeRows, type RosterRow } from "@/modules/enrollment/roster.parse";

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    line: 2,
    studentCode: "AAAA1111",
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
  studentCode: "AAAA1111",
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
    const plan = planRoster([row({ studentCode: "" })], [재학생]);

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

  it("학생코드가 같으면 이름이 달라도 같은 학생이다 (개명) — 매칭은 이름을 보지 않는다", () => {
    const plan = planRoster([row({ name: "개명후", classNo: 5 })], [재학생]);

    expect(plan.newStudents).toHaveLength(0);
    expect(plan.needsAttention).toHaveLength(0);
    expect(plan.reassign).toHaveLength(1);
    expect(plan.reassign[0]!.studentProfileId).toBe("sp-1");
  });

  it("이름·생년월일이 완전히 같아도 학생코드가 다르면 각각 다른 학생이다 — " +
    "동명이인이 같은 생일인 것이 이제 정상이다", () => {
    const 동명이인 = { ...재학생, studentProfileId: "sp-2", userId: "u-2", studentCode: "BBBB2222" };

    const plan = planRoster(
      [
        row({ studentCode: "AAAA1111", classNo: 5 }),
        row({ line: 3, studentCode: "BBBB2222", classNo: 6 }),
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
        row({ studentCode: "AAAA1111", name: "가", birthDate: "2010-01-01" }),
        row({ line: 3, studentCode: "BBBB2222", name: "나", birthDate: "2010-01-02" }),
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
    // 경고일 뿐 확정을 막지는 않는다.
    expect(plan.hasBlockingError).toBe(false);
  });

  it("문제가 없으면 확정을 막지 않는다", () => {
    const plan = planRoster([row({ classNo: 5 })], [재학생]);
    expect(plan.hasBlockingError).toBe(false);
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
});
