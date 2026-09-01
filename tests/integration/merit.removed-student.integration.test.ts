import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";

/**
 * 명단에서 빠진 학생의 상벌점 — 감사 M-2 · C-01 · D-03.
 *
 * **목으로는 확인할 수 없는 부분이다.** 서비스 테스트는 repo가 돌려준 것을 그대로
 * 믿으므로 "어느 질의가 재적을 보고 어느 질의가 안 보는가"는 실제 SQL이 돌아야만
 * 드러난다. 그리고 그 경계가 이 파일의 전부다 —
 * **조회는 열고 부여는 막는다. 기본 목록에는 섞이지 않는다.**
 *
 * ## 픽스처가 운영 경로를 흉내 낸다
 *
 * 예전 판은 `user.deletedAt`을 손으로 세우고 그것이 걸리는지 봤다. **그 값을 채우는
 * 코드는 운영에 하나도 없다** — 명단 반영(`roster.repo.applyRoster`)과 학생 표 저장
 * (`enrollment.repo.applyAll`)은 퇴학·전학 학생에게 **비재학 학적 + 계정 INACTIVE**를
 * 남기고 `deletedAt`은 오히려 null로 지운다. 그래서 옛 픽스처는 통과하는데 운영에서는
 * 퇴학생에게 상벌점이 그대로 부여됐다. 이 파일은 그 회귀를 잡는 자리다.
 *
 * 그래서 여기서 만드는 상태는 셋이다.
 *   - `stayingId`   재학. 비교 기준.
 *   - `removedId`   퇴학. 계정은 INACTIVE, `deletedAt`은 null.
 *                   **반·번호는 일부러 남겨 둔다** — 그래야 이 학생을 반 명단·통계에서
 *                   빼는 것이 오로지 `status` 조건임이 증명된다(반을 비워 두면 조건을
 *                   지워도 테스트가 통과한다). 이 상태는 실제로 도달 가능하다:
 *                   사용자 상세 편집은 재적을 upsert하면서 `status`를 건드리지 않는다
 *                   (`admin-user.repo.updateUser`).
 *   - `noRowId`     그 학년도 재적 줄이 아예 없다. 학년도가 막 넘어가고 명단 반영
 *                   전이면 전교가 이 상태다 — `some`이 없는 줄에 걸리지 않는다는 것을
 *                   부여 게이트가 지켜야 한다.
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

/** 검색이 이 셋만 잡도록 흔치 않은 조각을 넣는다. */
const NAME_STEM = "탈퇴검증";

const made = {
  users: [] as string[],
  profiles: [] as string[],
  rules: [] as string[],
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

/** 명단에 남아 있는 학생 */
let stayingId = "";
/** 퇴학 — 명단에서 빠졌다 */
let removedId = "";
/** 그 학년도 재적 줄 자체가 없는 학생 */
let noRowId = "";
let ruleId = "";

/**
 * 학생 하나. `enrollment`가 null이면 그 학년도 재적 줄을 만들지 않는다.
 * 계정 상태까지 함께 받는다 — 비재학이면 명단 반영이 INACTIVE로 내리기 때문이다.
 */
async function makeStudent(
  suffix: string,
  accountStatus: string,
  enrollment: { status: string; withClass: boolean; number: number | null } | null,
) {
  const user = await prisma.user.create({
    data: {
      id: `merit-removed-u-${suffix}`,
      name: `${NAME_STEM}${suffix}`,
      email: `merit-removed-${suffix}@example.invalid`,
      phone: "010-0000-0000",
      role: "STUDENT",
      status: accountStatus,
      // 운영에서 이 값은 늘 null이다. 명단 반영이 오히려 지운다.
      deletedAt: null,
    },
  });
  const profile = await prisma.studentProfile.create({
    data: {
      userId: user.id,
      studentCode: `RMTEST${suffix}`,
      birthDate: new Date("2009-03-02"),
    },
  });
  if (enrollment) {
    await prisma.enrollment.create({
      data: {
        studentProfileId: profile.id,
        year: YEAR,
        grade: enrollment.withClass ? GRADE : null,
        classNo: enrollment.withClass ? CLASS_NO : null,
        number: enrollment.number,
        status: enrollment.status,
      },
    });
  }
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

  const rule = await prisma.meritRule.create({
    data: { track: "SCHOOL", kind: "DEMERIT", label: "무단 외출", points: 5 },
  });
  ruleId = rule.id;
  made.rules.push(rule.id);

  stayingId = await makeStudent("staying", "ACTIVE", {
    status: "ENROLLED",
    withClass: true,
    number: 11,
  });
  // 퇴학. 반·번호는 남겨 둔다 (위 주석 참고) — 계정만 잠긴다.
  removedId = await makeStudent("removed", "INACTIVE", {
    status: "EXPELLED",
    withClass: true,
    number: 12,
  });
  // 재적 줄 자체가 없다.
  noRowId = await makeStudent("norow", "ACTIVE", null);

  await giveDemerit(stayingId, 5);
  await giveDemerit(removedId, 5);
  await giveDemerit(removedId, 5);
  await giveDemerit(noRowId, 5);
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
});

