import { prisma } from "@/core/db/client";
import type { MeritTrack } from "@/core/authz/merit-track";
import type { CreateRuleInput, UpdateRuleInput } from "./merit.schema";

/** Prisma 호출만 둔다. 권한 검사도, 업무 규칙도 여기 두지 않는다. */

// ── 규정 ──────────────────────────────────────────────────────

export async function createRule(input: CreateRuleInput): Promise<{ id: string }> {
  const rule = await prisma.meritRule.create({
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
  return rule;
}

export async function findRule(id: string) {
  return prisma.meritRule.findUnique({
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
    },
  });
}

/** track·kind는 인자에 없다 — 생성 시 고정이다. */
export async function updateRule(
  id: string,
  data: Omit<UpdateRuleInput, "ruleId">,
): Promise<void> {
  await prisma.meritRule.update({
    where: { id },
    data: {
      label: data.label,
      points: data.points,
      category: data.category,
      description: data.description,
    },
  });
}

export async function deactivateRule(id: string): Promise<void> {
  await prisma.meritRule.update({ where: { id }, data: { active: false } });
}

/**
 * 종류 정렬 순서. **상점이 먼저다.**
 *
 * kind는 문자열 열이라 Prisma의 `kind: "asc"`는 사전순으로 정렬한다 —
 * "DEMERIT" < "MERIT"이라 벌점이 먼저 나왔다. 규정표는 상점부터 읽는 것이
 * 자연스럽고 원본 표도 그 순서라, 가져온 뒤 여기서 다시 세운다.
 * 규정은 전교 통틀어 수백 개 규모라 애플리케이션 정렬로 충분하다.
 */
const KIND_ORDER: Record<string, number> = { MERIT: 0, DEMERIT: 1 };

function byKindThenPoints<T extends { kind: string; points: number }>(
  a: T,
  b: T,
): number {
  const kind = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  return kind !== 0 ? kind : a.points - b.points;
}

/** 비활성 포함 전부. 규정 관리 화면이 쓴다. */
export async function listRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track },
    // 사용 중인 것이 먼저, 그 안에서 분류별로 묶는다. 종류·점수는 아래에서 세운다.
    orderBy: [{ active: "desc" }, { category: "asc" }],
    select: {
      id: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      category: true,
      description: true,
      active: true,
    },
  });

  // 사용/중지 구분은 유지한 채 각 묶음 안에서 상점 → 벌점 순으로 세운다.
  return [
    ...rules.filter((r) => r.active).sort(byKindThenPoints),
    ...rules.filter((r) => !r.active).sort(byKindThenPoints),
  ];
}

/** 부여 화면의 선택지. 비활성은 빠진다. 여기서도 상점이 먼저다. */
export async function listActiveRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: { category: "asc" },
    select: { id: true, kind: true, label: true, points: true, category: true },
  });
  return rules.sort(byKindThenPoints);
}

// ── 부여 ──────────────────────────────────────────────────────

export type NewAward = {
  studentProfileId: string;
  year: number;
  ruleId: string;
  track: string;
  kind: string;
  label: string;
  points: number;
  note: string | null;
  awardedByUserId: string;
  awardedByName: string;
  batchId: string | null;
};

export async function createAward(data: NewAward): Promise<{ id: string }> {
  return prisma.meritAward.create({ data, select: { id: true } });
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
      // 취소 감사로그에 학생 이름을 남기려고 함께 가져온다. id만 남기면
      // 나중에 로그를 볼 때 누구 기록이 취소됐는지 DB를 따로 뒤져야 한다.
      studentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

/**
 * 취소. **ACTIVE인 행만 고친다** — 서비스의 사전 검사와 이 갱신 사이는 원자적이지
 * 않아서, 두 관리자가 같은 기록의 취소를 동시에 누르면 둘 다 검사를 통과한다.
 * 그대로 두면 나중 쓰기가 먼저 쓴 사람의 이름·사유·시각을 덮는다 — 하필 "누구나
 * 취소할 수 있다"를 정당화하는 바로 그 기록이다.
 *
 * 실제로 고친 행 수를 돌려준다. 0이면 그 사이에 남이 먼저 취소했다는 뜻이다.
 */
export async function cancelAward(
  id: string,
  by: { userId: string; name: string; reason: string },
): Promise<number> {
  const result = await prisma.meritAward.updateMany({
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

/**
 * 한 학생의 내역. **year가 null이면 학년도 조건이 붙지 않는다** — 기숙사(누적)다.
 * 취소된 기록도 돌려준다 (화면에 취소 표시로 남아야 한다).
 */
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
    orderBy: { createdAt: "desc" },
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
      createdAt: true,
    },
  });
}

/**
 * 합계. **취소된 기록은 빠진다** (status: ACTIVE만).
 * year가 null이면 전체 누적 — 이것이 "기숙사는 누적"의 구현 전부다.
 */
