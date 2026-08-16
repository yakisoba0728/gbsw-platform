import { prisma } from "@/core/db/client";
import {
  addKindPoints,
  addKindTotals,
  emptyKindTotals,
  netScore,
  withNetScore,
  type KindTotals,
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
 * 규정 삭제. **행은 지우지 않고 active를 내린다.**
 *
 * 이미 나간 부여가 ruleId를 참조하고(onDelete: Restrict) "이 규정으로 몇 건
 * 나갔나"를 세려면 원본이 필요하다. 화면에서는 목록에서 사라지므로 삭제와
 * 구분되지 않는다 — 부여 기록은 label·points를 스냅샷해 두어 규정이 없어져도
 * "왜 이 점수를 받았는지"가 그대로 남는다.
 */
export async function markRuleDeleted(id: string): Promise<void> {
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
const KIND_ORDER: Record<string, number> = { MERIT: 0, DEMERIT: 1, OFFSET: 2 };

/**
 * 규정 정렬: **종류 → 분류 → 점수**.
 *
 * 학교 규정표가 이 순서로 되어 있고, 읽는 사람도 "상점 중에 교내 환경 항목"처럼
 * 찾는다. 분류는 한글 가나다순이며 — 원본 표의 분류 순서가 마침 가나다순이라
 * 표를 그대로 재현한다. 분류가 없는 규정(관리자가 나중에 만든 것)은 맨 뒤로 간다.
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

/**
 * 규정 관리 화면의 목록. **삭제된 규정은 나오지 않는다.**
 *
 * 삭제는 되돌리는 화면이 없다 — 잘못 지웠으면 같은 내용으로 새로 만든다.
 * 지난 부여 기록은 스냅샷이라 그대로 남는다.
 */
export async function listRules(track: MeritTrack) {
  const rules = await prisma.meritRule.findMany({
    where: { track, active: true },
    // 순서는 아래 byKindCategoryPoints가 세운다. 여기서는 결과가 매번 같도록
    // 안정적인 기준만 준다 — 같은 (종류·분류·점수)가 여럿일 때 화면이 흔들리지 않게.
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
 *
 * **정렬은 발생일 기준이다.** 사람이 읽는 것은 "언제 일어났나"의 시간순이지
 * "언제 입력됐나"가 아니다 — 지난주 일을 오늘 넣으면 입력순 목록에서는 그것이
 * 맨 위에 서서, 확인서를 받아 든 사람이 사건 순서를 거꾸로 읽는다.
 * 같은 날이 여럿이면 입력순으로 가른다 (순서가 매번 흔들리지 않게).
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
      // 화면이 "6월 12일에 일어난 일을 8월 16일에 넣었다"를 보여줄 수 있어야
      // 하므로 입력 시각도 함께 낸다.
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
    // 부여가 쓰는 것은 id(존재 확인)와 이름(감사로그)뿐이다.
    select: { id: true, user: { select: { name: true } } },
  });
}

// ── 일괄 부여·취소 ────────────────────────────────────────────

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

/**
 * 여러 학생을 한 번에 찾는다. 일괄 부여가 쓴다 —
 * 예전엔 학생 수만큼(최대 100회) 순차로 왕복했다.
 *
 * 못 찾은 id가 있으면 결과 길이가 줄어든다. 호출부가 길이로 판별한다.
 */
export async function findStudentProfilesByIds(ids: string[]) {
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
      // 단건 취소(findAward)와 같은 이유로 이름을 함께 가져온다. 없으면 28명
      // 묶음의 감사로그 28줄이 전부 똑같아져 누구 기록이 뒤집혔는지 구분되지 않는다.
      studentProfile: { select: { user: { select: { name: true } } } },
    },
  });
}

