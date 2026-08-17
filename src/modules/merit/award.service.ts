import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import {
  addKindPoints,
  emptyKindTotals,
  isYearScoped,
  MERIT_TRACK_LABELS,
  withNetScore,
  type MeritTrack,
  type NetTotals,
} from "@/core/authz/merit-track";
import { schoolYearRange } from "./merit.chart";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import { toHistorySheet, toRosterSheet } from "./merit.export";
import * as repo from "./merit.repo";
import { BULK_AWARD_LIMIT } from "./merit.schema";
import type {
  AwardInput,
  BulkAwardInput,
  CancelBatchInput,
  CancelInput,
  ClassRosterInput,
  StudentHistoryExportInput,
} from "./merit.schema";

/**
 * 순점수 = 상점 + 상쇄점 − 벌점. 상쇄점은 벌점을 덜어내므로 순점수를 올린다.
 *
 * 계산은 core/authz/merit-track이 한다 — 반 명단·반별 요약·월별 추이도 같은
 * 헬퍼를 쓰므로 화면마다 다른 순점수가 뜰 수 없다.
 */
export type MeritTotals = NetTotals;

export type StudentMeritView = {
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  totals: MeritTotals;
  awards: Awaited<ReturnType<typeof repo.listAwards>>;
};

const EMPTY_TOTALS: MeritTotals = withNetScore(emptyKindTotals());

/**
 * 합계를 셀 학년도를 정한다. **이 함수 하나가 "교내는 매년 초기화, 기숙사는 누적"의
 * 구현 전부다.** null이면 repo가 학년도 조건을 붙이지 않는다.
 *
 * 기숙사는 넘어온 year를 무시한다 — 누적이라 고를 것이 없고, 화면에도 선택이 없다.
 *
 * 통계(stats.service)도 같은 범위를 써야 하므로 내보낸다. 두 벌이 되면 통계 화면과
 * 학생 화면의 합계가 갈린다.
 */
export async function scopeYear(
  track: MeritTrack,
  year?: number,
): Promise<number | null> {
  if (!isYearScoped(track)) return null;
  return year ?? (await getCurrentYear());
}

/**
 * groupBy 결과(종류별 한 줄)를 화면이 쓰는 모양으로 접는다.
 *
 * 접는 규칙 자체는 merit-track이 갖고 있다 — 여기서는 Prisma의 `_sum` 껍데기만
 * 벗긴다. 상쇄점이 자기 칸에 남는 이유도 그쪽에 적혀 있다.
 */
export function sumTotals(
  rows: { kind: string; _sum: { points: number | null } }[],
): MeritTotals {
  const totals = emptyKindTotals();
  for (const row of rows) {
    addKindPoints(totals, row.kind, row._sum.points ?? 0);
  }
  return withNetScore(totals);
}

/**
 * 발생일이 그 학년도 안이고 미래가 아닌지 본다.
 *
 * **이 검사는 그래프가 조용히 틀리는 것을 막는 장치다.** 부여는 언제나
 * `getCurrentYear()`의 학년도로 들어가는데, 월별 추이의 축은 그 학년도의 12칸
 * (3월~이듬해 2월)이고 `monthlyTotals`는 축 밖의 기록을 **말없이 버린다.**
 * 발생일을 아무 값이나 받으면 "부여했습니다"가 뜬 기록이 어느 화면에도
 * 안 나타나는 상태가 만들어진다 — 아무도 눈치채지 못하는 종류의 실패다.
 *
 * 미래 날짜는 학년도 창(2월 말까지)만으로는 못 거른다 — 8월에 다음 1월을
 * 골라도 창 안이다. 그래서 따로 본다. 있을 수 없는 기록이기도 하다.
 */
function assertOccurredOn(occurredOn: Date, year: number, now: Date): void {
  const { start, endExclusive } = schoolYearRange(year);
  if (occurredOn < start || occurredOn >= endExclusive) {
    throw new MeritError("OCCURRED_OUT_OF_YEAR");
  }
  if (occurredOn.getTime() > now.getTime()) {
    throw new MeritError("OCCURRED_IN_FUTURE");
  }
}

