import { prisma } from "@/core/db/client";
import type { MeritTrack } from "@/core/authz/merit-track";
import type { CreateRuleInput, UpdateRuleInput } from "./merit.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

// ── 규정 ──────────────────────────────────────────────────────

export async function createRule(input: CreateRuleInput): Promise<{ id: string }> {
  const rule = await prisma.meritRule.create({
    data: {
      track: input.track,
      kind: input.kind,
      label: input.label,
      points: input.points,
      category: input.category,
      description: input.description,
    },
    select: { id: true },
  });
  return rule;
}

export async function findRule(id: string) {
  return prisma.meritRule.findUnique({
    where: { id },
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
    },
  });
}

/** track·kind는 인자에 없다 — 생성 시 고정이다. */
export async function updateRule(
  id: string,
  data: Omit<UpdateRuleInput, "ruleId">,
): Promise<void> {
  await prisma.meritRule.update({
    where: { id },
    data: {
      label: data.label,
      points: data.points,
      category: data.category,
      description: data.description,
    },
  });
}

export async function deactivateRule(id: string): Promise<void> {
  await prisma.meritRule.update({ where: { id }, data: { active: false } });
}

/** 비활성 포함 전부. 규정 관리 화면이 쓴다. */
export async function listRules(track: MeritTrack) {
  return prisma.meritRule.findMany({
    where: { track },
    orderBy: [{ active: "desc" }, { kind: "asc" }, { points: "asc" }],
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
    },
  });
}

/** 부여 화면의 선택지. 비활성은 빠진다. */
export async function listActiveRules(track: MeritTrack) {
  return prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: [{ kind: "asc" }, { points: "asc" }],
    select: { id: true, kind: true, label: true, points: true, category: true },
  });
}

// ── 부여 ──────────────────────────────────────────────────────

export type NewAward = {
  studentProfileId: string;
  year: number;
  ruleId: string;
  track: string;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  awardedByUserId: string;
  awardedByName: string;
  batchId: string | null;
};

export async function createAward(data: NewAward): Promise<{ id: string }> {
  return prisma.meritAward.create({ data, select: { id: true } });
}

export async function findAward(id: string) {
  return prisma.meritAward.findUnique({
    where: { id },
    select: {
      id: true,
      studentProfileId: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      status: true,
    },
  });
}

export async function cancelAward(
  id: string,
  by: { userId: string; name: string; reason: string },
): Promise<void> {
  await prisma.meritAward.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledByUserId: by.userId,
      cancelledByName: by.name,
      cancelledAt: new Date(),
      cancelReason: by.reason,
    },
  });
}

/**
 * 한 학생의 내역. **year가 null이면 학년도 조건이 붙지 않는다** — 기숙사(누적)다.
 * 취소된 기록도 돌려준다 (화면에 취소 표시로 남아야 한다).
 */
export async function listAwards(params: {
  studentProfileId: string;
  track: MeritTrack;
  year: number | null;
}) {
  return prisma.meritAward.findMany({
    where: {
      studentProfileId: params.studentProfileId,
      track: params.track,
      ...(params.year === null ? {} : { year: params.year }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      year: true,
      kind: true,
      label: true,
      points: true,
      note: true,
      awardedByName: true,
      status: true,
      cancelledByName: true,
      cancelledAt: true,
      cancelReason: true,
      createdAt: true,
    },
  });
}

/**
 * 합계. **취소된 기록은 빠진다** (status: ACTIVE만).
 * year가 null이면 전체 누적 — 이것이 "기숙사는 누적"의 구현 전부다.
 */
export async function totals(params: {
  studentProfileId: string;
  track: MeritTrack;
  year: number | null;
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      studentProfileId: params.studentProfileId,
      track: params.track,
      status: "ACTIVE",
      ...(params.year === null ? {} : { year: params.year }),
    },
    _sum: { points: true },
  });
}

// ── 학생 찾기 ─────────────────────────────────────────────────

/** 세션 userId → 학생 신원. 소프트 삭제된 계정은 없는 것으로 친다. */
export async function findStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findFirst({
    where: { userId, user: { deletedAt: null } },
    select: { id: true, user: { select: { name: true } } },
  });
}

export async function findStudentProfileById(id: string) {
  return prisma.studentProfile.findFirst({
    where: { id, user: { deletedAt: null } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { id: true, name: true } },
    },
  });
}

