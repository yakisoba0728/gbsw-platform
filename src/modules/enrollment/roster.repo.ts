import { prisma } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import type { PlannedRow } from "./roster.plan";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 초대코드가 배치 안에서든 기존 데이터와든 겹쳤을 때 (I2). generateUniqueCode()로
 * 사전에 막아도 동시에 올라온 다른 반영과 경합하면 여기까지 뚫릴 수 있다 — 마지막
 * 방어선이다. */
export class InviteCodeCollisionError extends Error {}

export async function listExisting(year: number) {
  const [profiles, entryByProfile] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { user: { role: "STUDENT" } },
      select: {
        id: true,
        studentCode: true,
        birthDate: true,
        user: { select: { id: true, name: true, status: true } },
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
    }),
    entrySeats(),
  ]);

  return profiles.map((p) => {
    const e = p.enrollments[0];
    const entry = entryByProfile.get(p.id);
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      studentCode: p.studentCode,
      name: p.user.name,
      // 파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다.
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
      accountActive: p.user.status === "ACTIVE",
      // 참고 열(입학반·입학번호)용. 내보내기가 쓴다 — 올릴 때는 무시한다 (사실은
      // 그 학년도 배정이 정한다).
      entryClassNo: entry?.classNo ?? null,
      entryNumber: entry?.number ?? null,
    };
  });
}

/** 참고 열용. 학생마다 가장 이른 1학년 배정을 한 번의 조회로 모은다. */
async function entrySeats(): Promise<Map<string, { classNo: number; number: number }>> {
  const rows = await prisma.enrollment.findMany({
    where: { schoolClass: { grade: 1 } },
    orderBy: { year: "asc" },
    select: {
      studentProfileId: true,
      number: true,
      schoolClass: { select: { classNo: true } },
    },
  });

  const map = new Map<string, { classNo: number; number: number }>();
  for (const r of rows) {
    // year 오름차순이라 먼저 만난 것이 가장 이른 1학년이다.
    if (map.has(r.studentProfileId)) continue;
    if (r.schoolClass && r.number !== null) {
      map.set(r.studentProfileId, { classNo: r.schoolClass.classNo, number: r.number });
    }
  }
  return map;
}

/** applyRoster에 넘기는 한 줄. 계정 상태를 건드릴지는 statusChanged가 결정한다. */
export type RosterAssignment = PlannedRow & {
  /**
   * 기존 Enrollment.status와 이번 값이 다른가 (C1). false면 계정 상태를 건드리지
   * 않는다 — 학적·반·번호가 그대로인 학생(untouched)까지 매번 재분류되면서
   * 관리자가 의도적으로 잠가둔 계정이 명단 반영마다 조용히 풀리던 게 이 결함이었다.
   * enrollment.repo.ts의 applyAll이 같은 문제를 같은 방식으로 고쳤다 — 그 패턴을 맞췄다.
   */
  statusChanged: boolean;
};

export type ApplyInput = {
  /** 기존 학생의 그 학년도 배정 (신규 제외) */
  assignments: RosterAssignment[];
  /** 초대코드를 만들 신규 학생. 비재학 신규는 여기 오지 않는다 (I1) — 계정이 필요 없다. */
  newStudents: { row: PlannedRow; code: string }[];
  /** newStudents 전원이 공유하는 만료 시각. null이면 무기한. */
  inviteExpiresAt: Date | null;
  /**
   * 이번 반영이 관리하는 범위 — role: STUDENT인 학생의 studentProfileId 전체
   * (listExisting과 같은 기준). deleteMany를 이 범위로만 좁혀야, 학생에서 관리자로
   * 승격돼 listExisting 밖으로 빠진 계정의 Enrollment가 조용히 삭제되지 않는다 (I5).
   */
  managedStudentProfileIds: string[];
  createdById: string;
};

/**
 * 명단을 반영한다.
 *
 * **그 학년도 배정을 전부 지우고 새로 넣는다.** 번호 교환(3↔4)이나 일괄 재번호는
 * 갱신으로는 성립하지 않는다 — Postgres 유일 제약은 DEFERRABLE이 아니면 문장 단위로
 * 검사하므로, 한 트랜잭션 안이라도 중간 상태에서 걸린다. 지우고 넣으면 그 창이 없다.
 *
 * 명단에 없던 학생의 그 학년도 배정도 함께 사라진다. 미리보기가 그걸 경고로 보여준 뒤다.
 * 단, 삭제 범위는 managedStudentProfileIds로 한정한다 (I5) — 관리 범위 밖 학생은
 * 애초에 지우지 않는다.
 *
 * 주의: 여기서 새로 만드는 Enrollment.id는 반영할 때마다 다시 생성된다(위의 지우고
 * 넣기 때문에). **다른 테이블이 Enrollment.id를 FK로 참조하면 안 된다** — 상벌점처럼
 * 오래 남아야 하는 기록이 Enrollment를 참조하면, Cascade 삭제로는 명단을 다시 올릴
 * 때마다 기록이 함께 사라지고 Restrict로는 명단 반영 자체가 영구히 막힌다. 학년도를
 * 넘어 안정적인 식별자가 필요하면 StudentProfile.id를 참조해야 한다.
 */