export async function totals(params: {
  studentProfileId: string;
  track: MeritTrack;
  year: number | null;
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      studentProfileId: params.studentProfileId,
      track: params.track,
      status: "ACTIVE",
      ...(params.year === null ? {} : { year: params.year }),
    },
    _sum: { points: true },
  });
}

// ── 학생 찾기 ─────────────────────────────────────────────────

/** 세션 userId → 학생 신원. 소프트 삭제된 계정은 없는 것으로 친다. */
export async function findStudentProfileByUserId(userId: string) {
  return prisma.studentProfile.findFirst({
    where: { userId, user: { deletedAt: null } },
    select: { id: true, user: { select: { name: true } } },
  });
}

export async function findStudentProfileById(id: string) {
  return prisma.studentProfile.findFirst({
    where: { id, user: { deletedAt: null } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { id: true, name: true } },
    },
  });
}

// ── 일괄 부여 ─────────────────────────────────────────────────

/**
 * 여러 건을 **한 트랜잭션으로** 넣는다. 절반만 들어간 상태를 만들지 않는다.
 * createMany를 쓰지 않는 이유: 감사로그를 건별로 남기려면 각 행의 id가 필요한데
 * createMany는 id를 돌려주지 않는다.
 */
export async function createAwards(items: NewAward[]): Promise<{ id: string }[]> {
  return prisma.$transaction(
    async (tx) => {
      const created: { id: string }[] = [];
      for (const item of items) {
        created.push(
          await tx.meritAward.create({ data: item, select: { id: true } }),
        );
      }
      return created;
    },
    // 100명 × 1문장. 기본 5초로도 충분하지만 느린 디스크에서 여유를 둔다.
    { timeout: 30_000, maxWait: 5_000 },
  );
}

// ── 목록 조회 ─────────────────────────────────────────────────

/**
 * 그 학년도 그 반의 재학생 + 트랙별 합계.
 *
 * 학생 목록과 합계를 따로 질의해 애플리케이션에서 잇는다 — groupBy로는
 * "기록이 하나도 없는 학생"이 결과에서 빠져 반 명단에 구멍이 생긴다.
 */
export async function listClassRoster(params: {
  year: number;
  grade: number;
  classNo: number;
  track: MeritTrack;
  /** 합계를 셀 학년도. null이면 전체 누적(기숙사). */
  totalsYear: number | null;
}) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      year: params.year,
      status: "ENROLLED",
      schoolClass: { grade: params.grade, classNo: params.classNo },
      studentProfile: { user: { deletedAt: null } },
    },
    orderBy: { number: "asc" },
    select: {
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
    where: {
      studentProfileId: { in: ids },
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _sum: { points: true },
  });

  return enrollments.map((e) => {
    const mine = sums.filter((s) => s.studentProfileId === e.studentProfile.id);
    const merit =
      mine.find((s) => s.kind === "MERIT")?._sum.points ?? 0;
    const demerit =
      mine.find((s) => s.kind === "DEMERIT")?._sum.points ?? 0;
    return {
      studentProfileId: e.studentProfile.id,
      studentCode: e.studentProfile.studentCode,
      name: e.studentProfile.user.name,
      number: e.number,
      merit,
      demerit,
      net: merit - demerit,
    };
  });
}