describe("조회는 열린다 — 상세·확인서·내보내기가 타는 경로", () => {
  it("머리글이 돌아오고 학적과 removed가 실려 있다", async () => {
    const header = await service.getStudentHeader(admin, removedId);

    expect(header).not.toBeNull();
    expect(header?.name).toBe(`${NAME_STEM}removed`);
    expect(header?.status).toBe("EXPELLED");
    expect(header?.removed).toBe(true);
  });

  it("재적 줄이 없는 학생도 removed다", async () => {
    const header = await service.getStudentHeader(admin, noRowId);

    expect(header?.status).toBeNull();
    expect(header?.removed).toBe(true);
  });

  it("명단에 남아 있는 학생의 removed는 false다", async () => {
    const header = await service.getStudentHeader(admin, stayingId);

    expect(header?.removed).toBe(false);
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
  it("기본 검색에는 그 학년도 재적만 나온다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM);

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  it("요청하면 함께 나오고 removed로 구분된다", async () => {
    const rows = await service.searchStudents(admin, NAME_STEM, {
      includeRemoved: true,
    });

    expect(new Set(rows.map((r) => r.studentProfileId))).toEqual(
      new Set([stayingId, removedId, noRowId]),
    );

    const byId = new Map(rows.map((r) => [r.studentProfileId, r]));
    expect(byId.get(removedId)?.removed).toBe(true);
    expect(byId.get(removedId)?.status).toBe("EXPELLED");
    // 마지막 자리를 그대로 보이면 지금도 그 반인 것처럼 읽힌다 — 소속은 비운다.
    expect(byId.get(removedId)?.grade).toBeNull();
    expect(byId.get(noRowId)?.removed).toBe(true);
    expect(byId.get(noRowId)?.status).toBeNull();
    expect(byId.get(stayingId)?.removed).toBe(false);
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
 * 여기가 "기본은 명단 그대로다"를 못 박는 자리다. 퇴학생의 반·번호가 그대로
 * 남아 있으므로, 이 학생을 빼는 것은 오로지 `status: "ENROLLED"` 조건이다.
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
      rosterYear: YEAR,
      studentProfileIds: [stayingId, removedId, noRowId],
    });

    expect(rows.map((r) => r.studentProfileId)).toEqual([stayingId]);
  });

  /**
   * D-03. 기숙사는 누적이라 합계 학년도가 없다 — 재적 조건이 유일한 방어선이고,
   * 빠지면 졸업생이 사감의 명단에 영원히 남는다.
   */
  it("누적(totalsYear = null)으로 세도 명단에서 빠진 학생은 안 나온다", async () => {
    const rows = await repo.demeritTotalsByStudent({
      track: "SCHOOL",
      totalsYear: null,
      rosterYear: YEAR,
      studentProfileIds: [stayingId, removedId, noRowId],
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

    // 이 반에 반·번호를 든 학생은 둘이지만 하나는 퇴학이다.
    expect(mine?.students).toBe(1);
    expect(mine?.demerit).toBe(5);
  });
});

describe("부여는 열지 않는다", () => {
  it("findAwardableStudent는 재적이 아닌 학생을 못 찾는다", async () => {
    expect(await repo.findAwardableStudent(removedId, YEAR)).toBeNull();
    expect(await repo.findAwardableStudent(stayingId, YEAR)).not.toBeNull();
  });

  /** `some`은 없는 줄에 걸리지 않는다 — 학년도가 막 넘어간 상태다. */
  it("그 학년도 재적 줄이 없는 학생도 부여 대상이 아니다", async () => {
    expect(await repo.findAwardableStudent(noRowId, YEAR)).toBeNull();
  });

  /** 게이트는 학년도를 받는다 — 다른 해로 물으면 재학생도 안 걸린다. */
  it("다른 학년도로 물으면 재학생도 안 나온다", async () => {
    expect(await repo.findAwardableStudent(stayingId, YEAR - 1)).toBeNull();
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

  it("재적 줄이 없는 학생에게도 단건 부여가 막힌다", async () => {
    await expect(
      service.awardMerit(
        admin,
        { studentProfileId: noRowId, ruleId, note: null },
        NOW,
      ),
    ).rejects.toThrow("STUDENT_NOT_FOUND");

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: noRowId } }),
    ).toBe(1);
  });

  it("일괄 부여는 한 명만 빠져도 아무도 받지 않는다", async () => {
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

  /** 재학생에게는 그대로 들어간다 — 막는 것이 지나치게 넓지 않은지 함께 본다. */
  it("재학생에게는 부여된다", async () => {
    await service.awardMerit(
      admin,
      { studentProfileId: stayingId, ruleId, note: null },
      NOW,
    );

    expect(
      await prisma.meritAward.count({ where: { studentProfileId: stayingId } }),
    ).toBe(2);
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
