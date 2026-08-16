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
      // 소프트 삭제된 학생을 여기서 WHERE로 빼지 않는다 — 명단에 다시 나타나면
      // 원래 studentCode로 이어붙어야(byCode 매칭) 되살아날 수 있다. 뺐다면 그
      // 코드가 "명단에 없는 학생코드"로 보여 영영 못 돌아온다. 대신 아래 매핑에서
      // deleted 플래그로 표시해 두고, planRoster()가 missingFromFile(재확인 대상)
      // 에서만 이미 삭제된 학생을 뺀다 — 이미 지운 사람을 매번 다시 삭제 확인시키지
      // 않기 위해서다. exportRoster()(전체 명단 내려받기)는 이 플래그로 별도 필터한다.
      where: { user: { role: "STUDENT" } },
      select: {
        id: true,
        studentCode: true,
        birthDate: true,
        user: { select: { id: true, name: true, status: true, deletedAt: true } },
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
      // NFC로 정규화한다 (I8) — roster.parse.ts가 파일 쪽 이름을 같은 형식으로
      // 맞춘다. 안 맞추면 눈엔 같은 이름인데 조합형/완성형이 달라 roster.plan.ts의
      // `!==` 비교가 다르다고 판단해 needsAttention으로 잘못 밀어낸다.
      name: p.user.name.normalize("NFC"),
      // 파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다.
      birthDate: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(p.birthDate),
      grade: e?.schoolClass?.grade ?? null,
      classNo: e?.schoolClass?.classNo ?? null,
      number: e?.number ?? null,
      status: e?.status ?? null,
      accountActive: p.user.status === "ACTIVE",
      // 명단에서 빠져 소프트 삭제된 학생인가. byCode 매칭에는 그대로 쓰이지만
      // missingFromFile·명단 내보내기에서는 제외한다 (위 comment 참고).
      deleted: p.user.deletedAt !== null,
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
  /**
   * 명단에서 빠진 학생 — **계정을 소프트 삭제한다** (지우지 않고 deletedAt만 찍는다).
   * service의 삭제 확인 게이트(확인 id 집합 대조 + 대량 삭제 건수 대조)를 통과한
   * 뒤에만 여기 온다.
   *
   * 계정·StudentProfile·지난 학년도 배정·상벌점·감사로그는 그대로 남는다.
   * **다만 이번 학년도 배정(Enrollment)은 사라진다** — 아래 deleteMany가 관리
   * 범위를 통째로 지우는데 이 학생은 파일에 없어 assignments에 없으므로 다시
   * 만들어지지 않는다. 의도한 동작이다: 명단에서 줄을 지웠다는 건 "이 학년도에
   * 애초에 있으면 안 될 사람"이라는 뜻이라 그 학년도 배정이 없어지는 게 맞다.
   * 자퇴·전출처럼 "있었다가 나갔다"를 남기려면 줄을 지우는 게 아니라 학적 칸을
   * 바꿔야 한다(재학·졸업·자퇴·퇴학·전출·유예) — 그 경로는 배정을 지우지 않는다.
   *
   * 다음 명단에 다시 나타나면 되살아난다(아래 statusChanged 동기화 블록의
   * deletedAt: null).
   */
  deleteStudentProfileIds: string[];
  createdById: string;
};

