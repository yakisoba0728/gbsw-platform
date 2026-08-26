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
 * 0이면 그 사이 누군가 먼저 처리한 것이다 (동시 결재 두 건이 둘 다 통과하면
 * 감사로그가 두 줄 남는다).
 */
export async function transition(
  passId: string,
  from: readonly PassStatus[],
  data: Prisma.PassUpdateManyMutationInput,
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
