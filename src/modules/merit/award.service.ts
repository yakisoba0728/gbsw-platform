import { randomUUID } from "node:crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
import { isYearScoped, type MeritTrack } from "@/core/authz/merit-track";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import * as repo from "./merit.repo";
import { BULK_AWARD_LIMIT } from "./merit.schema";
import type { AwardInput, BulkAwardInput, CancelInput } from "./merit.schema";

export type MeritTotals = { merit: number; demerit: number; net: number };

export type StudentMeritView = {
  track: MeritTrack;
  /** 교내면 보고 있는 학년도, 기숙사면 null(전체 누적). */
  year: number | null;
  totals: MeritTotals;
  awards: Awaited<ReturnType<typeof repo.listAwards>>;
};

const EMPTY_TOTALS: MeritTotals = { merit: 0, demerit: 0, net: 0 };

/**
 * 합계를 셀 학년도를 정한다. **이 함수 하나가 "교내는 매년 초기화, 기숙사는 누적"의
 * 구현 전부다.** null이면 repo가 학년도 조건을 붙이지 않는다.
 *
 * 기숙사는 넘어온 year를 무시한다 — 누적이라 고를 것이 없고, 화면에도 선택이 없다.
 */
async function scopeYear(
  track: MeritTrack,
  year?: number,
): Promise<number | null> {
  if (!isYearScoped(track)) return null;
  return year ?? (await getCurrentYear());
}

function sumTotals(
  rows: { kind: string; _sum: { points: number | null } }[],
): MeritTotals {
  let merit = 0;
  let demerit = 0;
  for (const row of rows) {
    const points = row._sum.points ?? 0;
    if (row.kind === "MERIT") merit += points;
    else if (row.kind === "DEMERIT") demerit += points;
  }
  return { merit, demerit, net: merit - demerit };
}

/**
 * 상벌점 부여.
 *
 * **학년도는 입력이 아니라 getCurrentYear()가 정한다.** 화면의 학년도 선택은
 * 조회 전용이며, 그 값이 여기로 흘러들면 지난 학년도를 들여다보던 관리자가
 * 새 벌점을 거기 꽂는 사고가 난다.
 *
 * 규정 값(track·kind·label·points)을 복사해 넣는다 — 나중에 규정을 고쳐도
 * 이미 준 기록은 안 흔들린다.
 */
export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
): Promise<void> {
  await assertCan(actor, "merit:award");

  const rule = await repo.findRule(input.ruleId);
  if (!rule) throw new MeritError("RULE_NOT_FOUND");
  if (!rule.active) throw new MeritError("RULE_INACTIVE");

  // 화면(반별 목록·검색)은 소프트 삭제된 학생을 내놓지 않지만, 서버 액션을
  // 직접 부르면 아무 id나 보낼 수 있다. repo가 deletedAt까지 보고 거른다.
  const student = await repo.findStudentProfileById(input.studentProfileId);
  if (!student) throw new MeritError("STUDENT_NOT_FOUND");

  const year = await getCurrentYear();

  const { id } = await repo.createAward({
    studentProfileId: student.id,
    year,
    ruleId: rule.id,
    track: rule.track,
    kind: rule.kind,
    label: rule.label,
    points: rule.points,
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

  await repo.cancelAward(award.id, {
    userId: actor.id,
    name: actor.name,
    reason: input.reason,
  });

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: "merit:cancel",
    targetType: "MeritAward",
    targetId: award.id,
    metadata: {
      studentProfileId: award.studentProfileId,
      track: award.track,
      kind: award.kind,
      label: award.label,
      points: award.points,
      reason: input.reason,
    },
  });
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
  const students = await Promise.all(ids.map((id) => repo.findStudentProfileById(id)));
  const missing = students.some((s) => s === null);
  if (missing) throw new MeritError("STUDENT_NOT_FOUND");

  const year = await getCurrentYear();
  const batchId = randomUUID();

  const created = await repo.createAwards(
    students.map((student) => ({
      studentProfileId: student!.id,
      year,
      ruleId: rule.id,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      note: input.note,
      awardedByUserId: actor.id,
      awardedByName: actor.name,
      batchId,
    })),
  );

  // 커밋된 뒤에 기록한다. 감사 실패가 부여를 되돌리지는 않는다 (core/audit 규약).
  for (const [index, row] of created.entries()) {
    const student = students[index]!;
    await recordAudit({
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
        batchId,
      },
    });
  }

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

/** 이름 또는 학생코드로 찾는다. 반·번호는 현재 학년도 기준으로 붙인다. */
export async function searchStudents(actor: SessionUser, query: string) {
  await assertCan(actor, "merit:read:any");

  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const year = await getCurrentYear();
  const rows = await repo.searchStudents(trimmed, year);

  return rows.map((row) => {
    const enrollment = row.enrollments[0];
    return {
      studentProfileId: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      grade: enrollment?.schoolClass?.grade ?? null,
      classNo: enrollment?.schoolClass?.classNo ?? null,
      number: enrollment?.number ?? null,
    };
  });
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
 * 학부모의 자녀 조회.
 *
 * `can()`으로 가를 수 없는 거부다 — 학부모 역할이 있다는 것과 **이** 학생의
 * 학부모라는 것은 다른 문제다. 연결을 직접 확인하고 ForbiddenError를 던지되,
 * 거부 감사로그는 assertCan과 같은 방식으로 남긴다
 * (invite.service.ts의 revokeInvite와 같은 처리).
 */
export async function getChildMerit(
  sessionUser: SessionUser,
  childProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  const linked = await repo.isChildOf(sessionUser.id, childProfileId);

  if (!linked) {
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

  return readMerit(childProfileId, track, year);
}
