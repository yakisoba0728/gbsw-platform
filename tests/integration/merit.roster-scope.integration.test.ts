import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

/**
 * 명단 범위 — 전교·학년·반.
 *
 * **목으로는 확인할 수 없는 부분이다.** repo 테스트는 prisma에 넘긴 인자만 보므로
 * "반이 없는 학생(`classId = null`)이 전교 명단에 남는가"와 "학년→반→번호 정렬이
 * 반 없는 줄을 어디에 세우는가"는 실제 SQL이 돌아야 드러난다. 둘 다 to-one 관계를
 * 거치는 조건·정렬이라 Prisma가 LEFT JOIN을 쓰는지 INNER JOIN을 쓰는지에 그대로
 * 달려 있다 — 여기서 INNER가 되면 반 미배정 학생이 화면에서 조용히 사라진다.
 *
 * 감사로그는 목으로 막는다 (recordAudit이 요청 컨텍스트를 읽는다).
 */
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));

const repo = await import("@/modules/merit/merit.repo");

const YEAR = 2026;
const PREFIX = "merit-scope";

const made = {
  users: [] as string[],
  profiles: [] as string[],
  classes: [] as string[],
};

/** 학년·반·번호. classNo가 null이면 반 없는 학생이다. */
type Spec = { suffix: string; grade: number | null; classNo: number | null; number: number };

const SPECS: Spec[] = [
  { suffix: "3-1-5", grade: 3, classNo: 1, number: 5 },
  { suffix: "1-2-1", grade: 1, classNo: 2, number: 1 },
  { suffix: "1-1-9", grade: 1, classNo: 1, number: 9 },
  { suffix: "1-1-2", grade: 1, classNo: 1, number: 2 },
  { suffix: "none", grade: null, classNo: null, number: 1 },
];

const byName = new Map<string, string>();

async function classIdFor(grade: number, classNo: number) {
  const schoolClass = await prisma.schoolClass.upsert({
    where: { year_grade_classNo: { year: YEAR, grade, classNo } },
    create: { year: YEAR, grade, classNo },
    update: {},
  });
  if (!made.classes.includes(schoolClass.id)) made.classes.push(schoolClass.id);
  return schoolClass.id;
}

beforeAll(async () => {
  await prisma.academicYear.upsert({
    where: { year: YEAR },
    create: { year: YEAR },
    update: {},
  });

  for (const spec of SPECS) {
    const user = await prisma.user.create({
      data: {
        id: `${PREFIX}-u-${spec.suffix}`,
        name: `범위검증${spec.suffix}`,
        email: `${PREFIX}-${spec.suffix}@example.invalid`,
        phone: "010-0000-0000",
        role: "STUDENT",
      },
    });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        studentCode: `SCOPE${spec.suffix}`,
        birthDate: new Date("2009-03-02"),
      },
    });
    await prisma.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year: YEAR,
        classId:
          spec.grade === null || spec.classNo === null
            ? null
            : await classIdFor(spec.grade, spec.classNo),
        // 반 없는 줄에 번호를 남겨 둔다 — 번호만으로 정렬하면 맨 앞에 서서
        // 학년·반 정렬이 실제로 걸렸는지가 드러난다.
        number: spec.number,
        status: "ENROLLED",
      },
    });
    made.users.push(user.id);
    made.profiles.push(profile.id);
    byName.set(user.name, profile.id);
  }
});

afterAll(async () => {
  await prisma.enrollment.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: made.profiles } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.schoolClass.deleteMany({ where: { id: { in: made.classes } } });
});

/** 이 테스트가 만든 학생만 남긴다 — DB에 다른 학년도 데이터가 있을 수 있다. */
function mine<T extends { name: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.name.startsWith("범위검증"));
}

describe("listClassRoster 범위", () => {
  it("범위를 안 주면 전교다 — 반 없는 학생도 남는다", async () => {
    const rows = mine(
      await repo.listClassRoster({ year: YEAR, track: "SCHOOL", totalsYear: YEAR }),
    );

    expect(rows).toHaveLength(SPECS.length);
    expect(rows.map((row) => row.name)).toContain("범위검증none");
  });

  it("반 없는 학생의 학년·반은 null이다 — 화면이 「미배정」으로 채운다", async () => {
    const rows = mine(
      await repo.listClassRoster({ year: YEAR, track: "SCHOOL", totalsYear: YEAR }),
    );
    const unassigned = rows.find((row) => row.name === "범위검증none");

    expect(unassigned?.grade).toBeNull();
    expect(unassigned?.classNo).toBeNull();
  });

  it("학년→반→번호 순으로 선다", async () => {
    const rows = mine(
      await repo.listClassRoster({ year: YEAR, track: "SCHOOL", totalsYear: YEAR }),
    );

    // 반 없는 줄은 맨 뒤다 (Postgres asc = NULLS LAST). 번호만으로 세웠다면
    // 1번인 이 학생이 맨 앞에 섰을 것이다.
    expect(rows.map((row) => row.name)).toEqual([
      "범위검증1-1-2",
      "범위검증1-1-9",
      "범위검증1-2-1",
      "범위검증3-1-5",
      "범위검증none",
    ]);
  });

  it("학년만 주면 그 학년 전체다 — 반 없는 학생은 빠진다", async () => {
    const rows = mine(
      await repo.listClassRoster({
        year: YEAR,
        track: "SCHOOL",
        totalsYear: YEAR,
        grade: 1,
      }),
    );

    expect(rows.map((row) => row.name)).toEqual([
      "범위검증1-1-2",
      "범위검증1-1-9",
      "범위검증1-2-1",
    ]);
  });

  it("학년·반을 주면 그 반이다", async () => {
    const rows = mine(
      await repo.listClassRoster({
        year: YEAR,
        track: "SCHOOL",
        totalsYear: YEAR,
        grade: 1,
        classNo: 1,
      }),
    );

    expect(rows.map((row) => row.name)).toEqual(["범위검증1-1-2", "범위검증1-1-9"]);
  });
});