/**
 * 상벌점 부여.
 *
 * **학년도는 입력이 아니라 getCurrentYear()가 정한다.** 화면의 학년도 선택은
 * 조회 전용이며, 그 값이 여기로 흘러들면 지난 학년도를 들여다보던 관리자가
 * 새 벌점을 거기 꽂는 사고가 난다.
 *
 * **발생일은 입력이다.** 세션에서 유도할 수 없는 사실이라서다 — 금요일 일을
 * 월요일에 넣는 사람만 그 날짜를 안다. 대신 학년도 창 안인지 여기서 본다.
 *
 * 규정 값(track·kind·label·points)을 복사해 넣는다 — 나중에 규정을 고쳐도
 * 이미 준 기록은 안 흔들린다.
 */
export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
  /** 미래 판정의 기준 시각. 인자로 받아야 테스트가 오늘 날짜에 안 흔들린다. */
  now: Date = new Date(),
): Promise<void> {
  await assertCan(actor, "merit:award");

  const rule = await repo.findRule(input.ruleId);
  if (!rule) throw new MeritError("RULE_NOT_FOUND");
  if (!rule.active) throw new MeritError("RULE_INACTIVE");

  // **부여는 명단에 있는 학생에게만 한다.** 조회는 명단에서 빠진 학생도 열려 있지만
  // (getStudentHeader·searchStudents의 includeRemoved) 부여는 열지 않는다 — 명단에
  // 없는 사람에게 새 상벌점을 주는 것은 조회와 전혀 다른 일이다. 그 경계가
  // findAwardableStudent라는 이름과 그 where 절에 있다.
  const student = await repo.findAwardableStudent(input.studentProfileId);
  if (!student) throw new MeritError("STUDENT_NOT_FOUND");

  const year = await getCurrentYear();
  assertOccurredOn(input.occurredOn, year, now);

  const { id } = await repo.createAward({
    studentProfileId: student.id,
    year,
    ruleId: rule.id,
    track: rule.track,
    kind: rule.kind,
    label: rule.label,
    points: rule.points,
    occurredOn: input.occurredOn,
    note: input.note,
    awardedByUserId: actor.id,
    awardedByName: actor.name,
    batchId: null,
  });

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:award",
    targetType: "MeritAward",
    targetId: id,
    metadata: {
      studentProfileId: student.id,
      studentName: student.user.name,
      year,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      // 감사로그는 입력 시각(로그 자체의 createdAt)을 이미 들고 있다. 발생일은
      // 사람이 고른 값이라 따로 남겨야 "언제 일어난 일로 넣었나"를 되짚을 수 있다.
      occurredOn: input.occurredOn.toISOString(),
    },
  });
}

/**
 * 취소. **관리자면 누구나 할 수 있다** — 교직원 사이에 권한 차등이 없으므로
 * "자기가 준 것만"은 근거가 없고, 준 사람이 출장·퇴직이면 아무도 못 고치게 된다.
 * 책임 추적은 필수 사유(zod) + 이름 스냅샷 + 감사로그가 맡는다.
 *
 * 기록은 지우지 않는다 — 취소 표시가 붙은 채로 목록에 남고 합계에서만 빠진다.
 */
export async function cancelAward(
  actor: SessionUser,
  input: CancelInput,
): Promise<void> {
  await assertCan(actor, "merit:cancel");

  const award = await repo.findAward(input.awardId);
  if (!award) throw new MeritError("AWARD_NOT_FOUND");
  if (award.status !== "ACTIVE") throw new MeritError("ALREADY_CANCELLED");

  // 사전 검사와 갱신 사이에 남이 먼저 취소했으면 0이 온다. 그때 감사로그까지
  // 남기면 "두 사람이 취소했다"는 거짓 기록이 생긴다.
  const cancelled = await repo.cancelAward(award.id, {
    userId: actor.id,
    name: actor.name,
    reason: input.reason,
  });
  if (cancelled === 0) throw new MeritError("ALREADY_CANCELLED");

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:cancel",
    targetType: "MeritAward",
    targetId: award.id,
    metadata: {
      studentProfileId: award.studentProfileId,
      // 로그 화면이 "누구의 무엇을 취소했나"를 보여주려면 이름이 있어야 한다.
      studentName: award.studentProfile.user.name,
      track: award.track,
      kind: award.kind,
      label: award.label,
      points: award.points,
      reason: input.reason,
    },
  });
}

