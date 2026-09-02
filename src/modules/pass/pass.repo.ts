import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import {
  DECIDABLE_STATUSES,
  LIVE_STATUSES,
  type PassStatus,
  type PassType,
} from "@/core/authz/pass-type";
import { Prisma } from "@/generated/prisma/client";

export { findCurrentYearForUpdate } from "@/modules/academic-year/academic-year.repo";

function studentInclude(year: number) {
  return {
    select: {
      id: true,
      user: { select: { id: true, name: true, role: true } },
      enrollments: {
        where: { year },
        select: {
          grade: true,
          classNo: true,
          number: true,
        },
        take: 1,
      },
    },
  } satisfies Prisma.StudentProfileDefaultArgs;
}

export type PassWithStudent = Prisma.PassGetPayload<{
  include: { studentProfile: ReturnType<typeof studentInclude> };
}>;

type PassPage = { entries: PassWithStudent[]; total: number };

async function findPage(
  year: number,
  query: Pick<Prisma.PassFindManyArgs, "where" | "orderBy" | "skip" | "take">,
  db: DbClient,
): Promise<PassPage> {
  const [entries, total] = await Promise.all([
    db.pass.findMany({ ...query, include: { studentProfile: studentInclude(year) } }),
    db.pass.count({ where: query.where }),
  ]);
  return { entries, total };
}

type CreatePassData = {
  studentProfileId: string;
  type: PassType;
  status: PassStatus;
  startAt: Date;
  endAt: Date;
  destination: string;
  reason: string;
  requestedByUserId: string;
  requestedByName: string;
  consentedByUserId?: string | null;
  consentedByName?: string | null;
  consentedAt?: Date | null;
  consentByProxy?: boolean;
  consentNote?: string | null;
  decidedByUserId?: string | null;
  decidedByName?: string | null;
  decidedAt?: Date | null;
};

export async function createPass(
  data: CreatePassData,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  return db.pass.create({ data, select: { id: true } });
}

export async function findPass(passId: string, db: DbClient = prisma) {
  return db.pass.findUnique({ where: { id: passId } });
}

export async function findPassForVerify(
  passId: string,
  year: number,
  db: DbClient = prisma,
): Promise<PassWithStudent | null> {
  return db.pass.findUnique({
    where: { id: passId },
    include: { studentProfile: studentInclude(year) },
  });
}

export async function listForVerify(
  studentProfileId: string,
  now: Date,
  year: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return db.pass.findMany({
    where: {
      studentProfileId,
      endAt: { gte: new Date(now.getTime() - DAY_MS) },
      status: { in: [...LIVE_STATUSES] },
    },
    include: { studentProfile: studentInclude(year) },
    orderBy: { startAt: "asc" },
    take: 20,
  });
}

export async function findStudentForCard(
  studentProfileId: string,
  year: number,
  db: DbClient = prisma,
) {
  return db.studentProfile.findUnique({
    where: { id: studentProfileId },
    ...studentInclude(year),
  });
}

export async function listForStudent(
  studentProfileId: string,
  year: number,
  window: { skip: number; take: number },
  db: DbClient = prisma,
): Promise<PassPage> {
  return findPage(
    year,
    {
      where: { studentProfileId },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      skip: window.skip,
      take: window.take,
    },
    db,
  );
}

export async function listLiveForStudent(
  studentProfileId: string,
  now: Date,
  year: number,
  take: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: {
      studentProfileId,
      status: { in: [...LIVE_STATUSES] },
      endAt: { gt: now },
    },
    include: { studentProfile: studentInclude(year) },
    orderBy: [{ startAt: "desc" }, { id: "desc" }],
    take,
  });
}

export async function listPendingForAdmin(
  now: Date,
  year: number,
  db: DbClient = prisma,
): Promise<PassPage> {
  return findPage(
    year,
    {
      where: { status: { in: [...DECIDABLE_STATUSES] }, endAt: { gt: now } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 100,
    },
    db,
  );
}

export async function listActiveNow(
  now: Date,
  year: number,
  db: DbClient = prisma,
): Promise<PassPage> {
  return findPage(
    year,
    {
      where: { status: "APPROVED", startAt: { lte: now }, endAt: { gt: now } },
      orderBy: [{ endAt: "asc" }, { id: "asc" }],
      take: 200,
    },
    db,
  );
}

export async function listForParent(
  parentUserId: string,
  year: number,
  now: Date,
  window: { skip: number; take: number },
  db: DbClient = prisma,
): Promise<PassPage> {
  return findPage(
    year,
    {
      where: {
        studentProfile: { parents: { some: { parentUserId } } },
        NOT: { status: "REQUESTED", type: "OVERNIGHT", endAt: { gt: now } },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      skip: window.skip,
      take: window.take,
    },
    db,
  );
}

export async function listAwaitingParentConsent(
  parentUserId: string,
  now: Date,
  year: number,
  take: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: {
      status: "REQUESTED",
      type: "OVERNIGHT",
      endAt: { gt: now },
      studentProfile: { parents: { some: { parentUserId } } },
    },
    include: { studentProfile: studentInclude(year) },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take,
  });
}