export async function applyRoster(year: number, input: ApplyInput) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.enrollment.deleteMany({
          where: { year, studentProfileId: { in: input.managedStudentProfileIds } },
        });

        // 반은 학년도당 30개 남짓이다. 학생마다 upsert를 부르면 300번 왕복하므로,
        // 필요한 반을 먼저 모아 한 번씩만 upsert한다.
        const neededClasses = new Map<string, { grade: number; classNo: number }>();
        for (const row of input.assignments) {
          if (row.grade !== null && row.classNo !== null) {
            neededClasses.set(`${row.grade}-${row.classNo}`, {
              grade: row.grade,
              classNo: row.classNo,
            });
          }
        }

        const classIdByKey = new Map<string, string>();
        for (const { grade, classNo } of neededClasses.values()) {
          const cls = await tx.schoolClass.upsert({
            where: { year_grade_classNo: { year, grade, classNo } },
            create: { year, grade, classNo },
            update: {},
          });
          classIdByKey.set(`${grade}-${classNo}`, cls.id);
        }

        for (const row of input.assignments) {
          const classId =
            row.grade !== null && row.classNo !== null
              ? (classIdByKey.get(`${row.grade}-${row.classNo}`) ?? null)
              : null;

          await tx.enrollment.create({
            data: {
              studentProfileId: row.studentProfileId!,
              year,
              classId,
              number: row.number,
              status: row.status!,
            },
          });
        }

        // 계정 상태를 학적에 맞춘다. statusChanged가 true인 학생만 건드린다 (C1) —
        // 그대로인 학생(untouched)까지 여기 섞여 있어도 계정은 손대지 않는다.
        const changed = input.assignments.filter((r) => r.statusChanged);
        const inactive = changed
          .filter((r) => r.status !== "ENROLLED")
          .map((r) => r.studentProfileId!);
        const active = changed
          .filter((r) => r.status === "ENROLLED")
          .map((r) => r.studentProfileId!);

        if (inactive.length > 0) {
          const users = await tx.studentProfile.findMany({
            where: { id: { in: inactive } },
            select: { userId: true },
          });
          const ids = users.map((u) => u.userId);
          await tx.user.updateMany({ where: { id: { in: ids } }, data: { status: "INACTIVE" } });
          // 비활성으로 넘어가는 계정은 세션도 끊는다.
          await tx.session.deleteMany({ where: { userId: { in: ids } } });
        }
        if (active.length > 0) {
          const users = await tx.studentProfile.findMany({
            where: { id: { in: active } },
            select: { userId: true },
          });
          await tx.user.updateMany({
            where: { id: { in: users.map((u) => u.userId) } },
            data: { status: "ACTIVE" },
          });
        }

        const invites: {
          name: string;
          code: string;
          grade: number | null;
          classNo: number | null;
          number: number | null;
        }[] = [];

        for (const { row, code } of input.newStudents) {
          await tx.invite.create({
            data: {
              code,
              role: "STUDENT",
              status: "PENDING",
              createdById: input.createdById,
              expiresAt: input.inviteExpiresAt,
              // 가입 때 2차 요소로 대조하는 값이다. 기존 발급 경로와 같은 모양이어야 한다.
              metadata: {
                name: row.name,
                birthDate: row.birthDate,
                grade: row.grade,
                classNo: row.classNo,
                number: row.number,
              },
            },
          });
          invites.push({
            name: row.name,
            code,
            grade: row.grade,
            classNo: row.classNo,
            number: row.number,
          });
        }

        return { invites };
      },
      // 전교생 규모 × 학생당 두어 문장. 기본 5초로는 부족하다.
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    // service가 generateUniqueCode()로 미리 막고 배치 안도 Set으로 중복을 없애지만,
    // 동시에 올라온 다른 반영과 경합하면 여기까지 뚫릴 수 있다 — 마지막 방어선.
    if (isUniqueViolation(error, "code")) throw new InviteCodeCollisionError();
    throw error;
  }
}
