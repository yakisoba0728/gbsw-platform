import { prisma } from "@/core/db/client";
import { isUniqueViolation, NumberTakenError } from "@/core/db/unique-violation";
import type { EnrollmentChange } from "./enrollment.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

/** 기존 import 경로를 깨지 않기 위해 re-export한다. 실물은 core/db에 하나뿐이다. */
export { NumberTakenError };

/**
 * 그 학년도의 학생 전원. 소속이 아직 없는 학생도 포함한다 —
 * 학년도가 막 넘어가면 전원이 배정 없는 상태이고, 그때 이 화면에서 채워야 한다.
 *
 * role이 STUDENT인 계정만 다룬다. Better Auth admin 플러그인의 set-role로
 * 학생에서 관리자로 승격된 계정은 StudentProfile이 남아 있어도 이 표의 대상이 아니다
 * (I3) — "학생 관리" 표에 관리자 본인 줄이 보이면 안 된다.
 */
export async function listByYear(year: number) {
  const profiles = await prisma.studentProfile.findMany({
    where: { user: { role: "STUDENT" } },
    select: {
      id: true,
      birthDate: true,
      user: { select: { id: true, name: true, email: true, status: true } },
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
      email: p.user.email,
      birthDate: p.birthDate,
      accountActive: p.user.status === "ACTIVE",
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      // 배정이 없으면 아직 아무 학적도 아니다. 화면에서 재학으로 채우게 둔다.
      status: e?.status ?? null,
    };
  });
}

/** applyAll에 넘기는 한 학생분의 반영 내용. 검증·정리는 서비스가 이미 끝낸 상태다. */
export type PlannedEnrollment = EnrollmentChange & {
  userId: string;
  /** 계정이 최종적으로 활성이어야 하는지. statusChanged가 false면 안 쓴다. */
  accountActive: boolean;
  /** 학적(status)이 실제로 바뀌는 항목인지. false면 user.status를 건드리지 않는다. */
  statusChanged: boolean;
};

/**
 * 표에서 고친 학생 전원의 소속·학적과 계정 상태를 **단일 트랜잭션**으로 반영한다.
 *
 * 예전엔 학생 1명 단위 트랜잭션을 순차 호출했다. 번호 충돌처럼 사전 검증을 빠져나간
 * 오류가 루프 중간에서 터지면 앞선 학생들은 이미 커밋된 채로 남았다 — 전부 아니면
 * 전무가 되도록 여기서 하나로 묶는다.
 *
 * statusChanged가 true인 항목만 user.status를 쓴다. 학적이 그대로인데 번호만 고쳐도
 * 관리자가 잠가둔 계정이 조용히 되살아나는 문제(I1)를 여기서 막는다.
 */
export async function applyAll(
  year: number,
  items: PlannedEnrollment[],
): Promise<void> {
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const item of items) {
          let classId: string | null = null;

          if (item.grade !== null && item.classNo !== null) {
            const schoolClass = await tx.schoolClass.upsert({
              where: {
                year_grade_classNo: {
                  year,
                  grade: item.grade,
                  classNo: item.classNo,
                },
              },
              create: { year, grade: item.grade, classNo: item.classNo },
              update: {},
            });
            classId = schoolClass.id;
          }

          await tx.enrollment.upsert({
            where: {
              studentProfileId_year: {
                studentProfileId: item.studentProfileId,
                year,
              },
            },
            create: {
              studentProfileId: item.studentProfileId,
              year,
              classId,
              number: item.number,
              status: item.status,
            },
            update: { classId, number: item.number, status: item.status },
          });

          if (item.statusChanged) {
            await tx.user.update({
              where: { id: item.userId },
              data: { status: item.accountActive ? "ACTIVE" : "INACTIVE" },
            });

            // 비활성으로 넘어가면 남아 있는 세션도 끊는다.
            if (!item.accountActive) {
              await tx.session.deleteMany({ where: { userId: item.userId } });
            }
          }
        }
      },
      // 500행 상한 × 학생당 최대 4개 문장 — 기본 5초 타임아웃으로는 부족할 수 있다.
      { timeout: 30_000, maxWait: 5_000 },
    );
  } catch (error) {
    // 서비스의 사전 검사를 빠져나간 경합(승격된 관리자 소유 행 등)에 대한 마지막 방어선.
    if (isUniqueViolation(error, "number")) throw new NumberTakenError();
    throw error;
  }
}
