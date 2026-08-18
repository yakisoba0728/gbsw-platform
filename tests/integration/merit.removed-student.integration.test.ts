import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

/**
 * 명단에서 빠진(소프트 삭제된) 학생의 상벌점 — 감사 M-2.
 *
 * **목으로는 확인할 수 없는 부분이다.** 서비스 테스트는 repo가 돌려준 것을 그대로
 * 믿으므로 "어느 질의가 `user.deletedAt`을 보고 어느 질의가 안 보는가"는 실제
 * SQL이 돌아야만 드러난다. 그리고 그 경계가 이 변경의 전부다 —
 * **조회는 열고 부여는 막는다. 기본 목록에는 섞이지 않는다.**
 *
 * 소프트 삭제는 그 학년도 Enrollment도 실제로 지우지만(roster.repo), 여기서는
 * 일부러 재적 줄을 남겨 둔 채 `deletedAt`만 세운다 — 그래야 반 명단·통계에서
 * 이 학생을 빼는 것이 오로지 `deletedAt` 조건임이 증명된다. 재적까지 지워 두면
 * 조건을 지워도 테스트가 통과한다.
 *
 * 감사로그는 목으로 막는다 (recordAudit이 요청 컨텍스트를 읽는다).
 */
vi.mock("@/core/audit/audit", () => ({ recordAudit: vi.fn() }));

const repo = await import("@/modules/merit/merit.repo");
const service = await import("@/modules/merit/award.service");

const YEAR = 2026;
const GRADE = 3;
const CLASS_NO = 2;
const OCCURRED_ON = new Date("2026-06-12T00:00:00+09:00");
const NOW = new Date("2026-08-16T10:00:00+09:00");
const REMOVED_AT = new Date("2026-08-01T00:00:00+09:00");

/** 검색이 이 둘만 잡도록 흔치 않은 조각을 넣는다. */
const NAME_STEM = "탈퇴검증";

const made = {
  users: [] as string[],
  profiles: [] as string[],
  rules: [] as string[],
  classes: [] as string[],
};

const admin = {
  id: "merit-removed-admin",
  name: "통합테스트관리자",
  email: "merit-removed-admin@example.invalid",
  role: "ADMIN" as const,
  status: "ACTIVE",
  deletedAt: null,
  mustChangePassword: false,
};

const student = {
  ...admin,
  id: "merit-removed-student",
  email: "merit-removed-student@example.invalid",
  role: "STUDENT" as const,
};

let classId = "";
/** 명단에 남아 있는 학생 */
let stayingId = "";
/** 명단에서 빠진 학생 */
let removedId = "";
let ruleId = "";

async function makeStudent(suffix: string, number: number) {
  const user = await prisma.user.create({
    data: {
      id: `merit-removed-u-${suffix}`,
      name: `${NAME_STEM}${suffix}`,
      email: `merit-removed-${suffix}@example.invalid`,
      phone: "010-0000-0000",
      role: "STUDENT",
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      studentCode: `RMTEST${suffix}`,
      birthDate: new Date("2009-03-02"),
    },
  });
  await prisma.enrollment.create({
    data: {
      studentProfileId: profile.id,
      year: YEAR,
      classId,
      number,
      status: "ENROLLED",
    },
  });
  made.users.push(user.id);
  made.profiles.push(profile.id);
  return profile.id;
}

async function giveDemerit(studentProfileId: string, points: number) {
  return prisma.meritAward.create({
    data: {
      studentProfileId,
      year: YEAR,
      ruleId,
      track: "SCHOOL",
      kind: "DEMERIT",
      label: "무단 외출",
      points,
      occurredOn: OCCURRED_ON,
      note: null,
      awardedByUserId: admin.id,
      awardedByName: admin.name,
      batchId: null,
    },
  });
}

beforeAll(async () => {
  for (const actor of [admin, student]) {
    await prisma.user.upsert({
      where: { id: actor.id },
      create: {
        id: actor.id,
        name: actor.name,
        email: actor.email,
        phone: "010-0000-0000",
        role: actor.role,
      },
      update: {},
    });
    made.users.push(actor.id);
  }

  await prisma.academicYear.upsert({
    where: { year: YEAR },
    create: { year: YEAR },
    update: {},
  });
  const current = await prisma.academicYear.findFirst({ where: { isCurrent: true } });
  if (current?.year !== YEAR) {
    await prisma.academicYear.updateMany({ data: { isCurrent: false } });
    await prisma.academicYear.update({
      where: { year: YEAR },
      data: { isCurrent: true },
    });
  }

  const schoolClass = await prisma.schoolClass.upsert({
    where: { year_grade_classNo: { year: YEAR, grade: GRADE, classNo: CLASS_NO } },
    create: { year: YEAR, grade: GRADE, classNo: CLASS_NO },
    update: {},
  });
  classId = schoolClass.id;
  made.classes.push(schoolClass.id);

  const rule = await prisma.meritRule.create({
    data: { track: "SCHOOL", kind: "DEMERIT", label: "무단 외출", points: 5 },
  });
  ruleId = rule.id;
  made.rules.push(rule.id);

  stayingId = await makeStudent("staying", 11);
  removedId = await makeStudent("removed", 12);

  await giveDemerit(stayingId, 5);
  await giveDemerit(removedId, 5);
  await giveDemerit(removedId, 5);

  // 명단에서 빠진다. **재적 줄은 남겨 둔다** (위 주석 참고).
  await prisma.user.update({
    where: { id: "merit-removed-u-removed" },
    data: { deletedAt: REMOVED_AT },
  });
});