/**
 * 묶음 통째로 취소. 잘못 고른 항목으로 30명에게 줬을 때 한 명씩 30번 되돌리지
 * 않게 한다 — 그 30번이 각각 다른 사유로 기록되면 나중에 읽을 수도 없다.
 *
 * 단건 취소와 같은 규칙을 따른다: 사유 필수, ACTIVE인 것만, 감사로그는 건별 1줄.
 * 그 사이 누가 몇 건을 먼저 취소했으면 그건 건드리지 않는다.
 */
export async function cancelBatch(
  actor: SessionUser,
  input: CancelBatchInput,
): Promise<{ count: number }> {
  await assertCan(actor, "merit:cancel");

  const awards = await repo.findBatch(input.batchId);
  if (awards.length === 0) throw new MeritError("BATCH_NOT_FOUND");

  // 조회와 갱신 사이에 남이 몇 건을 단건으로 취소할 수 있다. repo는 **실제로
  // 뒤집힌 것의 id만** 돌려주고, 감사로그는 그것들에만 남긴다 — 조회한 건수로
  // 남기면 남이 취소한 건까지 "내가 취소했다"로 기록된다. 단건 경로의
  // `cancelled === 0` 검사가 막는 것과 같은 거짓이며, 묶음에서는 그 거짓이
  // 전부가 아니라 몇 줄만 섞여 들어와 더 알아채기 어렵다.
  const cancelled = new Set(
    await repo.cancelAwards(
      awards.map((award) => award.id),
      { userId: actor.id, name: actor.name, reason: input.reason },
    ),
  );
  if (cancelled.size === 0) throw new MeritError("ALREADY_CANCELLED");

  await Promise.all(
    awards
      .filter((award) => cancelled.has(award.id))
      .map((award) =>
        recordAudit({
          actorUserId: actor.id,
          actorName: actor.name,
          action: "merit:cancel",
          targetType: "MeritAward",
          targetId: award.id,
          metadata: {
            studentProfileId: award.studentProfileId,
            // 묶음은 트랙·종류·점수·항목이 전부 같다 — 이름이 없으면 28줄이
            // 완전히 동일해져 누구 기록이 뒤집혔는지 로그만으로는 알 수 없다.
            studentName: award.studentProfile.user.name,
            track: award.track,
            kind: award.kind,
            label: award.label,
            points: award.points,
            reason: input.reason,
            batchId: input.batchId,
          },
        }),
      ),
  );

  return { count: cancelled.size };
}

/** 관리자가 보는 한 학생의 트랙별 현황. */
export async function getStudentMerit(
  actor: SessionUser,
  studentProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertCan(actor, "merit:read:any");
  return readMerit(studentProfileId, track, year);
}

/**
 * 화면 머리글용 신원 — 누구의 화면인지 알려준다.
 *
 * 상세 화면에 이름이 없으면 탭을 두 개 열어 놓고 비교하다가 엉뚱한 학생에게
 * 벌점을 줘도 화면에 아무 반증이 없다. 합계 3칸은 그냥 숫자 세 개일 뿐이다.
 *
 * 학급은 **현재 학년도 기준**이다. 지난 학년도 기록을 보고 있어도 "지금 몇 반인가"가
 * 사람을 식별하는 정보이므로 그쪽이 맞다.
 *
 * **명단에서 빠진 학생도 돌려준다** (`removedAt`이 그 날짜를 싣는다). 예전에는 repo가
 * 걸러서 null이 왔고, 상세 화면이 그대로 `notFound()`로 떨어져 자퇴생의 벌점 내역에
 * 닿는 경로가 아예 없었다(감사 M-2). 이 함수를 지나는 곳은 상세·확인서·내보내기
 * 셋뿐이고 전부 `merit:read:any`(=관리자)를 요구한다. 화면은 removedAt으로
 * "삭제됨"을 알리고 부여 폼을 감춘다.
 */
