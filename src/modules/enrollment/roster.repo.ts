import { prisma } from "@/core/db/client";
import type { PlannedRow } from "./roster.plan";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

export async function listExisting(year: number) {
  const profiles = await prisma.studentProfile.findMany({
    where: { user: { role: "STUDENT" } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true } },
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

  return profiles.map((p) => {
    const e = p.enrollments[0];
    return {
      studentProfileId: p.id,
      userId: p.user.id,
      name: p.user.name,
      // 파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다.
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
    };
  });
}

export type ApplyInput = {
  /** 기존 학생의 그 학년도 배정 (신규 제외) */
  assignments: PlannedRow[];
  /** 초대코드를 만들 신규 학생 */
  newStudents: { row: PlannedRow; code: string }[];
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
 */
export async function applyRoster(year: number, input: ApplyInput) {
  return prisma.$transaction(
    async (tx) => {
      await tx.enrollment.deleteMany({ where: { year } });

      for (const row of input.assignments) {
        let classId: string | null = null;
        if (row.grade !== null && row.classNo !== null) {
          const cls = await tx.schoolClass.upsert({
            where: {
              year_grade_classNo: { year, grade: row.grade, classNo: row.classNo },
            },
            create: { year, grade: row.grade, classNo: row.classNo },
            update: {},
          });
          classId = cls.id;
        }

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

      // 계정 상태를 학적에 맞춘다. 비활성으로 넘어가는 계정은 세션도 끊는다.
      const inactive = input.assignments
        .filter((r) => r.status !== "ENROLLED")
        .map((r) => r.studentProfileId!);
      const active = input.assignments
        .filter((r) => r.status === "ENROLLED")
        .map((r) => r.studentProfileId!);

      if (inactive.length > 0) {
        const users = await tx.studentProfile.findMany({
          where: { id: { in: inactive } },
          select: { userId: true },
        });
        const ids = users.map((u) => u.userId);
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { status: "INACTIVE" } });
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
}
