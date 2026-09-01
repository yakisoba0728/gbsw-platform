import { prisma, type DbClient } from "@/core/db/client";
import type { Prisma } from "@/generated/prisma/client";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export type InsertInviteInput = {
  code: string;
  role: string;
  metadata: Prisma.InputJsonObject;
  studentId?: string;
  expiresAt: Date | null;
  createdById: string;
  createdByName: string;
};

export async function insertInvite(
  input: InsertInviteInput,
  db: DbClient = prisma,
) {
  return db.invite.create({
    data: {
      code: input.code,
      role: input.role,
      metadata: input.metadata,
      studentId: input.studentId ?? null,
      expiresAt: input.expiresAt,
      createdById: input.createdById,
      createdByName: input.createdByName,
    },
  });
}

export async function findById(id: string) {
  return prisma.invite.findUnique({ where: { id } });
}

export async function listAll(year: number) {
  return prisma.invite.findMany({
    // 보조 정렬키가 없으면 동점 구간 순서가 흔들린다. createdAt의 기본값
    // CURRENT_TIMESTAMP는 Postgres에서 **트랜잭션 시작 시각**이라 명단 일괄 반영
    // 한 번이 발급한 코드 수십 개가 밀리초까지 같은 값을 갖는데, SQL은 정렬키가
    // 같은 행 사이의 순서를 보장하지 않는다. take가 없어 줄이 사라지지는 않지만,
    // 같은 목록이 새로고침마다 다르게 서면 방금 발급한 코드를 눈으로 못 쫓는다.
    // id는 cuid라 시간순은 아니지만 유일하고 결정적이다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      usedBy: { select: { name: true, email: true } },
      student: {
        select: {
          user: { select: { name: true } },
          enrollments: {
            where: { year },
            take: 1,
            select: {
              number: true,
              schoolClass: { select: { grade: true, classNo: true } },
            },
          },
        },
      },
    },
  });
}

export async function listByStudent(studentId: string) {
  return prisma.invite.findMany({
    where: { studentId, role: "PARENT" },
    // 같은 이유로 보조 정렬키를 둔다 (listAll 참고). 한 학생에게 학부모 코드를
    // 한 번에 여러 개 발급하면 그 코드들이 밀리초까지 같은 createdAt을 갖는다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

/**
 * 아직 **쓸 수 있는** 학부모 코드 수. MAX_ACTIVE_PARENT_INVITES 한도의 분자다.
 *
 * 판정 규칙은 `lib/invite-code.ts`의 `isInviteUsable`과 같아야 한다 — 거기서는
 * 만료된 코드를 못 쓴다고 보는데 여기서만 안 봤다. 그 결과 학생이 쓸 수 없는
 * 코드들이 한도를 계속 차지해 새 코드를 만들지 못하고, 교사가 손으로
 * 폐기해야만 풀렸다. `expiresAt`이 null이면 무기한이라 항상 센다.
 *
 * now를 인자로 받는다 — 테스트가 "지금"을 고정할 수 있어야 경계를 검증할 수 있다.
 */
export async function countActiveByStudent(
  studentId: string,
  now: Date = new Date(),
  db: DbClient = prisma,
) {
  return db.invite.count({
    where: {
      studentId,
      status: "PENDING",
      // isInviteUsable은 expiresAt <= now를 만료로 본다 — 그 여집합이 gt다.
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

/**
 * 학부모 초대 한도 판정의 직렬화 지점. User → StudentProfile 순으로 잠근 뒤에만
 * count+insert를 수행한다. 관리자 계정 수정·삭제와 같은 순서라 교착이 없고,
 * 학생 행 잠금은 병렬 요청 둘이 모두 한도 미만을 보는 경쟁을 막는다.
 */
export async function lockStudentForParentInvite(
  studentId: string,
  db: DbClient,
): Promise<boolean> {
  const users = await db.$queryRaw<Array<{ id: string }>>`
    SELECT u."id"
    FROM "user" AS u
    WHERE u."id" = (
      SELECT sp."userId" FROM "StudentProfile" AS sp WHERE sp."id" = ${studentId}
    )
    FOR UPDATE
  `;
  const user = users[0];
  if (!user) return false;

  const profiles = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "StudentProfile"
    WHERE "id" = ${studentId} AND "userId" = ${user.id}
    FOR UPDATE
  `;
  return profiles.length === 1;
}

/** PENDING인 것만 폐기한다. 이미 쓰였거나 폐기된 코드는 건드리지 않는다. */
export async function revokePending(
  id: string,
  db: DbClient = prisma,
): Promise<number> {
  const { count } = await db.invite.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return count;
}

export async function getStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findUnique({ where: { userId } });
}

export async function codeExists(code: string): Promise<boolean> {
  return (await prisma.invite.count({ where: { code } })) > 0;
}

export async function findStudentById(studentId: string) {
  return prisma.studentProfile.findUnique({ where: { id: studentId } });
}

/** 학부모 코드 발급 시 고를 학생 목록. 학년·반·번호 순. */
export async function listStudents(year: number) {
  const students = await prisma.studentProfile.findMany({
    // 명단에서 빠져 소프트 삭제된 학생은 고를 수 없어야 한다 — 더는 재학생이 아니다.
    where: { user: { deletedAt: null } },
    select: {
      id: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });

  // 학년→반→번호 순. 관계 배열은 Prisma orderBy로 정렬할 수 없어 여기서 맞춘다.
  return students.sort((a, b) => {
    const x = a.enrollments[0];
    const y = b.enrollments[0];
    return (
      (x?.schoolClass?.grade ?? 99) - (y?.schoolClass?.grade ?? 99) ||
      (x?.schoolClass?.classNo ?? 99) - (y?.schoolClass?.classNo ?? 99) ||
      (x?.number ?? 99) - (y?.number ?? 99)
    );
  });
}