afterAll(async () => {
  await prisma.meritAward.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.enrollment.deleteMany({
    where: { studentProfileId: { in: made.profiles } },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: made.profiles } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.meritRule.deleteMany({ where: { id: { in: made.rules } } });
  await prisma.schoolClass.deleteMany({ where: { id: { in: made.classes } } });
});

describe("조회는 열린다 — 상세·확인서·내보내기가 타는 경로", () => {
  it("머리글이 돌아오고 명단 제외일이 실려 있다", async () => {
    const header = await service.getStudentHeader(admin, removedId);

    expect(header).not.toBeNull();
    expect(header?.name).toBe(`${NAME_STEM}removed`);
    expect(header?.removedAt).toEqual(REMOVED_AT);
  });

  it("명단에 남아 있는 학생의 removedAt은 null이다", async () => {
    const header = await service.getStudentHeader(admin, stayingId);

    expect(header?.removedAt).toBeNull();
    expect(header?.grade).toBe(GRADE);
  });

  it("벌점 내역과 합계가 그대로 나온다 — 선도관리위원회 자료가 이것이다", async () => {
    const view = await service.getStudentMerit(admin, removedId, "SCHOOL");

    expect(view.awards).toHaveLength(2);
    expect(view.totals.demerit).toBe(10);
    expect(view.totals.net).toBe(-10);
  });

  it("학생·학부모는 이 경로로 남의 기록을 볼 수 없다", async () => {
    await expect(service.getStudentHeader(student, removedId)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      service.getStudentMerit(student, removedId, "SCHOOL"),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("검색 — 명시적으로 요청했을 때만 섞인다", () => {
  it("기본 검색에는 안 나온다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM);

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("요청하면 함께 나오고 removedAt으로 구분된다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM, {
      includeRemoved: true,
    });

    expect(new Set(rows.map((r) => r.studentProfileId))).toEqual(
      new Set([stayingId, removedId]),
    );

    const removed = rows.find((r) => r.studentProfileId === removedId);
    expect(removed?.removedAt).toEqual(REMOVED_AT);
    expect(rows.find((r) => r.studentProfileId === stayingId)?.removedAt).toBeNull();
  });

  it("학생코드로도 찾힌다", async () => {
    const rows = await service.searchStudents(admin, "RMTESTremoved", {
      includeRemoved: true,
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([removedId]);
  });

  it("관리자만 볼 수 있다 — 옵트인해도 학생은 막힌다", async () => {
    await expect(
      service.searchStudents(student, NAME_STEM, { includeRemoved: true }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

/**
 * 여기가 "기본은 지금과 같다"를 못 박는 자리다. 재적 줄이 그대로 남아 있으므로
 * 이 학생을 빼는 것은 오로지 `deletedAt` 조건이다.
 */
describe("기본 목록에는 섞이지 않는다", () => {
  it("반 명단에 안 나온다", async () => {
    const rows = await service.getClassRoster(admin, {
      grade: GRADE,
      classNo: CLASS_NO,
      track: "SCHOOL",
    });

    const ids = rows.map((r) => r.studentProfileId);
    expect(ids).toContain(stayingId);
    expect(ids).not.toContain(removedId);
  });

  it("기준 초과 명단(벌점 합계)에 안 나온다", async () => {
    const rows = await repo.demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: YEAR,
      studentProfileIds: [stayingId, removedId],
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("반별 요약의 인원에도 안 든다", async () => {
    const summaries = await repo.classSummaries({
      year: YEAR,
      track: "SCHOOL",
      totalsYear: YEAR,
    });
    const mine = summaries.find(
      (row) => row.grade === GRADE && row.classNo === CLASS_NO,
    );

    // 이 반에 넣은 것은 둘이지만 하나는 명단에서 빠졌다.
    expect(mine?.students).toBe(1);
    expect(mine?.demerit).toBe(5);
  });
});

describe("부여는 열지 않는다", () => {
  it("findAwardableStudent는 명단에서 빠진 학생을 못 찾는다", async () => {
    expect(await repo.findAwardableStudent(removedId)).toBeNull();
    expect(await repo.findAwardableStudent(stayingId)).not.toBeNull();
  });

  it("단건 부여는 STUDENT_NOT_FOUND로 거부된다", async () => {
    await expect(
      service.awardMerit(
        admin,
        { studentProfileId: removedId, ruleId, note: null },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    // 아무것도 안 들어갔다 — 처음 넣어 둔 두 건 그대로다.
    expect(
      await prisma.meritAward.count({ where: { studentProfileId: removedId } }),
    ).toBe(2);
  });

  it("일괄 부여는 한 명만 빠져도 묶음 전체를 거부한다", async () => {
    await expect(
      service.bulkAwardMerit(
        admin,
        {
          studentProfileIds: [stayingId, removedId],
          ruleId,
          note: null,
        },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: stayingId } }),
    ).toBe(1);
  });
});

/**
 * 이미 준 기록을 되돌리는 것은 부여와 다르다 — 잘못 준 벌점이 명단에서 빠졌다는
 * 이유로 영원히 남으면 안 된다. 취소 경로는 애초에 학생이 아니라 부여 행을 찾으므로
 * 이번 변경과 무관하게 열려 있다. 그 사실을 못 박아 둔다.
 */
describe("취소는 그대로 된다", () => {
  it("명단에서 빠진 학생의 기록도 취소할 수 있다", async () => {
    const award = await giveDemerit(removedId, 3);

    await service.cancelAward(admin, { awardId: award.id, reason: "오기입" });

    const row = await prisma.meritAward.findUnique({ where: { id: award.id } });
    expect(row?.status).toBe("CANCELLED");

    // 합계에서 빠지고 내역에는 남는다 — 다른 학생과 같은 규칙이다.
    const view = await service.getStudentMerit(admin, removedId, "SCHOOL");
    expect(view.totals.demerit).toBe(10);
    expect(view.awards).toHaveLength(3);
  });
});
