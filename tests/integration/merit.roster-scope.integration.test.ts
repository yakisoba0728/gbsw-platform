import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));

const repo = await import("@/modules/merit/merit.repo");

const YEAR = 2026;
const PREFIX = "merit-scope";

const made = {
  users: [] as string[],
  profiles: [] as string[],
};

type Spec = { suffix: string; grade: number | null; classNo: number | null; number: number };

const SPECS: Spec[] = [
  { suffix: "3-1-5", grade: 3, classNo: 1, number: 5 },
  { suffix: "1-2-1", grade: 1, classNo: 2, number: 1 },
  { suffix: "1-1-9", grade: 1, classNo: 1, number: 9 },
  { suffix: "1-1-2", grade: 1, classNo: 1, number: 2 },
  { suffix: "none", grade: null, classNo: null, number: 1 },
];

const byName = new Map<string, string>();

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
        grade: spec.grade,
        classNo: spec.classNo,
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
});

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