export async function listEnrolledStudents(year: number, db: DbClient = prisma) {
  const enrollments = await db.enrollment.findMany({
    where: {
      year,
      status: "ENROLLED",
      studentProfile: {
        user: { role: "STUDENT", deletedAt: null, status: "ACTIVE" },
      },
    },
    select: {
      grade: true,
      classNo: true,
      number: true,
      studentProfile: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: [{ grade: "asc" }, { classNo: "asc" }, { number: "asc" }],
  });

  return enrollments.map((row) => ({
    id: row.studentProfile.id,
    name: row.studentProfile.user.name,
    grade: row.grade ?? null,
    classNo: row.classNo ?? null,
    number: row.number,
  }));
}

export async function findOverlapping(
  studentProfileId: string,
  startAt: Date,
  endAt: Date,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.pass.findFirst({
    where: {
      studentProfileId,
      status: { in: [...LIVE_STATUSES] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
}

/* User → StudentProfile 순으로 잠근 뒤 중복 조회와 생성을 수행한다. */
export async function lockStudentForPassCreation(
  studentProfileId: string,
  db: DbClient,
): Promise<boolean> {
  const users = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id"
    FROM "user" AS u
    WHERE u."id" = (
      SELECT sp."userId"
      FROM "StudentProfile" AS sp
      WHERE sp."id" = ${studentProfileId}
    )
    FOR UPDATE
  `;
  const user = users[0];
  if (!user) return false;

  const profiles = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentProfile"
    WHERE "id" = ${studentProfileId} AND "userId" = ${user.id}
    FOR UPDATE
  `;
  return profiles.length === 1;
}

export async function currentDatabaseTime(db: DbClient): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>`
    SELECT clock_timestamp() AS "now"
  `;
  const current = rows[0]?.now;
  if (!current) throw new Error("데이터베이스 시각을 읽지 못했습니다.");
  return current;
}

/* 잠금 순서는 AcademicYear → User → StudentProfile → Enrollment다. */
export async function lockEligibleStudentForPassCreation(
  studentProfileId: string,
  year: number,
  db: DbClient,
): Promise<boolean> {
  const users = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id"
    FROM "user" AS u
    INNER JOIN "StudentProfile" AS sp ON sp."userId" = u."id"
    WHERE sp."id" = ${studentProfileId}
      AND u."role" = 'STUDENT'
      AND u."status" = 'ACTIVE'
      AND u."deletedAt" IS NULL
    FOR UPDATE OF u
  `;
  const user = users[0];
  if (!user) return false;

  const profiles = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentProfile"
    WHERE "id" = ${studentProfileId} AND "userId" = ${user.id}
    FOR UPDATE
  `;
  if (profiles.length !== 1) return false;

  const enrollments = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Enrollment"
    WHERE "studentProfileId" = ${studentProfileId}
      AND "year" = ${year}
      AND "status" = 'ENROLLED'
    FOR UPDATE
  `;
  return enrollments.length === 1;
}

export async function transition(
  passId: string,
  from: readonly PassStatus[],
  data: Prisma.PassUncheckedUpdateManyInput,
  db: DbClient = prisma,
): Promise<number> {
  const { count } = await db.pass.updateMany({
    where: { id: passId, status: { in: [...from] } },
    data,
  });
  return count;
}

const UNEXPIRED_TRANSITION_COLUMNS = {
  status: "status",
  consentByProxy: "consentByProxy",
  consentedByUserId: "consentedByUserId",
  consentedByName: "consentedByName",
  consentedAt: "consentedAt",
  consentNote: "consentNote",
  decidedByUserId: "decidedByUserId",
  decidedByName: "decidedByName",
  decidedAt: "decidedAt",
  decisionNote: "decisionNote",
} as const;

type UnexpiredTransitionData = Partial<
  Record<keyof typeof UNEXPIRED_TRANSITION_COLUMNS, string | boolean | Date | null>
>;

export type UnexpiredTransitionOutcome = "UPDATED" | "EXPIRED" | "UNCHANGED";

export async function transitionUnexpired(
  passId: string,
  from: readonly PassStatus[],
  data: UnexpiredTransitionData,
  db?: DbClient,
): Promise<UnexpiredTransitionOutcome> {
  if (from.length === 0) return "UNCHANGED";

  const assignments = Object.entries(data)
    .filter((entry): entry is [keyof UnexpiredTransitionData, string | boolean | Date | null] =>
      entry[1] !== undefined,
    )
    .map(([field, value]) => {
      const column = UNEXPIRED_TRANSITION_COLUMNS[field];
      return Prisma.sql`${Prisma.raw(`"${column}"`)} = ${value}`;
    });

  if (assignments.length === 0) return "UNCHANGED";

  const run = async (tx: DbClient) => {
    // 행 잠금을 별도 문장으로 얻은 뒤 clock_timestamp로 만료를 판정한다.
    const locked = await tx.$queryRaw<
      Array<{ id: string; status: string; expired: boolean }>
    >`
      SELECT
        "id",
        "status",
        "endAt" <= (clock_timestamp() AT TIME ZONE 'UTC') AS "expired"
      FROM "Pass"
      WHERE "id" = ${passId}
      FOR UPDATE
    `;
    const current = locked[0];
    if (!current || !from.includes(current.status as PassStatus)) return "UNCHANGED";
    if (current.expired) return "EXPIRED";

    const changed = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Pass"
        SET ${Prisma.join(assignments, ", ")},
            "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC')
        WHERE "id" = ${passId}
          AND "status" IN (${Prisma.join([...from])})
          AND "endAt" > (clock_timestamp() AT TIME ZONE 'UTC')
      `,
    );
    return changed === 1 ? "UPDATED" : "EXPIRED";
  };

  return db ? run(db) : withTransaction(run);
}

export async function findStudentProfileByUserId(
  userId: string,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
}

export async function displayYear(db: DbClient = prisma): Promise<number> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? 0;
}

export async function isParentOf(
  parentUserId: string,
  studentProfileId: string,
  db: DbClient = prisma,
): Promise<boolean> {
  const link = await db.parentStudent.findUnique({
    where: { parentUserId_studentId: { parentUserId, studentId: studentProfileId } },
    select: { id: true },
  });
  return link !== null;
}

export type PassHistoryFilter = {
  type?: PassType;
  status?: PassStatus;
  q?: string;
  studentNumber?: { grade: number; classNo: number; number: number };
  studentProfileId?: string;
  since?: Date;
  until: Date | null;
};

function historyWhere(filter: PassHistoryFilter, year: number): Prisma.PassWhereInput {
  const startAt: Prisma.DateTimeFilter = {
    ...(filter.since ? { gte: filter.since } : {}),
    ...(filter.until ? { lt: filter.until } : {}),
  };

  return {
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.studentProfileId
      ? { studentProfileId: filter.studentProfileId }
      : {}),
    ...(filter.since || filter.until ? { startAt } : {}),
    ...(filter.q
      ? {
          OR: [
            {
              studentProfile: {
                user: { name: { contains: filter.q, mode: "insensitive" } },
              },
            },
            ...(filter.studentNumber
              ? [
                  {
                    studentProfile: {
                      enrollments: {
                        some: {
                          year,
                          grade: filter.studentNumber.grade,
                          classNo: filter.studentNumber.classNo,
                          number: filter.studentNumber.number,
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
}

export async function listHistory(
  filter: PassHistoryFilter & { skip: number; take: number | null },
  year: number,
  db: DbClient = prisma,
): Promise<PassPage> {
  return findPage(
    year,
    {
      where: historyWhere(filter, year),
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      skip: filter.skip,
      ...(filter.take === null ? {} : { take: filter.take }),
    },
    db,
  );
}

export async function countStatusesForStudent(
  studentProfileId: string,
  db: DbClient = prisma,
): Promise<{ status: string; count: number }[]> {
  const rows = await db.pass.groupBy({
    by: ["status"],
    where: { studentProfileId },
    _count: { _all: true },
  });

  return rows.map((row) => ({ status: row.status, count: row._count._all }));
}