export async function getStudentHeader(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCan(actor, "merit:read:any");
  return repo.findStudentHeader(studentProfileId, await getCurrentYear());
}

/**
 * 본인 조회. **studentProfileId를 인자로 받지 않는다** — 세션에서 유도한다.
 * URL 파라미터를 바꿔 남의 기록을 보는 경로가 존재하지 않는다.
 *
 * 학생 신원이 없으면(관리자·학부모가 이 함수를 타는 경우) 빈 결과를 준다.
 * 화면이 터지는 것보다 "기록 없음"이 맞는 표현이다.
 */
export async function getMyMerit(
  sessionUser: SessionUser,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) {
    return { track, year: await scopeYear(track, year), totals: EMPTY_TOTALS, awards: [] };
  }
  return readMerit(profile.id, track, year);
}

/** 권한 검사를 끝낸 뒤의 공통 조회. 외부로 내보내지 않는다. */
async function readMerit(
  studentProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const scoped = await scopeYear(track, year);

  const [rows, awards] = await Promise.all([
    repo.totals({ studentProfileId, track, year: scoped }),
    repo.listAwards({ studentProfileId, track, year: scoped }),
  ]);

  return { track, year: scoped, totals: sumTotals(rows), awards };
}

/**
 * 여러 명에게 한 번에 부여.
 *
 * 한 트랜잭션으로 넣고 같은 batchId를 공유한다. **감사로그는 학생 1명당 1줄**이다 —
 * 일괄이어도 "이 학생이 왜 벌점을 받았나"를 건별로 추적해야 한다.
 * (enrollment.service.saveEnrollments와 같은 원칙)
 *
 * 학생 확인을 전부 끝낸 뒤에 쓴다. 한 명이라도 없으면 아무것도 넣지 않는다.
 */
export async function bulkAwardMerit(
  actor: SessionUser,
  input: BulkAwardInput,
  /** 미래 판정의 기준 시각. 단건 부여와 같은 이유로 인자로 받는다. */
  now: Date = new Date(),
): Promise<{ count: number }> {
  await assertCan(actor, "merit:award");

  const rule = await repo.findRule(input.ruleId);
  if (!rule) throw new MeritError("RULE_NOT_FOUND");
  if (!rule.active) throw new MeritError("RULE_INACTIVE");

  // 화면에서 같은 학생이 두 번 넘어와도 한 번만 준다.
  const ids = [...new Set(input.studentProfileIds)];
  if (ids.length === 0) throw new MeritError("NO_STUDENTS");
  // zod가 이미 막지만 여기서도 센다. 이건 입력 형식이 아니라 "한 번에 이만큼까지"라는
  // 업무 규칙이고, 규칙은 서비스가 지켜야 서버 액션을 새로 만들 때 함께 딸려 온다.
  if (ids.length > BULK_AWARD_LIMIT) throw new MeritError("TOO_MANY_STUDENTS");

  // DB에 쓰기 전에 전부 확인한다 — 절반만 들어가는 상태를 만들지 않는다.
  // 한 번에 조회한다: 예전엔 학생 수만큼 순차 왕복(최대 100회)이었다.
  // 단건과 같은 조건이다 — 명단에서 빠진 학생은 여기서 걸려 묶음 전체가 거부된다.
  const found = await repo.findAwardableStudents(ids);
  if (found.length !== ids.length) throw new MeritError("STUDENT_NOT_FOUND");

  // 넘어온 순서를 지킨다 — 감사로그를 이 순서로 남기므로 화면 선택 순서와 맞는다.
  const byId = new Map(found.map((s) => [s.id, s]));
  const students = ids.map((id) => byId.get(id)!);

  const year = await getCurrentYear();
  assertOccurredOn(input.occurredOn, year, now);

  const batchId = randomUUID();

  const created = await repo.createAwards(
    students.map((student) => ({
      studentProfileId: student.id,
      year,
      ruleId: rule.id,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      occurredOn: input.occurredOn,
      note: input.note,
      awardedByUserId: actor.id,
      awardedByName: actor.name,
      batchId,
    })),
  );

  // 커밋된 뒤에 기록한다. 감사 실패가 부여를 되돌리지는 않는다 (core/audit 규약).
  // 감사 기록은 서로 독립이라 함께 보낸다. 건별 1줄이라는 규칙은 그대로다.
  await Promise.all(
    created.map((row, index) => {
      const student = students[index];
      return recordAudit({
        actorUserId: actor.id,
        actorName: actor.name,
        action: "merit:award",
        targetType: "MeritAward",
        targetId: row.id,
        metadata: {
          studentProfileId: student.id,
          studentName: student.user.name,
          year,
          track: rule.track,
          kind: rule.kind,
          label: rule.label,
          points: rule.points,
          occurredOn: input.occurredOn.toISOString(),
          batchId,
        },
      });
    }),
  );

  return { count: created.length };
}