/** 이름 또는 학생코드로 찾는다. 30명에서 자른다. */
export async function searchStudents(query: string, year: number) {
  return prisma.studentProfile.findMany({
    where: {
      user: { deletedAt: null, role: "STUDENT" },
      OR: [
        { user: { name: { contains: query, mode: "insensitive" } } },
        { studentCode: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 30,
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      // 재학인 줄만 학급으로 쓴다. 졸업·전출 학생의 마지막 자리가 남아 있으면
      // 검색 결과에 지금도 그 반인 것처럼 보인다.
      enrollments: {
        where: { year, status: "ENROLLED" },
        take: 1,
        select: {
          number: true,
          status: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });
}

/** 이 학생에게 기록이 있는 학년도들 (내림차순). 학년도 선택지에 쓴다.
 * 교내(SCHOOL)만 학년도 개념이 있다 — 기숙사는 누적이라 조건에 넣지 않는다. */
export async function listAwardYears(studentProfileId: string): Promise<number[]> {
  const rows = await prisma.meritAward.findMany({
    where: { studentProfileId, track: "SCHOOL" },
    distinct: ["year"],
    orderBy: { year: "desc" },
    select: { year: true },
  });
  return rows.map((r) => r.year);
}

/** 학부모의 자녀들. ParentStudent 연결이 곧 권한이다. */
export async function listChildren(parentUserId: string) {
  return prisma.parentStudent.findMany({
    where: { parentUserId, student: { user: { deletedAt: null } } },
    select: {
      student: { select: { id: true, user: { select: { name: true } } } },
    },
  });
}

/** 이 학부모와 이 학생이 실제로 연결되어 있는가. 소유권 검사의 전부다. */
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

/**
 * 화면 머리글용 신원 — 이름·학생코드와 **그 학년도의** 학급.
 *
 * 학급을 스냅샷하지 않고 그때그때 조인한다. 반이 잘못 올라간 것을 나중에 고치면
 * 지난 상벌점 화면의 반 표시까지 함께 바로잡힌다 (설계서 "왜 Enrollment가 아니라
 * year인가" 참고).
 */
export async function findStudentHeader(id: string, year: number) {
  const profile = await prisma.studentProfile.findFirst({
    where: { id, user: { deletedAt: null } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
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
  if (!profile) return null;

  const enrollment = profile.enrollments[0];
  return {
    studentProfileId: profile.id,
    studentCode: profile.studentCode,
    name: profile.user.name,
    grade: enrollment?.schoolClass?.grade ?? null,
    classNo: enrollment?.schoolClass?.classNo ?? null,
    number: enrollment?.number ?? null,
    status: enrollment?.status ?? null,
  };
}

// ── 통계 ──────────────────────────────────────────────────────

/**
 * 학년·반별 요약. 반 편성은 그 학년도 기준이고, 합계 범위는 트랙 규칙을 따른다
 * (totalsYear가 null이면 누적 = 기숙사).
 *
 * 반 명단과 마찬가지로 학생 목록과 합계를 따로 질의해 잇는다 — groupBy만 쓰면
 * 기록이 없는 반이 통째로 빠져 "우리 반은 왜 없지"가 된다.
 */
export async function classSummaries(params: {
  year: number;
  track: MeritTrack;
  totalsYear: number | null;
}) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      year: params.year,
      status: "ENROLLED",
      studentProfile: { user: { deletedAt: null } },
      classId: { not: null },
    },
    select: {
      studentProfileId: true,
      schoolClass: { select: { grade: true, classNo: true } },
    },
  });
  if (enrollments.length === 0) return [];

  const sums = await prisma.meritAward.groupBy({
    by: ["studentProfileId", "kind"],
    where: {
      studentProfileId: { in: enrollments.map((e) => e.studentProfileId) },
      track: params.track,
      // 취소된 기록은 합계에서 빠진다 — 다른 집계 경로와 같은 규칙이다.
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _sum: { points: true },
  });

  const perStudent = new Map<string, { merit: number; demerit: number }>();
  for (const row of sums) {
    const cur = perStudent.get(row.studentProfileId) ?? { merit: 0, demerit: 0 };
    if (row.kind === "MERIT") cur.merit += row._sum.points ?? 0;
    else if (row.kind === "DEMERIT") cur.demerit += row._sum.points ?? 0;
    perStudent.set(row.studentProfileId, cur);
  }

  const byClass = new Map<
    string,
    { grade: number; classNo: number; students: number; merit: number; demerit: number }
  >();
  for (const e of enrollments) {
    const grade = e.schoolClass?.grade;
    const classNo = e.schoolClass?.classNo;
    if (grade === undefined || classNo === undefined) continue;

    const key = `${grade}-${classNo}`;
    const cur =
      byClass.get(key) ?? { grade, classNo, students: 0, merit: 0, demerit: 0 };
    const mine = perStudent.get(e.studentProfileId);
    cur.students += 1;
    cur.merit += mine?.merit ?? 0;
    cur.demerit += mine?.demerit ?? 0;
    byClass.set(key, cur);
  }

  return [...byClass.values()]
    .map((row) => ({
      ...row,
      net: row.merit - row.demerit,
      // 인원이 0인 반은 위에서 만들어지지 않으므로 나눗셈이 안전하다.
      avgNet: Math.round(((row.merit - row.demerit) / row.students) * 10) / 10,
    }))
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
}

/** 많이 나온 항목 순위. 어떤 규정이 실제로 쓰이는지 보여준다. */
export async function topRules(params: {
  track: MeritTrack;
  totalsYear: number | null;
  limit: number;
}) {
  const rows = await prisma.meritAward.groupBy({
    by: ["label", "kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _count: { _all: true },
    _sum: { points: true },
    orderBy: { _count: { label: "desc" } },
    take: params.limit,
  });

  return rows.map((row) => ({
    label: row.label,
    kind: row.kind,
    count: row._count._all,
    points: row._sum.points ?? 0,
  }));
}

/** 트랙 전체 합계 — 통계 화면 머리글. */
export async function trackTotals(params: {
  track: MeritTrack;
  totalsYear: number | null;
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _count: { _all: true },
    _sum: { points: true },
  });
}
