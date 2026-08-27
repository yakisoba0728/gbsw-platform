import { prisma, type DbClient } from "@/core/db/client";
import type { PassStatus, PassType } from "@/core/authz/pass-type";
import type { Prisma } from "@/generated/prisma/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 화면이 늘 함께 쓰는 학생 정보. 학번은 그 학년도 재적에서 나온다. */
function studentInclude(year: number) {
  return {
    select: {
      id: true,
      user: { select: { id: true, name: true, role: true } },
      enrollments: {
        where: { year },
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
        take: 1,
      },
    },
  } satisfies Prisma.StudentProfileDefaultArgs;
}

export type PassWithStudent = Prisma.PassGetPayload<{
  include: { studentProfile: ReturnType<typeof studentInclude> };
}>;

export type CreatePassData = {
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
  const pass = await db.pass.create({ data, select: { id: true } });
  return pass;
}

/** 결재·취소가 상태를 보려고 읽는다. 학생 정보는 붙이지 않는다. */
export async function findPass(passId: string, db: DbClient = prisma) {
  return db.pass.findUnique({ where: { id: passId } });
}

/** 판정·상세가 읽는다. 학번을 뽑으려면 그 학년도가 필요하다. */
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

/**
 * 정문 판정이 읽는 것. **한 학생의 후보 출입증만** 좁게 가져온다 —
 * 판정은 「지금 나가도 되는가」 하나라, 지난 것까지 다 읽을 이유가 없다.
 *
 * 창을 하루로 잡는 이유: 오늘 끝난 외출을 「기간 지남」이라고 말해 주려면
 * 끝난 것도 한 칸은 필요하고, 그보다 옛것은 정문에서 할 말이 없다.
 */
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
      status: { in: ["REQUESTED", "CONSENTED", "APPROVED"] },
    },
    include: { studentProfile: studentInclude(year) },
    orderBy: { startAt: "asc" },
    take: 20,
  });
}

/** 학생증 QR을 그릴 때 필요한 것 — 이름과 그 학년도의 학번. */
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
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: { studentProfileId },
    include: { studentProfile: studentInclude(year) },
    orderBy: { startAt: "desc" },
    take: 50,
  });
}

/** 교사의 결재 대기 목록. 끝난 것(endAt이 지난 것)은 결재해도 소용없으므로 뺀다. */
export async function listPendingForAdmin(
  now: Date,
  year: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: { status: { in: ["REQUESTED", "CONSENTED"] }, endAt: { gte: now } },
    include: { studentProfile: studentInclude(year) },
    orderBy: { startAt: "asc" },
    take: 100,
  });
}

/** 지금 유효한 출입증. 「오늘 누가 나가 있나」 한 칸에 쓴다. */
export async function listActiveNow(
  now: Date,
  year: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: { status: "APPROVED", startAt: { lte: now }, endAt: { gte: now } },
    include: { studentProfile: studentInclude(year) },
    orderBy: { endAt: "asc" },
    take: 200,
  });
}

/** 학부모 화면. 연결된 자녀 전부의 내역이다. */
export async function listForParent(
  parentUserId: string,
  year: number,
  db: DbClient = prisma,
): Promise<PassWithStudent[]> {
  return db.pass.findMany({
    where: { studentProfile: { parents: { some: { parentUserId } } } },
    include: { studentProfile: studentInclude(year) },
    orderBy: { startAt: "desc" },
    take: 50,
  });
}

/**
 * 직접 부여 선택지. 그 학년도 재적 학생 전부다.
 * 반별 optgroup으로 묶어 그리므로 학년·반·번호 순으로 준다.
 */
export async function listEnrolledStudents(year: number, db: DbClient = prisma) {
  const enrollments = await db.enrollment.findMany({
    where: {
      year,
      status: "ENROLLED",
      studentProfile: { user: { deletedAt: null, status: "ACTIVE" } },
    },
    select: {
      number: true,
      schoolClass: { select: { grade: true, classNo: true } },
      studentProfile: { select: { id: true, user: { select: { name: true } } } },
    },
    orderBy: [
      { schoolClass: { grade: "asc" } },
      { schoolClass: { classNo: "asc" } },
      { number: "asc" },
    ],
  });

  return enrollments.map((row) => ({
    id: row.studentProfile.id,
    name: row.studentProfile.user.name,
    grade: row.schoolClass?.grade ?? null,
    classNo: row.schoolClass?.classNo ?? null,
    number: row.number,
  }));
}

/**
 * 기간이 겹치는 살아 있는 출입증. 두 구간이 겹칠 조건은 `aStart < bEnd && bStart < aEnd`다.
 * 자기 자신은 빼고 본다 (수정 경로가 생길 때를 위해 인자를 둔다).
 */