/**
 * 반별 목록.
 *
 * **반은 그 학년도 기준, 합계는 트랙 규칙을 따른다.** 기숙사 탭에서도 "2026학년도
 * 2학년 3반"의 명단을 보되 각자의 합계는 입학부터 전체 누적이다 — 반 편성은
 * 학년도 개념이지만 기숙사 점수는 아니기 때문이다.
 */
export async function getClassRoster(
  actor: SessionUser,
  params: { grade: number; classNo: number; track: MeritTrack; year?: number },
) {
  await assertCan(actor, "merit:read:any");

  const year = params.year ?? (await getCurrentYear());

  return repo.listClassRoster({
    year,
    grade: params.grade,
    classNo: params.classNo,
    track: params.track,
    totalsYear: await scopeYear(params.track, params.year),
  });
}

/**
 * 이름 또는 학생코드로 찾는다. 반·번호·학적은 현재 학년도 기준이다.
 *
 * **학적(status)을 함께 낸다.** 부여는 학적을 보지 않는다 — 자퇴 처리 중인 학생에게도
 * 기록할 일이 있어 일부러 막지 않았다. 그런데 졸업·자퇴 학생에게 준 벌점은 반
 * 명단(재학만 센다)에도 통계에도 안 나타나서, 준 사람은 화면 어디서도 그 기록을 다시
 * 만나지 못한다. 막는 대신 **주기 전에 보이게** 한다.
 *
 * 소속은 재학인 줄에서만 쓴다. 졸업생의 마지막 자리를 그대로 보이면 지금도 그 반인
 * 것처럼 읽히기 때문이다 — 학적은 따로 내보내므로 화면이 "졸업"이라고 적을 수 있다.
 *
 * **명단에서 빠진(소프트 삭제된) 학생은 `includeRemoved`를 켜야 나온다.** 기본이
 * 지금과 같아야 상벌점을 줄 상대를 고르는 자리(부여 화면의 검색)가 안 흔들린다 —
 * 켜는 자리는 지난 기록을 찾으러 온 화면(`/merit/students`) 하나뿐이다.
 * 어느 쪽이든 `merit:read:any`를 요구하므로 학생·학부모는 여기까지 오지 못한다.
 */
export async function searchStudents(
  actor: SessionUser,
  query: string,
  options: { includeRemoved?: boolean } = {},
) {
  await assertCan(actor, "merit:read:any");

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const year = await getCurrentYear();
  const rows = await repo.searchStudents(trimmed, year, {
    includeRemoved: options.includeRemoved ?? false,
  });

  return rows.map((row) => {
    const enrollment = row.enrollments[0];
    const enrolled = enrollment?.status === "ENROLLED" ? enrollment : null;
    return {
      studentProfileId: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      grade: enrolled?.schoolClass?.grade ?? null,
      classNo: enrolled?.schoolClass?.classNo ?? null,
      number: enrolled?.number ?? null,
      // 그 학년도 재적 줄이 아예 없으면 null — 아직 아무 학적도 아니다
      // (enrollment.repo.listByYear와 같은 표기).
      status: enrollment?.status ?? null,
      // 명단에서 빠진 날. 소프트 삭제는 그 학년도 Enrollment를 실제로 지우므로
      // 이 학생들은 소속·학적이 전부 비어 있다 — 화면이 그 빈칸을 "삭제됨"으로
      // 설명할 유일한 재료다.
      removedAt: row.user.deletedAt,
    };
  });
}