// ── 일괄 부여 ─────────────────────────────────────────────────

/**
 * 여러 건을 **한 트랜잭션으로** 넣는다. 절반만 들어간 상태를 만들지 않는다.
 * createMany를 쓰지 않는 이유: 감사로그를 건별로 남기려면 각 행의 id가 필요한데
 * createMany는 id를 돌려주지 않는다.
 */
export async function createAwards(items: NewAward[]): Promise<{ id: string }[]> {
  return prisma.$transaction(
    async (tx) => {
      const created: { id: string }[] = [];
      for (const item of items) {
        created.push(
          await tx.meritAward.create({ data: item, select: { id: true } }),
        );
      }
      return created;
    },
    // 100명 × 1문장. 기본 5초로도 충분하지만 느린 디스크에서 여유를 둔다.
    { timeout: 30_000, maxWait: 5_000 },
  );
}

// ── 목록 조회 ─────────────────────────────────────────────────

/**
 * 그 학년도 그 반의 재학생 + 트랙별 합계.
 *
 * 학생 목록과 합계를 따로 질의해 애플리케이션에서 잇는다 — groupBy로는
 * "기록이 하나도 없는 학생"이 결과에서 빠져 반 명단에 구멍이 생긴다.
 */
export async function listClassRoster(params: {
  year: number;
  grade: number;
  classNo: number;
  track: MeritTrack;
  /** 합계를 셀 학년도. null이면 전체 누적(기숙사). */
  totalsYear: number | null;
}) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      year: params.year,
      status: "ENROLLED",
      schoolClass: { grade: params.grade, classNo: params.classNo },
      studentProfile: { user: { deletedAt: null } },
    },
    orderBy: { number: "asc" },
    select: {
      number: true,
      studentProfile: {
        select: { id: true, studentCode: true, user: { select: { name: true } } },
      },
    },
  });

  const ids = enrollments.map((e) => e.studentProfile.id);
  if (ids.length === 0) return [];

  const sums = await prisma.meritAward.groupBy({
    by: ["studentProfileId", "kind"],
    where: {
      studentProfileId: { in: ids },
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _sum: { points: true },
  });

  return enrollments.map((e) => {
    const mine = sums.filter((s) => s.studentProfileId === e.studentProfile.id);
    const merit =
      mine.find((s) => s.kind === "MERIT")?._sum.points ?? 0;
    const demerit =
      mine.find((s) => s.kind === "DEMERIT")?._sum.points ?? 0;
    return {
      studentProfileId: e.studentProfile.id,
      studentCode: e.studentProfile.studentCode,
      name: e.studentProfile.user.name,
      number: e.number,
      merit,
      demerit,
      net: merit - demerit,
    };
  });
}

/** 이름 또는 학생코드로 찾는다. 30명에서 자른다. */
export async function searchStudents(query: string, year: number) {
  return prisma.studentProfile.findMany({
    where: {
      user: { deletedAt: null, role: "STUDENT" },
      OR: [
        { user: { name: { contains: query, mode: "insensitive" } } },
        { studentCode: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 30,
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          status: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });
}

/** 이 학생에게 기록이 있는 학년도들 (내림차순). 학년도 선택지에 쓴다.
 * 교내(SCHOOL)만 학년도 개념이 있다 — 기숙사는 누적이라 조건에 넣지 않는다. */
export async function listAwardYears(studentProfileId: string): Promise<number[]> {
  const rows = await prisma.meritAward.findMany({
    where: { studentProfileId, track: "SCHOOL" },
    distinct: ["year"],
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return rows.map((r) => r.year);
}

/** 학부모의 자녀들. ParentStudent 연결이 곧 권한이다. */
export async function listChildren(parentUserId: string) {
  return prisma.parentStudent.findMany({
    where: { parentUserId, student: { user: { deletedAt: null } } },
    select: {
      student: { select: { id: true, user: { select: { name: true } } } },
    },
  });
}

/** 이 학부모와 이 학생이 실제로 연결되어 있는가. 소유권 검사의 전부다. */
export async function isChildOf(
  parentUserId: string,
  studentProfileId: string,
): Promise<boolean> {
  const link = await prisma.parentStudent.findFirst({
    where: { parentUserId, studentId: studentProfileId },
    select: { id: true },
  });
  return link !== null;
}
