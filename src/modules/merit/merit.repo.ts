import { prisma } from "@/core/db/client";
import {
  addKindPoints,
  addKindTotals,
  emptyKindTotals,
  netScore,
  withNetScore,
  type KindTotals,
  type MeritKind,
  type MeritTrack,
} from "@/core/authz/merit-track";
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

/**
 * 규정 삭제. 행은 지우지 않고 active를 내린다 — 이미 나간 부여가 ruleId를
 * 참조한다(onDelete: Restrict).
 */
export async function markRuleDeleted(id: string): Promise<void> {
  await prisma.meritRule.update({ where: { id }, data: { active: false } });
}

/**
 * 종류 정렬 순서. 상점이 먼저다 — Prisma의 `kind: "asc"`는 사전순이라
 * "DEMERIT" < "MERIT"으로 벌점이 앞선다. 가져온 뒤 여기서 다시 세운다.
 */
const KIND_ORDER: Record<string, number> = { MERIT: 0, DEMERIT: 1, OFFSET: 2 };

/**
 * 규정 정렬: 종류 → 분류 → 점수. 학교 규정표가 이 순서다.
 * 분류는 가나다순이고, 분류 없는 규정은 맨 뒤로 간다.
 */
function byKindCategoryPoints<
  T extends { kind: string; category: string | null; points: number },
>(a: T, b: T): number {
  const kind = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
  if (kind !== 0) return kind;

  // 분류 없음은 맨 뒤. 빈 문자열과 null을 같게 본다.
  const ca = a.category ?? "";
  const cb = b.category ?? "";
  if (ca !== cb) {
    if (ca === "") return 1;
    if (cb === "") return -1;
    const category = ca.localeCompare(cb, "ko");
    if (category !== 0) return category;
  }

  return a.points - b.points;
}

/** 규정 관리 화면의 목록. 삭제된 규정은 나오지 않는다. */
export async function listRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    // 순서는 byKindCategoryPoints가 세운다. 여기서는 결과가 매번 같도록 기준만 준다.
    orderBy: [{ label: "asc" }],
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

  return rules.sort(byKindCategoryPoints);
}

/** 부여 화면의 선택지. 비활성은 빠진다. 여기서도 상점이 먼저다. */
export async function listActiveRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    orderBy: { label: "asc" },
    select: { id: true, kind: true, label: true, points: true, category: true },
  });
  return rules.sort(byKindCategoryPoints);
}

// ── 벌점 기준 ─────────────────────────────────────────────────

/**
 * 저장된 기준 전부. 행이 트랙 수만큼이라 한 번에 다 읽는다.
 * 없는 트랙은 빠져 나오고, 기본값으로 채우는 일은 서비스가 한다.
 */
export async function listThresholds() {
  return prisma.meritThreshold.findMany({
    select: {
      track: true,
      warn: true,
      danger: true,
      updatedAt: true,
      updatedByName: true,
    },
  });
}

export type ThresholdWrite = {
  track: string;
  warn: number;
  danger: number;
  updatedByUserId: string;
  updatedByName: string;
};