/**
 * 이 학생에게 기록이 있는 학년도들 (내림차순). 교내 탭의 학년도 선택지에 쓴다.
 *
 * **부르는 자리가 셋이고 studentProfileId의 출처가 저마다 다르다** — 관리자 화면은
 * URL 파라미터, 학부모 화면은 자녀 목록, 학생 화면은 세션. 예전에는 함수 하나가
 * 셋을 다 받으면서 권한을 전혀 안 봤고, 주석이 "안전한 호출 경로"를 둘만 열거해
 * 실제 호출부를 담지 못했다 — 다음 사람이 그 주석을 믿는 것이 더 큰 문제였다.
 * 그래서 출처마다 함수를 나누고 각자 자기 근거를 검사한다.
 *
 * 이쪽은 관리자용 — 형제 함수 getStudentHeader·getStudentMerit과 같은 검사다.
 */
export async function listAwardYears(
  actor: SessionUser,
  studentProfileId: string,
): Promise<number[]> {
  await assertCan(actor, "merit:read:any");
  return repo.listAwardYears(studentProfileId);
}

/** 본인 조회. studentProfileId를 인자로 받지 않는다 — getMyMerit과 같은 이유. */
export async function listMyAwardYears(sessionUser: SessionUser): Promise<number[]> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listAwardYears(profile.id);
}