/**
 * 여러 건을 한 번에 취소하고 **실제로 고친 것의 id만** 돌려준다.
 *
 * **묶음(batchId)이 아니라 id 목록을 받는다.** 호출부는 미리 조회한 목록을 근거로
 * 감사로그를 남기는데, 갱신 범위가 그 목록과 다르면 로그와 실제가 어긋난다 —
 * 목록에 없던 행이 뒤집히면 이름 없는 취소가 되고, 목록에 있던 행이 그 사이 남에게
 * 취소되면 "내가 취소했다"는 거짓 줄이 남는다. id로 좁히고 결과를 돌려주면 둘 다 없다.
 *
 * **ACTIVE인 것만 고친다** — 단건 취소와 같은 이유로, 먼저 취소한 사람의
 * 이름·사유·시각을 덮지 않는다.
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
      // 한 번의 취소는 한 시각이다 — 행마다 new Date()를 부르면 같은 작업이
      // 밀리초 단위로 흩어져 로그를 시각으로 묶을 수 없다.
      cancelledAt: new Date(),
      cancelReason: by.reason,
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}

// ── 목록 조회 ─────────────────────────────────────────────────

/**
 * groupBy(학생·종류) 결과를 학생별 합계로 접는다. 반 명단과 반별 요약이 함께 쓴다.
 *
 * 접는 규칙은 merit-track이 갖고 있다 — 여기서 손으로 종류를 나누면 종류가 늘었을 때
 * 이 파일만 조용히 옛 계산을 계속한다.
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
      // **학적으로 거르지 않는다.** 재학인 줄만 가져오면 졸업·자퇴 학생은 재적 줄이
      // 통째로 빠져, 화면이 "반 미배정"과 "졸업"을 구분할 수 없다. 소속을 재학인
      // 줄에서만 쓰는 규칙은 서비스가 지킨다 (findStudentHeader와 같은 방식).
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
 *
 * **학적(status)도 함께 낸다** — searchStudents와 같은 이유다. 졸업·자퇴 학생에게
 * 준 벌점은 반 명단·통계에 안 나타나므로, 이 화면이 그 사실을 알려줄 유일한 자리다.
 * 다만 소속은 재학 여부와 무관하게 그 학년도 줄 그대로 낸다 — 머리글은 학적을
 * 나란히 적을 자리가 있어서 "3학년 1반 · 졸업"으로 읽히기 때문이다. 한 줄에
 * 욱여넣는 검색 결과 쪽은 반대로 소속을 비운다.
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

/**
 * 최근 부여 흐름. "오늘 무슨 일이 있었나"를 한 눈에 보는 용도라
 * 취소된 것도 포함한다 — 취소 역시 일어난 일이다.
 *
 * **여기만 입력순(createdAt)을 유지한다.** 이 화면이 답하는 질문은 "방금 무엇이
 * 들어왔나"이지 "언제 일어났나"가 아니다 — 발생일순으로 세우면 지난주 일을 방금
 * 넣은 기록이 목록 아래로 내려가, 잘못 넣은 것을 되돌리러 온 사람이 못 찾는다.
 * 대신 발생일을 함께 실어 화면이 두 날짜를 나란히 보여준다.
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
 * 학생별 **벌점** 합계. 기준 초과 명단이 쓴다.
 *
 * **재적이 아니라 부여 쪽에서 모은다.** 명단에서 시작해 학생마다 합계를 붙이면
 * 그 학년도 재적 행이 없는 학생(반 미배정, 학적 변동 중)이 통째로 빠지는데,
 * 이 화면이 답해야 하는 질문("선을 넘은 사람이 누구인가")에서 그쪽이야말로
 * 놓치면 안 되는 사람이다. 소속은 뒤에 붙이고, 없으면 없다고 적는다.
 *
 * 순점수가 아니라 벌점 총합만 센다 — 상점으로 덮었다고 규정 위반이 없던 일이
 * 되지는 않는다 (demeritLevel과 같은 기준).
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
      // 취소된 기록은 빠진다 — 다른 집계 경로와 같은 규칙이다. 취소한 벌점 때문에
      // 선도위 명단에 오르면 그건 취소가 취소가 아니라는 뜻이 된다.
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

/**
 * 이름·학생코드와 **그 학년도의** 소속. 기준 초과 명단이 id 목록에 신원을 붙인다.
 * 소속을 스냅샷하지 않고 조인하는 이유는 findStudentHeader와 같다.
 */
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
 * 그래프에 쓸 원자료. 부여 시각·종류·점수·규정만 가져와 애플리케이션에서 묶는다.
 *
 * Prisma의 groupBy로는 월 단위로 자를 수 없고(date_trunc를 못 쓴다), 무엇보다
 * **월 구분은 KST 기준이어야 한다** — UTC로 자르면 밤 9시 이후 부여가 전날로
 * 밀린다. 전교 300명 한 학년도면 수천 행 규모라 애플리케이션에서 묶어도 된다.
 *
 * ruleId를 함께 가져오는 이유: 부여 기록은 label·points만 스냅샷하고 **분류는
 * 스냅샷하지 않는다.** 분류별 분포를 내려면 규정 쪽에서 가져와야 한다
 * (규정 행은 지우지 않으므로 항상 이어진다).
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
      // 하한도 발생일로 잡는다. createdAt으로 자르면 축과 기준이 어긋나서,
      // 축 밖의 행을 실어 왔다가 monthlyTotals가 버리고(헛일) 정작 지난달에
      // 일어난 일을 오늘 입력한 기록은 하한에 걸려 빠진다.
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