/** 기준 저장. 트랙마다 행이 하나라 upsert다. */
export async function upsertThreshold(data: ThresholdWrite): Promise<void> {
  const { track, ...rest } = data;
  await prisma.meritThreshold.upsert({
    where: { track },
    create: { track, ...rest },
    update: rest,
  });
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
  /** 실제로 일어난 날 (KST 자정). 입력 시각은 createdAt이 따로 남긴다. */
  occurredOn: Date;
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
      // 취소 감사로그에 학생 이름을 남기려고 함께 가져온다.
      studentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

/**
 * 취소. ACTIVE인 행만 고친다 — 두 관리자가 동시에 눌러도 먼저 쓴 사람의
 * 이름·사유·시각을 덮지 않는다. 0이면 그 사이 남이 먼저 취소했다는 뜻이다.
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
 * 한 학생의 내역. year가 null이면 학년도 조건이 붙지 않는다(기숙사=누적).
 * 정렬은 발생일 기준이다 — 확인서를 읽는 사람이 사건 순서를 거꾸로 읽지 않게.
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
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
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
      occurredOn: true,
      // 화면이 두 날짜를 나란히 보여줄 수 있게 입력 시각도 함께 낸다.
      createdAt: true,
    },
  });
}

/** 합계. 취소된 기록은 빠지고, year가 null이면 전체 누적이다. */
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

/**
 * 부여 대상을 찾는다 — 명단에 남아 있는 학생만. 조회 경로는 빠진 학생도 보지만
 * 부여는 열지 않으며, 그 경계가 이 where 절이다. 서버 액션을 직접 부르면 아무
 * id나 보낼 수 있으므로 마지막 방어선은 여기다.
 */
export async function findAwardableStudent(id: string) {
  return prisma.studentProfile.findFirst({
    where: { id, user: { deletedAt: null } },
    // 부여가 쓰는 것은 id(존재 확인)와 이름(감사로그)뿐이다.
    select: { id: true, user: { select: { name: true } } },
  });
}

// ── 일괄 부여·취소 ────────────────────────────────────────────

/**
 * 여러 건을 한 트랜잭션으로 넣는다. createMany가 아닌 이유는 감사로그를 건별로
 * 남기려면 각 행의 id가 필요해서다.
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

/**
 * 여러 부여 대상을 한 번에 찾는다. 조건은 단건과 같다.
 * 못 찾은 id가 있으면 결과 길이가 줄어든다 — 호출부가 길이로 판별한다.
 */
export async function findAwardableStudents(ids: string[]) {
  return prisma.studentProfile.findMany({
    where: { id: { in: ids }, user: { deletedAt: null } },
    // 단건 부여와 같은 것만 쓴다 — id와 감사로그용 이름.
    select: { id: true, user: { select: { name: true } } },
  });
}

/** 한 묶음에 속한, 아직 살아 있는 기록들. 일괄 취소가 무엇을 지울지 미리 센다. */
export async function findBatch(batchId: string) {
  return prisma.meritAward.findMany({
    where: { batchId, status: "ACTIVE" },
    // 순서를 고정한다 — 감사로그를 이 순서로 남기므로 매번 같아야 읽기 좋다.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      studentProfileId: true,
      track: true,
      kind: true,
      label: true,
      points: true,
      // 이름이 없으면 묶음의 감사로그 줄이 전부 똑같아져 누구 것인지 구분되지 않는다.
      studentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

/**
 * 여러 건을 한 번에 취소하고 실제로 고친 것의 id만 돌려준다. batchId가 아니라
 * id 목록을 받는 것은 감사로그의 근거가 된 목록과 갱신 범위를 맞추기 위해서다.
 * ACTIVE인 것만 고친다 — 먼저 취소한 사람의 기록을 덮지 않는다.
 */
export async function cancelAwards(
  ids: string[],
  by: { userId: string; name: string; reason: string },
): Promise<string[]> {
  if (ids.length === 0) return [];

  const rows = await prisma.meritAward.updateManyAndReturn({
    where: { id: { in: ids }, status: "ACTIVE" },
    data: {
      status: "CANCELLED",
      cancelledByUserId: by.userId,
      cancelledByName: by.name,
      // 한 번의 취소는 한 시각이다 — 행마다 부르면 로그를 시각으로 묶을 수 없다.
      cancelledAt: new Date(),
      cancelReason: by.reason,
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

// ── 목록 조회 ─────────────────────────────────────────────────

/**
 * groupBy(학생·종류) 결과를 학생별 합계로 접는다. 접는 규칙은 merit-track이
 * 갖고 있다 — 여기서 손으로 나누면 종류가 늘 때 이 파일만 옛 계산을 계속한다.
 */
function foldByStudent(
  sums: {
    studentProfileId: string;
    kind: string;
    _sum: { points: number | null };
  }[],
): Map<string, KindTotals> {
  const byStudent = new Map<string, KindTotals>();
  for (const row of sums) {
    const totals = byStudent.get(row.studentProfileId) ?? emptyKindTotals();
    addKindPoints(totals, row.kind, row._sum.points ?? 0);
    byStudent.set(row.studentProfileId, totals);
  }
  return byStudent;
}

/**
 * 그 학년도 그 반의 재학생 + 트랙별 합계. 학생 목록과 합계를 따로 질의해 잇는다 —
 * groupBy만 쓰면 기록이 없는 학생이 빠져 명단에 구멍이 생긴다.
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

  const byStudent = foldByStudent(sums);

  // 기록이 하나도 없는 학생도 0으로 남는다 — 명단에 구멍이 생기면 안 된다.
  return enrollments.map((e) => ({
    studentProfileId: e.studentProfile.id,
    studentCode: e.studentProfile.studentCode,
    name: e.studentProfile.user.name,
    number: e.number,
    ...withNetScore(byStudent.get(e.studentProfile.id) ?? emptyKindTotals()),
  }));
}

/**
 * 이름 또는 학생코드로 찾는다. 30명에서 자른다. 명단에서 빠진 학생은 옵트인해야
 * 나온다 — 옵션에 기본값을 두지 않아 호출부가 매번 어느 쪽인지 적게 한다.
 */
export async function searchStudents(
  query: string,
  year: number,
  options: {
    includeRemoved: boolean;
    /** 학번을 읽어낸 경우에만 온다. 파싱은 서비스가 한다. */
    studentNumber?: { grade: number; classNo: number; number: number };
  },
) {
  const { studentNumber } = options;

  return prisma.studentProfile.findMany({
    where: {
      user: {
        ...(options.includeRemoved ? {} : { deletedAt: null }),
        role: "STUDENT",
      },
      OR: [
        { user: { name: { contains: query, mode: "insensitive" } } },
        { studentCode: { contains: query, mode: "insensitive" } },
        // 학번은 그 학년도 재적에만 있다 — 명단에서 빠진 학생은 이 갈래로 안 잡히고
        // 학생코드로만 찾힌다. 여기서 year를 빼면 작년 번호로 남의 학생이 나온다.
        ...(studentNumber
          ? [
              {
                enrollments: {
                  some: {
                    year,
                    number: studentNumber.number,
                    schoolClass: {
                      grade: studentNumber.grade,
                      classNo: studentNumber.classNo,
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    take: 30,
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      studentCode: true,
      // deletedAt은 옵트인 여부와 상관없이 낸다 — 조건부 select는 타입이 갈린다.
      user: { select: { name: true, deletedAt: true } },
      // 학적으로 거르지 않는다 — 재학인 줄만 가져오면 화면이 "반 미배정"과
      // "졸업"을 구분할 수 없다. 소속을 재학인 줄에서만 쓰는 규칙은 서비스가 지킨다.
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

/**
 * 학부모의 자녀들. 명단에서 빠진 자녀는 빼고 낸다 — "지금 누구를 고를 수 있나"에
 * 답하는 자리다. 아래 isChildOf는 다른 질문이라 일부러 이 조건이 없다.
 */
export async function listChildren(parentUserId: string) {
  return prisma.parentStudent.findMany({
    where: { parentUserId, student: { user: { deletedAt: null } } },
    select: {
      student: { select: { id: true, user: { select: { name: true } } } },
    },
  });
}

/**
 * 이 학부모와 이 학생이 연결되어 있는가. 소유권 검사의 전부다.
 * `deletedAt` 필터가 없는 것은 의도다 — 명단에서 빠졌다고 부모가 아니게 되지 않는다.
 */
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
 * 화면 머리글용 신원 — 이름·학생코드와 그 학년도의 학급(스냅샷이 아니라 조인이다).
 * deletedAt으로 거르지 않는다 — 걸러 버리면 빠진 학생의 기록에 닿는 경로가 없어진다.
 */
export async function findStudentHeader(id: string, year: number) {
  const profile = await prisma.studentProfile.findFirst({
    where: { id },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true, deletedAt: true } },
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
    /** 명단에서 빠진 날. null이면 명단에 남아 있는 학생이다. */
    removedAt: profile.user.deletedAt,
  };
}

/**
 * 최근 부여 흐름. 취소된 것도 포함한다 — 취소 역시 일어난 일이다.
 * 여기만 입력순(createdAt)이다 — 발생일순으로 세우면 방금 넣은 지난주 기록이
 * 아래로 내려가, 잘못 넣은 것을 되돌리러 온 사람이 못 찾는다.
 */
export async function listRecentAwards(params: { track: MeritTrack; limit: number }) {
  const rows = await prisma.meritAward.findMany({
    where: { track: params.track },
    orderBy: { createdAt: "desc" },
    take: params.limit,
    select: {
      id: true,
      kind: true,
      label: true,
      points: true,
      status: true,
      awardedByName: true,
      occurredOn: true,
      createdAt: true,
      batchId: true,
      studentProfile: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    points: row.points,
    status: row.status,
    awardedByName: row.awardedByName,
    occurredOn: row.occurredOn,
    createdAt: row.createdAt,
    batchId: row.batchId,
    studentProfileId: row.studentProfile.id,
    studentName: row.studentProfile.user.name,
  }));
}

// ── 통계 ──────────────────────────────────────────────────────

/**
 * 학년·반별 요약. 반 편성은 그 학년도 기준, 합계 범위는 트랙 규칙을 따른다.
 * 목록과 합계를 따로 질의해 잇는다 — groupBy만 쓰면 기록이 없는 반이 빠진다.
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
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _sum: { points: true },
  });

  const perStudent = foldByStudent(sums);

  const byClass = new Map<
    string,
    { grade: number; classNo: number; students: number } & KindTotals
  >();
  for (const e of enrollments) {
    const grade = e.schoolClass?.grade;
    const classNo = e.schoolClass?.classNo;
    if (grade === undefined || classNo === undefined) continue;

    const key = `${grade}-${classNo}`;
    const cur =
      byClass.get(key) ?? { grade, classNo, students: 0, ...emptyKindTotals() };
    cur.students += 1;
    // 기록이 없는 학생도 인원에는 든다 — 반 평균의 분모가 명단 인원이어야 한다.
    const mine = perStudent.get(e.studentProfileId);
    if (mine) addKindTotals(cur, mine);
    byClass.set(key, cur);
  }

  return [...byClass.values()]
    .map((row) => {
      const net = netScore(row);
      return {
        ...row,
        net,
        // 인원이 0인 반은 위에서 만들어지지 않으므로 나눗셈이 안전하다.
        avgNet: Math.round((net / row.students) * 10) / 10,
      };
    })
    .sort((a, b) => a.grade - b.grade || a.classNo - b.classNo);
}

/** 많이 나온 항목 순위. 어떤 규정이 실제로 쓰이는지 보여준다. */
export async function topRules(params: {
  track: MeritTrack;
  totalsYear: number | null;
  limit: number;
  studentProfileIds?: string[];
}) {
  const rows = await prisma.meritAward.groupBy({
    by: ["label", "kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
      ...(params.studentProfileIds
        ? { studentProfileId: { in: params.studentProfileIds } }
        : {}),
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

/**
 * 부여자별 집계 — "누가 얼마나 줬나".
 *
 * `awardedByUserId`로 묶는다. 계정이 지워지면 SetNull이 되므로 null 묶음이 생기고,
 * 그쪽은 이름 스냅샷(`awardedByName`)으로 다시 묶어야 "삭제된 계정 3명"이 한 덩어리로
 * 뭉치지 않는다 — 두 질의로 나누는 이유다. 이름을 붙이는 일은 서비스가 한다.
 */
export async function teacherTotals(params: {
  track: MeritTrack;
  totalsYear: number | null;
}) {
  const where = {
    track: params.track,
    status: "ACTIVE",
    ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
  };

  const [byUser, byName] = await Promise.all([
    prisma.meritAward.groupBy({
      by: ["awardedByUserId", "kind"],
      where: { ...where, awardedByUserId: { not: null } },
      _count: { _all: true },
      _sum: { points: true },
    }),
    // 계정이 사라진 기록. 이름 스냅샷이 유일하게 남은 신원이다.
    prisma.meritAward.groupBy({
      by: ["awardedByName", "kind"],
      where: { ...where, awardedByUserId: null },
      _count: { _all: true },
      _sum: { points: true },
    }),
  ]);

  return { byUser, byName };
}

/** 부여자 이름을 살아 있는 계정에서 읽는다 — 스냅샷이 아니라 지금 이름을 보여준다. */
export async function findUserNames(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, deletedAt: true },
  });
}

/**
 * 규정별 집계 — 전체 목록이다(「많이 나온 항목」의 상위 10개와 달리 자르지 않는다).
 * 분류까지 함께 묶어 화면이 분류로 접을 수 있게 한다.
 */
export async function ruleStats(params: {
  track: MeritTrack;
  totalsYear: number | null;
}) {
  const rows = await prisma.meritAward.groupBy({
    by: ["ruleId", "label", "kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
    _count: { _all: true },
    _sum: { points: true },
  });

  // 분류는 부여 기록에 복사돼 있지 않다(규정이 갖는다) — 규정 쪽에서 가져와 붙인다.
  const rules = await prisma.meritRule.findMany({
    where: { id: { in: rows.map((r) => r.ruleId) } },
    select: { id: true, category: true, active: true },
  });

  return { rows, rules };
}

/**
 * 한 번도 쓰이지 않은 규정. 규정표를 다듬을 때 쓴다 — 쓰지 않는 항목이 부여
 * 목록을 길게 만들어 고르는 시간을 늘린다.
 */
export async function unusedRules(params: {
  track: MeritTrack;
  totalsYear: number | null;
}) {
  return prisma.meritRule.findMany({
    where: {
      track: params.track,
      active: true,
      awards: {
        none: {
          status: "ACTIVE",
          ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
        },
      },
    },
    select: { id: true, kind: true, label: true, points: true, category: true },
    orderBy: { label: "asc" },
  });
}

/** 트랙 전체 합계 — 통계 화면 머리글. */
export async function trackTotals(params: {
  track: MeritTrack;
  totalsYear: number | null;
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
      ...(params.studentProfileIds
        ? { studentProfileId: { in: params.studentProfileIds } }
        : {}),
    },
    _count: { _all: true },
    _sum: { points: true },
  });
}

/**
 * 트랙 집계를 **발생일 창**으로 자른다 — 대시보드의 "최근 7일"이 쓴다.
 *
 * 학년도로 자르지 않는 게 핵심이다: 3월 초에는 지난 7일이 두 학년도에 걸치는데,
 * 학년도 필터를 함께 걸면 2월 며칠치가 소리 없이 빠져 "이번 주는 조용했다"로 읽힌다.
 * 창은 날짜만 정한다.
 *
 * kind를 인자로 받는 이유도 같다 — 상쇄점을 뺄지는 화면마다 다른 판단이라
 * 여기서 정하지 않는다.
 */
export async function trackTotalsBetween(params: {
  track: MeritTrack;
  /** 발생일 하한(포함). KST 자정이어야 한다 — occurredOn이 그 눈금이다. */
  since: Date;
  /** 발생일 상한(제외). */
  until: Date;
  kinds: readonly MeritKind[];
}) {
  return prisma.meritAward.groupBy({
    by: ["kind"],
    where: {
      track: params.track,
      status: "ACTIVE",
      kind: { in: [...params.kinds] },
      occurredOn: { gte: params.since, lt: params.until },
    },
    _count: { _all: true },
    _sum: { points: true },
  });
}

/**
 * 학생별 벌점 합계. 재적이 아니라 부여 쪽에서 모은다 — 명단에서 시작하면 재적
 * 행이 없는 학생(반 미배정)이 빠지는데, 그쪽이야말로 놓치면 안 되는 사람이다.
 * 순점수가 아니라 벌점 총합만 센다.
 */
export async function demeritTotalsByStudent(params: {
  track: MeritTrack;
  /** null이면 전체 누적(기숙사). */
  totalsYear: number | null;
  /** 주면 이 학생들 것만. 반을 골라 보는 화면이 쓴다. */
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.groupBy({
    by: ["studentProfileId"],
    where: {
      track: params.track,
      kind: "DEMERIT",
      status: "ACTIVE",
      // 지워진 계정은 명단에 올리지 않는다. groupBy도 관계 조건을 받는다.
      studentProfile: { user: { deletedAt: null } },
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
      ...(params.studentProfileIds
        ? { studentProfileId: { in: params.studentProfileIds } }
        : {}),
    },
    _sum: { points: true },
  });
}

/** 이름·학생코드와 그 학년도의 소속. 기준 초과 명단이 id 목록에 신원을 붙인다. */
export async function findStudentsWithClass(ids: string[], year: number) {
  if (ids.length === 0) return [];

  return prisma.studentProfile.findMany({
    where: { id: { in: ids }, user: { deletedAt: null } },
    select: {
      id: true,
      studentCode: true,
      user: { select: { name: true } },
      enrollments: {
        where: { year, status: "ENROLLED" },
        take: 1,
        select: {
          number: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
    },
  });
}

// ── 그래프용 조회 ─────────────────────────────────────────────

/**
 * 그래프에 쓸 원자료. 애플리케이션에서 묶는다 — Prisma groupBy로는 월 단위로
 * 자를 수 없고, 월 구분은 KST 기준이어야 한다(UTC면 밤 9시 이후가 전날로 밀린다).
 * 분류는 스냅샷되지 않으므로 규정 쪽에서 함께 가져온다.
 */
export async function listAwardsForChart(params: {
  track: MeritTrack;
  year: number | null;
  /** 이 날 이후에 **일어난** 것만. 기숙사(누적)의 최근 12개월을 자를 때 쓴다. */
  since?: Date;
  /** 주면 이 학생들 것만. 반을 골라 보는 화면이 쓴다. */
  studentProfileIds?: string[];
}) {
  return prisma.meritAward.findMany({
    where: {
      track: params.track,
      status: "ACTIVE",
      ...(params.year === null ? {} : { year: params.year }),
      // 하한도 발생일로 잡는다 — createdAt으로 자르면 축과 기준이 어긋난다.
      ...(params.since ? { occurredOn: { gte: params.since } } : {}),
      ...(params.studentProfileIds
        ? { studentProfileId: { in: params.studentProfileIds } }
        : {}),
    },
    select: {
      occurredOn: true,
      kind: true,
      points: true,
      rule: { select: { category: true } },
    },
  });
}
