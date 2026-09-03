import { prisma, type DbClient, withTransaction } from "@/core/db/client";
import { type PassStatus, type PassType } from "@/core/authz/pass-type";
import { Prisma } from "@/generated/prisma/client";
import { DECIDABLE_STATUSES, LIVE_STATUSES } from "./pass.policy";

export { findCurrentYearForUpdate } from "@/modules/academic-year/academic-year.repo";

function studentInclude(year: number | null) {
  return {
    select: {
      id: true,
      user: { select: { id: true, name: true, role: true } },
      enrollments: {
        // 표시 학년도가 정해지지 않았으면 학년·반·번호를 좁히지 않는다(빈 결과).
        where: year === null ? { year: { in: [] } } : { year },
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

/* nextCursor가 null이면 다음 페이지가 없다. total은 커서와 무관한 전체 건수다. */
export type PassCursorPage = PassPage & { nextCursor: string | null };

/* 커서로 넘기는 목록의 창. cursor가 null이면 첫 페이지다. */
export type PassCursorWindow = { cursor: string | null; take: number };

type PassPageQuery = Pick<
  Prisma.PassFindManyArgs,
  "where" | "orderBy" | "skip" | "take"
> & {
  /* 이 id 다음부터 읽는다. 정렬 끝에 id가 있어 커서 하나로 자리가 정해진다. */
  cursorId?: string | null;
};

async function findPage(
  year: number | null,
  query: PassPageQuery,
  db: DbClient,
): Promise<PassCursorPage> {
  const { cursorId, ...args } = query;
  const take = typeof args.take === "number" ? args.take : null;

  const [rows, total] = await Promise.all([
    db.pass.findMany({
      ...args,
      // skip: 1로 커서 행을 지우지 않는다 — 커서 행이 그새 목록에서 빠졌으면
      // (교사가 방금 승인한 신청 등) skip이 그 다음 한 건을 대신 건너뛴다.
      // 실제로 맨 앞에 있을 때만 버려야 한 건도 사라지지 않는다.
      ...(cursorId ? { cursor: { id: cursorId } } : {}),
      // 다음 페이지가 있는지 보려고 한 건을 더 읽는다(커서 행이 있으면 두 건).
      ...(take === null ? {} : { take: take + (cursorId ? 2 : 1) }),
      include: { studentProfile: studentInclude(year) },
    }),
    db.pass.count({ where: args.where }),
  ]);

  const after = cursorId && rows[0]?.id === cursorId ? rows.slice(1) : rows;
  if (take === null) return { entries: after, total, nextCursor: null };

  const entries = after.slice(0, take);
  return {
    entries,
    total,
    nextCursor: after.length > take ? (entries.at(-1)?.id ?? null) : null,
  };
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

/* 승인 분기를 트랜잭션 안에서 행 잠금 후 다시 판정할 때 쓴다. */
export async function lockPassForDecision(
  passId: string,
  db: DbClient,
): Promise<{ id: string; status: string } | null> {
  const rows = await db.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"
    FROM "Pass"
    WHERE "id" = ${passId}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function findPassForVerify(
  passId: string,
  year: number | null,
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
  year: number | null,
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
  year: number | null,
  db: DbClient = prisma,
) {
  return db.studentProfile.findUnique({
    where: { id: studentProfileId },
    ...studentInclude(year),
  });
}

export async function listForStudent(
  studentProfileId: string,
  year: number | null,
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
  year: number | null,
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
  year: number | null,
  window: PassCursorWindow,
  db: DbClient = prisma,
): Promise<PassCursorPage> {
  return findPage(
    year,
    {
      where: { status: { in: [...DECIDABLE_STATUSES] }, endAt: { gt: now } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      cursorId: window.cursor,
      take: window.take,
    },
    db,
  );
}

export async function listActiveNow(
  now: Date,
  year: number | null,
  window: PassCursorWindow,
  db: DbClient = prisma,
): Promise<PassCursorPage> {
  return findPage(
    year,
    {
      where: { status: "APPROVED", startAt: { lte: now }, endAt: { gt: now } },
      orderBy: [{ endAt: "asc" }, { id: "asc" }],
      cursorId: window.cursor,
      take: window.take,
    },
    db,
  );
}

export async function listForParent(
  parentUserId: string,
  year: number | null,
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
  year: number | null,
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

export async function listEnrolledStudents(
  year: number | null,
  db: DbClient = prisma,
) {
  // 표시 학년도가 없으면 어떤 학생도 그 학년도에 재학 중이 아니다.
  if (year === null) return [];
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

/* 손으로 쓴 SQL 컬럼 지도는 Prisma 스키마에서 유래한 Pass 필드 키 집합과
   컴파일 타임에 대조한다 — 스키마의 필드명이 바뀌면 대입이 어긋나 에러로 잡힌다. */
type PassColumnMap = { [K in keyof Prisma.PassUncheckedUpdateManyInput]?: K };

export const UNEXPIRED_TRANSITION_COLUMNS = {
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
} as const satisfies PassColumnMap;

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
    // Prisma DateTime은 시간대 없는 TIMESTAMP(3)라 UTC 값을 담는다 — naive 컬럼을
    // clock_timestamp와 곧바로 비교하면 세션 TimeZone으로 해석되어 9시간 어긋나므로,
    // 컬럼을 명시적으로 UTC로 풀어 절대시각끼리 비교·대입한다.
    const locked = await tx.$queryRaw<
      Array<{ id: string; status: string; expired: boolean }>
    >`
      SELECT
        "id",
        "status",
        ("endAt" AT TIME ZONE 'UTC') <= clock_timestamp() AS "expired"
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
          AND ("endAt" AT TIME ZONE 'UTC') > clock_timestamp()
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

/* 현재 학년도. 학년도가 정해지지 않았으면 null — 호출부는 매직 0 대신
   "학년도 없음"을 명시적으로 다룬다. */
export async function displayYear(db: DbClient = prisma): Promise<number | null> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? null;
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

function historyWhere(
  filter: PassHistoryFilter,
  year: number | null,
): Prisma.PassWhereInput {
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
            ...(filter.studentNumber && year !== null
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
  year: number | null,
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