/** 학부모의 자녀 조회. 연결을 확인한다 — getChildMerit과 같은 근거다. */
export async function listChildAwardYears(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<number[]> {
  await assertIsChildOf(sessionUser, childProfileId);
  return repo.listAwardYears(childProfileId);
}

/** 로그인한 학부모의 자녀들. 화면의 자녀 선택에 쓴다. */
export async function listMyChildren(sessionUser: SessionUser) {
  const links = await repo.listChildren(sessionUser.id);
  return links.map((link) => ({
    studentProfileId: link.student.id,
    name: link.student.user.name,
  }));
}

/**
 * 이 학부모와 이 학생이 실제로 연결되어 있는가.
 *
 * `can()`으로 가를 수 없는 거부다 — 학부모 역할이 있다는 것과 **이** 학생의
 * 학부모라는 것은 다른 문제다. 연결을 직접 확인하고 ForbiddenError를 던지되,
 * 거부 감사로그는 assertCan과 같은 방식으로 남긴다
 * (invite.service.ts의 revokeInvite와 같은 처리).
 *
 * 자녀를 보는 경로가 둘(내역·학년도 선택지)이라 여기 모아 둔다 — 한쪽만 검사하면
 * 그쪽이 곧 우회로가 된다.
 */
async function assertIsChildOf(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<void> {
  if (await repo.isChildOf(sessionUser.id, childProfileId)) return;

  try {
    await recordAudit({
      actorUserId: sessionUser.id,
      actorName: sessionUser.name,
      action: "authz:denied",
      targetType: "MeritAward",
      metadata: { action: "merit:read:child", studentProfileId: childProfileId },
    });
  } catch {
    // 감사 기록 실패가 거부 자체를 막지 않는다.
  }
  throw new ForbiddenError("merit:read:child");
}

/** 학부모의 자녀 조회. 연결 확인이 곧 권한이다. */
export async function getChildMerit(
  sessionUser: SessionUser,
  childProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertIsChildOf(sessionUser, childProfileId);
  return readMerit(childProfileId, track, year);
}

/**
 * 최근 부여 흐름. "오늘 무슨 일이 있었나"를 훑는 용도라 취소된 것도 보여준다 —
 * 취소 역시 일어난 일이고, 빠지면 목록이 조용히 짧아져 더 헷갈린다.
 */
export async function listRecentAwards(actor: SessionUser, track: MeritTrack) {
  await assertCan(actor, "merit:read:any");
  return repo.listRecentAwards({ track, limit: RECENT_AWARD_LIMIT });
}

const RECENT_AWARD_LIMIT = 30;

// ── 엑셀 내보내기 ───────────────────────────────────────────────
//
// **시트 조립은 서비스가 한다.** 예전엔 `app/(app)/merit/actions.ts`가
// merit.export의 순수 함수를 직접 부르고 파일명까지 만들었다 — 명단 쪽
// (`roster.service.exportRoster`)은 진작 서비스에 있어서, 같은 성격의 일이
// 모듈마다 다른 층에 있었다. 액션에 업무 로직이 남으면 "진입점만 갈아끼워
// 옮길 수 있다"는 이 저장소의 아키텍처 결정(CLAUDE.md)이 그만큼 깨진다.
//
// **서버는 xlsx 파일을 만들지 않는다.** 행렬만 돌려주고 클라이언트가
// write-excel-file/browser로 만든다 (명단 내보내기와 같은 방식). 그 경계는
// 그대로 두고 조립 위치만 옮긴 것이다.
//
// 파일명까지 여기서 만드는 이유: 학생 이름과 "누적이냐 그 학년도냐"는 이
// 함수가 조회한 결과에만 있다. 화면에 돌려주고 거기서 조립하게 하면 화면이
// 트랙별 조회 범위 규칙(isYearScoped)을 다시 알아야 한다.
// (명단 쪽은 `{ year, rows }`만 돌려주고 파일명을 화면이 만든다 — 거긴 학년도
// 하나면 충분해서 그렇다. 모양이 다른 것은 이 차이 때문이다.)
//
// 읽기만 하므로 recordAudit을 남기지 않는다 (프로젝트 규칙은 생성·수정·삭제에만
// 요구한다). 아래 함수들이 부르는 조회 함수도 각자 assertCan을 하지만, 여기서도
// 먼저 검사한다 — defense-in-depth이고, 거부는 첫 검사에서 그대로 던져진다.

/** 반별 목록 시트. */
export async function exportClassRoster(
  actor: SessionUser,
  params: ClassRosterInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const year = params.year ?? (await getCurrentYear());
  const rows = await getClassRoster(actor, params);

  return {
    rows: toRosterSheet(rows, {
      track: params.track,
      year,
      grade: params.grade,
      classNo: params.classNo,
    }),
    filename: `${year}_${params.grade}학년${params.classNo}반_${
      MERIT_TRACK_LABELS[params.track]
    }상벌점.xlsx`,
  };
}

/**
 * 한 학생의 내역 시트 — 생활기록부 근거처럼 한 명분이 필요할 때.
 *
 * 없는 학생은 **빈 시트를 만들지 않고 던진다.** 이름 없는 파일이 나가면
 * 받은 사람이 그것을 "기록이 없는 학생"으로 읽는다.
 */
export async function exportStudentHistory(
  actor: SessionUser,
  params: StudentHistoryExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const [header, view] = await Promise.all([
    getStudentHeader(actor, params.studentProfileId),
    getStudentMerit(actor, params.studentProfileId, params.track, params.year),
  ]);
  if (!header) throw new MeritError("STUDENT_NOT_FOUND");

  // 기숙사는 누적이라 학년도가 파일명에 들어가면 거짓말이 된다.
  // view.year가 null인 것이 곧 "누적"이라는 뜻이다 (scopeYear가 정한다).
  const scope = view.year === null ? "누적" : `${view.year}`;

  return {
    rows: toHistorySheet(view.awards, {
      track: params.track,
      studentName: header.name,
    }),
    filename: `${header.name}_${MERIT_TRACK_LABELS[params.track]}상벌점_${scope}.xlsx`,
  };
}