/**
 * 명단을 반영한다.
 *
 * **그 학년도 배정을 전부 지우고 새로 넣는다.** 번호 교환(3↔4)이나 일괄 재번호는
 * 갱신으로는 성립하지 않는다 — Postgres 유일 제약은 DEFERRABLE이 아니면 문장 단위로
 * 검사하므로, 한 트랜잭션 안이라도 중간 상태에서 걸린다. 지우고 넣으면 그 창이 없다.
 *
 * 명단에 없던 학생은 소프트 삭제한다(deleteStudentProfileIds) — 계정은 남고
 * deletedAt만 찍힌다. 미리보기가 그걸 가장 눈에 띄게 보여주고 별도 확인을 받은
 * 뒤다. 재배정을 다시 넣기 전, 트랜잭션 맨 앞에서 처리한다.
 *
 * 그 외 명단에 있는 학생의 그 학년도 배정은 managedStudentProfileIds 범위로 한정해
 * 지우고 새로 넣는다 (I5) — 관리 범위 밖 학생은 애초에 지우지 않는다.
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
        /** 이번 반영이 폐기한 미사용 초대코드. 서비스가 커밋 뒤 감사로그로 옮긴다. */
        let revokedInvites: { id: string; role: string }[] = [];

        // 재배정을 다시 넣기 전에 소프트 삭제부터 끝낸다.
        if (input.deleteStudentProfileIds.length > 0) {
          // listExisting(role: STUDENT)과 트랜잭션 사이에 승격되면 대상이 더는 학생이
          // 아니다 — where에 role을 다시 좁혀 ADMIN을 삭제 대상에 넣는 사고를 막는다 (M-2).
          const targets = await tx.studentProfile.findMany({
            where: { id: { in: input.deleteStudentProfileIds }, user: { role: "STUDENT" } },
            select: { userId: true },
          });
          const deleteUserIds = targets.map((t) => t.userId);

          // 아직 안 쓴 초대코드는 폐기한다 — 그 학생은 더 이상 학교 소속이 아니다.
          // 지우지 않고 상태만 REVOKED로 바꿔 "왜 이 코드가 죽었는지" 기록이 남게
          // 한다. createdById(학생이 직접 만든 학부모 코드)와 studentId(관리자가
          // 이 학생 몫으로 대신 만든 학부모 코드) 둘 다 본다 — 하드 삭제 시절엔
          // StudentProfile을 지워 Invite.studentId의 Cascade가 이 경우를 자동으로
          // 정리해 줬지만, 이제 StudentProfile이 안 지워지므로 명시적으로 막아야
          // 한다. 안 막으면 학부모가 몇 달 뒤에도 그 코드로 가입해 삭제된 학생에게
          // 연결될 수 있다.
          //
          // 바꾸기 전에 대상을 먼저 읽는다 — updateMany만으로는 "몇 건"밖에 알 수
          // 없어 서비스가 감사로그에 무엇을 폐기했는지 적을 수 없다. repo는 감사로그를
          // 남기지 않으므로(계층 규칙) 목록을 돌려주고, 서비스가 커밋 뒤에 남긴다.
          revokedInvites = await tx.invite.findMany({
            where: {
              status: "PENDING",
              OR: [
                { createdById: { in: deleteUserIds } },
                { studentId: { in: input.deleteStudentProfileIds } },
              ],
            },
            select: { id: true, role: true },
          });

          if (revokedInvites.length > 0) {
            // 방금 읽은 id로만 좁힌다 — 돌려준 목록과 실제로 바뀐 행이 정확히 같아야
            // 감사로그가 사실과 어긋나지 않는다. status 조건은 그대로 둔다(이중 안전).
            await tx.invite.updateMany({
              where: { id: { in: revokedInvites.map((i) => i.id) }, status: "PENDING" },
              data: { status: "REVOKED" },
            });
          }

          // 명단에서 빠진 학생은 지우지 않고 표시만 한다. 학적·소속·상벌점 기록이
          // 스프레드시트 행 하나로 사라지면 안 된다 — 학교생활기록부의 기재 근거다.
          // 진짜 삭제는 사용자 상세에서 한 명씩만 한다.
          await tx.user.updateMany({
            where: { id: { in: deleteUserIds } },
            data: { deletedAt: new Date(), status: "INACTIVE" },
          });
          // 세션은 여전히 지운다 — 소프트 삭제라도 이미 로그인된 세션까지 살려둘
          // 이유는 없다. auth.ts의 세션 생성 훅이 재로그인은 막아 주지만, 이미
          // 발급된 쿠키는 별개다.
          await tx.session.deleteMany({ where: { userId: { in: deleteUserIds } } });
        }

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
        //
        // 두 분기 모두 deletedAt: null을 함께 쓴다 — statusChanged=true라는 것
        // 자체가 이번 파일에 그 학생의 줄이 있다는 뜻이고(명단에 없으면 여기
        // assignments에 오지 않는다), 명단에 있다는 사실 하나로 "더는 소프트
        // 삭제 대상이 아니다"가 성립한다. 재학(ENROLLED)으로 돌아오면 활성화까지
        // 하고, 졸업·자퇴 등으로 돌아오면 deletedAt만 지우고 비활성은 유지한다 —
        // "다시 넣으면 돌아온다"는 계정이 살아 있다는 뜻이지 재학한다는 뜻이 아니다.
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
          await tx.user.updateMany({
            where: { id: { in: ids } },
            data: { status: "INACTIVE", deletedAt: null },
          });
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
            data: { status: "ACTIVE", deletedAt: null },
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

        return { invites, revokedInvites };
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
