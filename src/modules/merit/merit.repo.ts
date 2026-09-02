import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  addKindPoints,
  emptyKindTotals,
  withNetScore,
  type KindTotals,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
import type {
  CreateRuleInput,
  RecentAwardFilter,
  UpdateRuleInput,
} from "./merit.schema";

export { findCurrentYearForUpdate } from "@/modules/academic-year/academic-year.repo";

export async function createRule(
  input: CreateRuleInput,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.meritRule.create({
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
}

export async function findRule(id: string, db: DbClient = prisma) {
  return db.meritRule.findUnique({
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
      updatedAt: true,
    },
  });
}

type MeritRuleSnapshot = NonNullable<Awaited<ReturnType<typeof findRule>>>;

/* 규정 삭제와 부여는 같은 행 잠금으로 직렬화한다. */
export async function findRuleForUpdate(
  id: string,
  db: DbClient,
): Promise<MeritRuleSnapshot | null> {
  const rows = await db.$queryRaw<MeritRuleSnapshot[]>`
    SELECT
      "id",
      "track",
      "kind",
      "label",
      "points",
      "category",
      "description",
      "active",
      "updatedAt"
    FROM "MeritRule"
    WHERE "id" = ${id}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function updateRule(
  id: string,
  data: Omit<UpdateRuleInput, "ruleId" | "updatedAt">,
  expectedUpdatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const { count } = await db.meritRule.updateMany({
    where: { id, updatedAt: expectedUpdatedAt },
    data: {
      label: data.label,
      points: data.points,
      category: data.category,
      description: data.description,
    },
  });
  return count === 1;
}

export async function markRuleDeleted(
  id: string,
  expectedUpdatedAt: Date,
  db: DbClient = prisma,
): Promise<number> {
  const { count } = await db.meritRule.updateMany({
    where: { id, active: true, updatedAt: expectedUpdatedAt },
    data: { active: false },
  });
  return count;
}

const KIND_ORDER: Record<string, number> = { MERIT: 0, DEMERIT: 1, OFFSET: 2 };

function byKindCategoryPoints<
  T extends { kind: string; category: string | null; points: number },
>(a: T, b: T): number {
  const kind = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  if (kind !== 0) return kind;

  const ca = a.category ?? "";
  const cb = b.category ?? "";
  if (ca !== cb) {
    if (ca === "") return 1;
    if (cb === "") return -1;
    const category = ca.localeCompare(cb, "ko");
    if (category !== 0) return category;
  }

  return a.points - b.points;
}

export async function listRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: [{ label: "asc" }],
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
      updatedAt: true,
    },
  });

  return rules.sort(byKindCategoryPoints);
}

export async function listActiveRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: { label: "asc" },
    select: { id: true, kind: true, label: true, points: true, category: true },
  });
  return rules.sort(byKindCategoryPoints);
}

const THRESHOLD_SELECT = {
  track: true,
  warn: true,
  danger: true,
  updatedAt: true,
  updatedByName: true,
} as const;

export async function listThresholds(db: DbClient = prisma) {
  return db.meritThreshold.findMany({
    select: THRESHOLD_SELECT,
  });
}

export async function findThreshold(track: MeritTrack, db: DbClient = prisma) {
  return db.meritThreshold.findUnique({
    where: { track },
    select: THRESHOLD_SELECT,
  });
}

type ThresholdWrite = {
  track: MeritTrack;
  warn: number;
  danger: number;
  updatedByUserId: string;
  updatedByName: string;
};

export async function createThreshold(
  data: ThresholdWrite,
  db: DbClient = prisma,
): Promise<boolean> {
  try {
    await db.meritThreshold.create({ data });
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return false;
    }
    throw error;
  }
}

export async function updateThreshold(
  data: ThresholdWrite,
  expectedUpdatedAt: Date,
  db: DbClient = prisma,
): Promise<boolean> {
  const { track, ...rest } = data;
  const { count } = await db.meritThreshold.updateMany({
    where: { track, updatedAt: expectedUpdatedAt },
    data: rest,
  });
  return count === 1;
}

type NewAward = {
  studentProfileId: string;
  year: number;
  ruleId: string;
  track: string;
  kind: string;
  label: string;
  points: number;
  occurredOn: Date;
  note: string | null;
  awardedByUserId: string;
  awardedByName: string;
};

export async function createAward(
  data: NewAward,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.meritAward.create({ data, select: { id: true } });
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
      studentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

export async function cancelAward(
  id: string,
  by: { userId: string; name: string; reason: string },
  db: DbClient = prisma,
): Promise<number> {
  const result = await db.meritAward.updateMany({
    where: { id, status: "ACTIVE" },
    data: {
      status: "CANCELLED",
      cancelledByUserId: by.userId,
      cancelledByName: by.name,
      cancelledAt: new Date(),
      cancelReason: by.reason,
    },
  });
  return result.count;
}

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
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
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
      occurredOn: true,
      createdAt: true,
    },
  });
}

export async function totals(params: {
  studentProfileId: string;
  track: MeritTrack;
  year: number | null;
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: activeAwardWhere({
      studentProfileId: params.studentProfileId,
      track: params.track,
      totalsYear: params.year,
    }),
    _sum: { points: true },
  });
}

export async function findStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findFirst({
    where: { userId },
    select: { id: true, user: { select: { name: true } } },
  });
}

export async function findAwardableStudent(
  id: string,
  year: number,
  db: DbClient = prisma,
) {
  return db.studentProfile.findFirst({
    where: { id, enrollments: { some: { year, status: "ENROLLED" } } },
    select: { id: true, user: { select: { name: true } } },
  });
}

export async function createAwards(
  items: NewAward[],
  db?: DbClient,
): Promise<{ id: string }[]> {
  const run = async (client: DbClient) => {
    // 일괄 부여는 모든 기록에 같은 createdAt을 쓴다.
    const createdAt = new Date();

    const created: { id: string }[] = [];
    for (const item of items) {
      created.push(
        await client.meritAward.create({
          data: { ...item, createdAt },
          select: { id: true },
        }),
      );
    }
    return created;
  };

  if (db) return run(db);

  return withTransaction(
    run,
    { timeout: 30_000, maxWait: 5_000 },
  );
}

export async function findAwardableStudents(
  ids: string[],
  year: number,
  db: DbClient = prisma,
) {
  return db.studentProfile.findMany({
    where: {
      id: { in: ids },
      enrollments: { some: { year, status: "ENROLLED" } },
    },
    select: { id: true, user: { select: { name: true } } },
  });
}

function foldByStudent(
  sums: {
    studentProfileId: string;
    kind: string;
    _sum: { points: number | null };
  }[],
): Map<string, KindTotals> {
  const byStudent = new Map<string, KindTotals>();
  for (const row of sums) {
    const totals = byStudent.get(row.studentProfileId) ?? emptyKindTotals();
    addKindPoints(totals, row.kind, row._sum.points ?? 0);
    byStudent.set(row.studentProfileId, totals);
  }
  return byStudent;
}

export async function listClassRoster(params: {
  year: number;
  track: MeritTrack;
  totalsYear: number | null;
  grade?: number;
  classNo?: number;
}) {
  const inClass =
    params.grade === undefined && params.classNo === undefined
      ? {}
      : {
          ...(params.grade === undefined ? {} : { grade: params.grade }),
          ...(params.classNo === undefined ? {} : { classNo: params.classNo }),
        };

  const enrollments = await prisma.enrollment.findMany({
    where: {
      year: params.year,
      status: "ENROLLED",
      ...inClass,
    },
    orderBy: [
      { grade: "asc" },
      { classNo: "asc" },
      { number: "asc" },
    ],
    select: {
      grade: true,
      classNo: true,
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
    where: activeAwardWhere({
      track: params.track,
      totalsYear: params.totalsYear,
      rosterYear: params.year,
      studentProfileIds: ids,
    }),
    _sum: { points: true },
  });

  const byStudent = foldByStudent(sums);

  return enrollments.map((e) => ({
    studentProfileId: e.studentProfile.id,
    studentCode: e.studentProfile.studentCode,
    name: e.studentProfile.user.name,
    grade: e.grade,
    classNo: e.classNo,
    number: e.number,
    ...withNetScore(byStudent.get(e.studentProfile.id) ?? emptyKindTotals()),
  }));
}

export async function searchStudents(
  query: string,
  year: number,
  options: {
    includeRemoved: boolean;
    studentNumber?: { grade: number; classNo: number; number: number };
  },
) {
  const { studentNumber } = options;

  return prisma.studentProfile.findMany({
    where: {
      user: { role: "STUDENT" },
      ...(options.includeRemoved
        ? {}
        : { enrollments: { some: { year, status: "ENROLLED" } } }),
      OR: [
        { user: { name: { contains: query, mode: "insensitive" } } },
        { studentCode: { contains: query, mode: "insensitive" } },
        ...(studentNumber
          ? [
              {
                enrollments: {
                  some: {
                    year,
                    grade: studentNumber.grade,
                    classNo: studentNumber.classNo,
                    number: studentNumber.number,
                  },
                },
              },
            ]
          : []),
      ],
    },
    take: 30,
    orderBy: [{ user: { name: "asc" } }, { id: "asc" }],
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });
}

export async function listAwardYears(studentProfileId: string): Promise<number[]> {
  const rows = await prisma.meritAward.findMany({
    where: { studentProfileId, track: "SCHOOL" },
    distinct: ["year"],
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return rows.map((r) => r.year);
}

export async function listChildren(parentUserId: string) {
  return prisma.parentStudent.findMany({
    where: { parentUserId },
    orderBy: [
      { student: { user: { name: "asc" } } },
      { student: { id: "asc" } },
    ],
    select: {
      student: { select: { id: true, user: { select: { name: true } } } },
    },
  });
}

// 학부모 연결만 판단하므로 deletedAt이나 재적으로 거르지 않는다.
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

export async function findStudentHeader(id: string, year: number) {
  const profile = await prisma.studentProfile.findFirst({
    where: { id },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
          status: true,
        },
      },
    },
  });
  if (!profile) return null;

  const enrollment = profile.enrollments[0];
  return {
    studentProfileId: profile.id,
    studentCode: profile.studentCode,
    name: profile.user.name,
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
    status: enrollment?.status ?? null,
    removed: enrollment?.status !== "ENROLLED",
  };
}

const RECENT_AWARD_SELECT = {
  id: true,
  year: true,
  kind: true,
  label: true,
  points: true,
  note: true,
  status: true,
  awardedByName: true,
  cancelledByName: true,
  cancelledAt: true,
  cancelReason: true,
  occurredOn: true,
  createdAt: true,
  studentProfile: {
    select: {
      id: true,
      user: { select: { name: true } },
      enrollments: {
        select: {
          year: true,
          grade: true,
          classNo: true,
          number: true,
        },
      },
    },
  },
} satisfies Prisma.MeritAwardSelect;

type RecentAwardRecord = Prisma.MeritAwardGetPayload<{
  select: typeof RECENT_AWARD_SELECT;
}>;

function recentAwardWhere(filter: RecentAwardFilter): Prisma.MeritAwardWhereInput {
  return {
    track: filter.track,
    ...(filter.kind ? { kind: filter.kind } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { label: { contains: filter.q, mode: "insensitive" } },
            { note: { contains: filter.q, mode: "insensitive" } },
            { awardedByName: { contains: filter.q, mode: "insensitive" } },
            {
              studentProfile: {
                user: { name: { contains: filter.q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
}

function toRecentAwardRow(row: RecentAwardRecord) {
  const enrollment = row.studentProfile.enrollments.find((e) => e.year === row.year);

  return {
    id: row.id,
    year: row.year,
    kind: row.kind,
    label: row.label,
    points: row.points,
    note: row.note,
    status: row.status,
    awardedByName: row.awardedByName,
    cancelledByName: row.cancelledByName,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    occurredOn: row.occurredOn,
    createdAt: row.createdAt,
    studentProfileId: row.studentProfile.id,
    studentName: row.studentProfile.user.name,
    grade: enrollment?.grade ?? null,
    classNo: enrollment?.classNo ?? null,
    number: enrollment?.number ?? null,
  };
}

export async function findRecentAwardPage(
  filter: RecentAwardFilter,
  skip: number,
  take: number,
) {
  const rows = await prisma.meritAward.findMany({
    where: recentAwardWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take,
    select: RECENT_AWARD_SELECT,
  });

  return rows.map(toRecentAwardRow);
}

export async function countRecentAwards(filter: RecentAwardFilter): Promise<number> {
  return prisma.meritAward.count({ where: recentAwardWhere(filter) });
}

export async function findRecentAwardsForExport(filter: RecentAwardFilter) {
  const rows = await prisma.meritAward.findMany({
    where: recentAwardWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: RECENT_AWARD_SELECT,
  });

  return rows.map(toRecentAwardRow);
}

type ActiveAwardScope =
  | {
      studentProfileId: string;
      rosterYear?: never;
      studentProfileIds?: never;
    }
  | {
      rosterYear: number;
      studentProfileIds?: string[];
      studentProfileId?: never;
    };

/* 통계는 rosterYear의 ENROLLED 학생만, 개인 이력은 학적과 무관하게 조회한다. */
function activeAwardWhere(
  params: {
    track: MeritTrack;
    totalsYear: number | null;
  } & ActiveAwardScope,
): Prisma.MeritAwardWhereInput {
  const population: Prisma.MeritAwardWhereInput =
    params.studentProfileId !== undefined
      ? { studentProfileId: params.studentProfileId }
      : {
          studentProfile: {
            enrollments: {
              some: { year: params.rosterYear, status: "ENROLLED" },
            },
          },
          ...(params.studentProfileIds === undefined
            ? {}
            : { studentProfileId: { in: params.studentProfileIds } }),
        };

  return {
    track: params.track,
    status: "ACTIVE",
    ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    ...population,
  };
}

export async function awardsByRule(params: {
  track: MeritTrack;
  totalsYear: number | null;
  rosterYear: number;
  studentProfileIds?: string[];
}) {
  const rows = await prisma.meritAward.groupBy({
    by: ["ruleId", "label", "kind"],
    where: activeAwardWhere({
      track: params.track,
      totalsYear: params.totalsYear,
      rosterYear: params.rosterYear,
      studentProfileIds: params.studentProfileIds,
    }),
    _count: { _all: true },
    _sum: { points: true },
  });

  const rules =
    rows.length === 0
      ? []
      : await prisma.meritRule.findMany({
          where: { id: { in: [...new Set(rows.map((row) => row.ruleId))] } },
          select: { id: true, label: true, category: true, active: true },
        });

  return { rows, rules };
}

export async function teacherTotals(params: {
  track: MeritTrack;
  totalsYear: number | null;
  rosterYear: number;
}) {
  const where = activeAwardWhere({
    track: params.track,
    totalsYear: params.totalsYear,
    rosterYear: params.rosterYear,
  });

  const [byUser, byName] = await Promise.all([
    prisma.meritAward.groupBy({
      by: ["awardedByUserId", "kind"],
      where: { ...where, awardedByUserId: { not: null } },
      _count: { _all: true },
      _sum: { points: true },
    }),
    prisma.meritAward.groupBy({
      by: ["awardedByName", "kind"],
      where: { ...where, awardedByUserId: null },
      _count: { _all: true },
      _sum: { points: true },
    }),
  ]);

  return { byUser, byName };
}

export async function findUserNames(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
}

export async function unusedRules(params: {
  track: MeritTrack;
  totalsYear: number | null;
}) {
  return prisma.meritRule.findMany({
    where: {
      track: params.track,
      active: true,
      awards: {
        none: {
          status: "ACTIVE",
          ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
        },
      },
    },
    select: { id: true, kind: true, label: true, points: true, category: true },
    orderBy: { label: "asc" },
  });
}

export async function trackTotals(params: {
  track: MeritTrack;
  totalsYear: number | null;
  rosterYear: number;
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: activeAwardWhere({
      track: params.track,
      totalsYear: params.totalsYear,
      rosterYear: params.rosterYear,
      studentProfileIds: params.studentProfileIds,
    }),
    _count: { _all: true },
    _sum: { points: true },
  });
}

export async function trackTotalsBetween(params: {
  track: MeritTrack;
  since: Date;
  until: Date;
  kinds: readonly MeritKind[];
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      kind: { in: [...params.kinds] },
      occurredOn: { gte: params.since, lt: params.until },
    },
    _count: { _all: true },
    _sum: { points: true },
  });
}

export async function demeritTotalsByStudent(params: {
  track: MeritTrack;
  totalsYear: number | null;
  rosterYear: number;
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.groupBy({
    by: ["studentProfileId"],
    where: {
      ...activeAwardWhere({
        track: params.track,
        totalsYear: params.totalsYear,
        rosterYear: params.rosterYear,
        studentProfileIds: params.studentProfileIds,
      }),
      kind: "DEMERIT",
    },
    _sum: { points: true },
  });
}

export async function findStudentsWithClass(ids: string[], year: number) {
  if (ids.length === 0) return [];

  return prisma.studentProfile.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year, status: "ENROLLED" },
        take: 1,
        select: {
          grade: true,
          classNo: true,
          number: true,
        },
      },
    },
  });
}

export async function listAwardsForChart(params: {
  track: MeritTrack;
  totalsYear: number | null;
  since?: Date;
  rosterYear: number;
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.findMany({
    where: {
      ...activeAwardWhere({
        track: params.track,
        totalsYear: params.totalsYear,
        rosterYear: params.rosterYear,
        studentProfileIds: params.studentProfileIds,
      }),
      ...(params.since ? { occurredOn: { gte: params.since } } : {}),
    },
    select: {
      occurredOn: true,
      kind: true,
      points: true,
      rule: { select: { category: true } },
    },
  });
}