export async function findOverlapping(
  studentProfileId: string,
  startAt: Date,
  endAt: Date,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.pass.findFirst({
    where: {
      studentProfileId,
      status: { in: ["REQUESTED", "CONSENTED", "APPROVED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
}

/**
 * 상태 전이. **읽고 나서 쓰지 않는다** — 조건부 갱신 하나로 하고 건수를 돌려준다.
 *
 * data 타입이 `Unchecked…`인 것은 실수가 아니다. 체크드 쪽
 * (`PassUpdateManyMutationInput`)은 관계로 이어진 외래키 스칼라
 * (`decidedByUserId` 등)를 빼 버려서, 결재자를 적을 방법이 없어진다 —
 * updateMany는 관계를 연결할 수 없기 때문이다.
 * 0이면 그 사이 누군가 먼저 처리한 것이다 (동시 결재 두 건이 둘 다 통과하면
 * 감사로그가 두 줄 남는다).
 */
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

export async function findStudentProfileByUserId(
  userId: string,
  db: DbClient = prisma,
): Promise<{ id: string } | null> {
  return db.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
}

/**
 * 학번을 뽑을 학년도. 없으면 0 — 어느 재적과도 안 맞아 화면에서 「미배정」으로
 * 떨어진다. **출입증은 학년도가 없어도 굴러가야 한다**: 정문에서의 판정이
 * 「현재 학년도가 없습니다」로 실패하면 그 자리에서 할 수 있는 일이 없다.
 *
 * academic-year.repo에 같은 질의가 있지만 그쪽을 부르지 않는다 — 모듈 경계를
 * 넘는 repo import를 만드는 값이 findFirst 한 줄보다 크다.
 */
export async function displayYear(db: DbClient = prisma): Promise<number> {
  const current = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { year: true },
  });
  return current?.year ?? 0;
}

/** 그 학부모가 그 학생의 보호자인가. 동의 경로의 소유권 검사다. */
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

/**
 * 전체 내역의 조회 조건. 학번은 검색어를 4자리로 읽어낸 경우에만 온다 —
 * 파싱은 서비스가 한다(`merit.repo.searchStudents`와 같은 규약).
 */
export type PassHistoryFilter = {
  type?: PassType;
  status?: PassStatus;
  q?: string;
  studentNumber?: { grade: number; classNo: number; number: number };
  /** 한 학생으로 좁힌 조회. 학생 상세의 출입증 탭이 경로에서 받아 넘긴다. */
  studentProfileId?: string;
  /**
   * 조회 창의 하한 (이상). 화면이 비워 두면 최근 30일이 들어온다.
   * **undefined면 하한이 없다** — 한 학생의 누적을 보는 자리가 그렇다.
   */
  since?: Date;
  /** 상한 (미만). null이면 위쪽이 열려 있어 앞으로 잡힌 신청도 함께 나온다. */
  until: Date | null;
};

function historyWhere(filter: PassHistoryFilter, year: number): Prisma.PassWhereInput {
  // 목록의 정렬키와 같은 열로 자른다. 「8월 20일에 나간 것」을 찾는 사람이
  // 보는 날짜가 startAt이라, 여기만 endAt으로 자르면 화면과 조건이 어긋난다.
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
    // 양끝이 다 열려 있으면 조건 자체를 걸지 않는다 — 빈 객체를 넘기면 질의에
    // 뜻 없는 절이 하나 남는다.
    ...(filter.since || filter.until ? { startAt } : {}),
    ...(filter.q
      ? {
          OR: [
            {
              studentProfile: {
                user: { name: { contains: filter.q, mode: "insensitive" } },
              },
            },
            // 학번은 그 학년도 재적에만 있다. 여기서 year를 빼면 작년 번호로
            // 남의 학생이 나온다.
            ...(filter.studentNumber
              ? [
                  {
                    studentProfile: {
                      enrollments: {
                        some: {
                          year,
                          number: filter.studentNumber.number,
                          schoolClass: {
                            grade: filter.studentNumber.grade,
                            classNo: filter.studentNumber.classNo,
                          },
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

/**
 * 조건에 맞는 내역 한 페이지와 전체 건수. `take`가 null이면 자르지 않는다
 * (내보내기 — 같은 조건의 전부를 한 파일에 담는다).
 *
 * 보조 정렬키 `id`가 없으면 쪽 경계가 흔들린다. **외박은 startAt이 KST 자정이라**
 * 같은 날 나간 학생 전부가 밀리초까지 같은 값을 갖는데, SQL은 정렬키가 같은 행
 * 사이의 순서를 보장하지 않는다 — OFFSET이 달라지면 어느 쪽에도 안 나오는 줄이나
 * 두 번 나오는 줄이 생긴다. cuid는 시간순은 아니지만 유일하고 결정적이다.
 */
export async function listHistory(
  filter: PassHistoryFilter & { skip: number; take: number | null },
  year: number,
  db: DbClient = prisma,
): Promise<{ entries: PassWithStudent[]; total: number }> {
  const where = historyWhere(filter, year);

  const [entries, total] = await Promise.all([
    db.pass.findMany({
      where,
      include: { studentProfile: studentInclude(year) },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      skip: filter.skip,
      ...(filter.take === null ? {} : { take: filter.take }),
    }),
    db.pass.count({ where }),
  ]);

  return { entries, total };
}

/**
 * 한 학생의 상태별 건수. **기간을 보지 않는다** — 학생 상세의 「누적」한 줄이라,
 * 목록에 건 조회 창이나 상태 필터가 이 숫자를 흔들면 안 된다.
 */
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
