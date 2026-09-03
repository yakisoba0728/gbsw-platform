import { recordAudit, recordAuditMany } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan, denyAccess } from "@/core/authz/errors";
import { TX_BUDGETS, withTransaction } from "@/core/db/client";
import {
  isYearScoped,
  MERIT_TRACK_LABELS,
  type MeritTrack,
} from "@/core/authz/merit-track";
import {
  addKindPoints,
  emptyKindTotals,
  withNetScore,
  type NetTotals,
} from "./merit.points";
import { schoolYearRange } from "./merit.chart";
import {
  AcademicYearError,
  getCurrentYear,
} from "@/modules/academic-year/academic-year.service";
import { MeritError } from "./merit.error";
import { toHistorySheet, toRecentAwardsSheet, toRosterSheet } from "./merit.export";
import { kstDayStart } from "@/lib/datetime";
import { parseStudentNumber } from "@/lib/student-number";
import * as repo from "./merit.repo";
import { BULK_AWARD_LIMIT } from "./merit.schema";
import type {
  AwardInput,
  BulkAwardInput,
  CancelInput,
  ClassRosterExportInput,
  ClassRosterInput,
  RecentAwardFilter,
  RecentAwardsExportInput,
  RecentAwardsQuery,
  StudentHistoryExportInput,
} from "./merit.schema";
import { RECENT_AWARD_PAGE_SIZE } from "./merit.schema";

export type MeritTotals = NetTotals;

export type StudentMeritView = {
  track: MeritTrack;
  year: number | null;
  totals: MeritTotals;
  awards: Awaited<ReturnType<typeof repo.listAwards>>;
};

const EMPTY_TOTALS: MeritTotals = withNetScore(emptyKindTotals());

/* 교내는 학년도별, 기숙사는 누적이다. null은 학년도 필터를 제거한다. */
export async function scopeYear(
  track: MeritTrack,
  year?: number,
): Promise<number | null> {
  if (!isYearScoped(track)) return null;
  return year ?? (await getCurrentYear());
}

export function sumTotals(
  rows: { kind: string; _sum: { points: number | null } }[],
): MeritTotals {
  const totals = emptyKindTotals();
  for (const row of rows) {
    addKindPoints(totals, row.kind, row._sum.points ?? 0);
  }
  return withNetScore(totals);
}

function assertOccurredOn(occurredOn: Date, year: number, now: Date): void {
  const { start, endExclusive } = schoolYearRange(year);
  if (occurredOn < start || occurredOn >= endExclusive) {
    throw new MeritError("OCCURRED_OUT_OF_YEAR");
  }
  if (occurredOn.getTime() > now.getTime()) {
    throw new MeritError("OCCURRED_IN_FUTURE");
  }
}

export async function awardMerit(
  actor: SessionUser,
  input: AwardInput,
  now: Date = new Date(),
): Promise<void> {
  await assertCan(actor, "merit:award");

  const occurredOn = kstDayStart(now);

  await withTransaction(async (tx) => {
    const year = await repo.findCurrentYearForUpdate(tx);
    if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");
    assertOccurredOn(occurredOn, year, now);

    const student = await repo.findAwardableStudent(input.studentProfileId, year, tx);
    if (!student) throw new MeritError("STUDENT_NOT_FOUND");

    const rule = await repo.findRuleForUpdate(input.ruleId, tx);
    if (!rule) throw new MeritError("RULE_NOT_FOUND");
    if (!rule.active) throw new MeritError("RULE_INACTIVE");

    const { id } = await repo.createAward({
      studentProfileId: student.id,
      year,
      ruleId: rule.id,
      track: rule.track,
      kind: rule.kind,
      label: rule.label,
      points: rule.points,
      occurredOn,
      note: input.note,
      awardedByUserId: actor.id,
      awardedByName: actor.name,
    }, tx);

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
        occurredOn: occurredOn.toISOString(),
      },
    }, tx);
  },
  TX_BUDGETS.meritAward,
  );
}

export async function cancelAward(
  actor: SessionUser,
  input: CancelInput,
): Promise<void> {
  await assertCan(actor, "merit:cancel");

  const award = await repo.findAward(input.awardId);
  if (!award) throw new MeritError("AWARD_NOT_FOUND");
  if (award.status !== "ACTIVE") throw new MeritError("ALREADY_CANCELLED");

  await withTransaction(async (tx) => {
    const cancelled = await repo.cancelAward(award.id, {
      userId: actor.id,
      name: actor.name,
      reason: input.reason,
    }, tx);
    if (cancelled === 0) throw new MeritError("ALREADY_CANCELLED");

    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: "merit:cancel",
      targetType: "MeritAward",
      targetId: award.id,
      metadata: {
        studentProfileId: award.studentProfileId,
        studentName: award.studentProfile.user.name,
        track: award.track,
        kind: award.kind,
        label: award.label,
        points: award.points,
        reason: input.reason,
      },
    }, tx);
  });
}

export async function getStudentMerit(
  actor: SessionUser,
  studentProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertCan(actor, "merit:read:any");
  return readMerit(studentProfileId, track, year);
}

export async function getStudentHeader(
  actor: SessionUser,
  studentProfileId: string,
) {
  await assertCan(actor, "merit:read:any");
  return repo.findStudentHeader(studentProfileId, await getCurrentYear());
}

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

export async function bulkAwardMerit(
  actor: SessionUser,
  input: BulkAwardInput,
  now: Date = new Date(),
): Promise<{ count: number }> {
  await assertCan(actor, "merit:award");

  const ids = [...new Set(input.studentProfileIds)];
  if (ids.length === 0) throw new MeritError("NO_STUDENTS");
  if (ids.length > BULK_AWARD_LIMIT) throw new MeritError("TOO_MANY_STUDENTS");

  const occurredOn = kstDayStart(now);

  const created = await withTransaction(
    async (tx) => {
      const year = await repo.findCurrentYearForUpdate(tx);
      if (year === null) throw new AcademicYearError("NO_CURRENT_YEAR");
      assertOccurredOn(occurredOn, year, now);

      const found = await repo.findAwardableStudents(ids, year, tx);
      if (found.length !== ids.length) throw new MeritError("STUDENT_NOT_FOUND");

      const byId = new Map(found.map((s) => [s.id, s]));
      // 조회 수와 선택 수가 같음을 위에서 확인했으므로 순서가 그대로 보존된다.
      const students = ids.flatMap((id) => {
        const student = byId.get(id);
        return student ? [student] : [];
      });

      const rule = await repo.findRuleForUpdate(input.ruleId, tx);
      if (!rule) throw new MeritError("RULE_NOT_FOUND");
      if (!rule.active) throw new MeritError("RULE_INACTIVE");

      const items = students.map((student) => ({
        studentProfileId: student.id,
        year,
        ruleId: rule.id,
        track: rule.track,
        kind: rule.kind,
        label: rule.label,
        points: rule.points,
        occurredOn,
        note: input.note,
        awardedByUserId: actor.id,
        awardedByName: actor.name,
      }));

      const rows = await repo.createAwards(items, tx);
      await recordAuditMany(
        rows.map((row, index) => ({
          actorUserId: actor.id,
          actorName: actor.name,
          action: "merit:award",
          targetType: "MeritAward",
          targetId: row.id,
          metadata: {
            studentProfileId: students[index].id,
            studentName: students[index].user.name,
            year,
            track: rule.track,
            kind: rule.kind,
            label: rule.label,
            points: rule.points,
            occurredOn: occurredOn.toISOString(),
          },
        })),
        tx,
      );
      return rows;
    },
    TX_BUDGETS.meritAward,
  );

  return { count: created.length };
}

export async function getClassRoster(actor: SessionUser, params: ClassRosterInput) {
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
    studentNumber: parseStudentNumber(trimmed) ?? undefined,
  });

  return rows.map((row) => {
    const enrollment = row.enrollments[0];
    const enrolled = enrollment?.status === "ENROLLED" ? enrollment : null;
    return {
      studentProfileId: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      grade: enrolled?.grade ?? null,
      classNo: enrolled?.classNo ?? null,
      number: enrolled?.number ?? null,
      status: enrollment?.status ?? null,
      removed: enrollment?.status !== "ENROLLED",
    };
  });
}

export async function listAwardYears(
  actor: SessionUser,
  studentProfileId: string,
): Promise<number[]> {
  await assertCan(actor, "merit:read:any");
  return repo.listAwardYears(studentProfileId);
}

export async function listMyAwardYears(sessionUser: SessionUser): Promise<number[]> {
  const profile = await repo.findStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listAwardYears(profile.id);
}

export async function listChildAwardYears(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<number[]> {
  await assertIsChildOf(sessionUser, childProfileId);
  return repo.listAwardYears(childProfileId);
}

export async function listMyChildren(sessionUser: SessionUser) {
  const links = await repo.listChildren(sessionUser.id);
  return links.map((link) => ({
    studentProfileId: link.student.id,
    name: link.student.user.name,
  }));
}

async function assertIsChildOf(
  sessionUser: SessionUser,
  childProfileId: string,
): Promise<void> {
  if (await repo.isChildOf(sessionUser.id, childProfileId)) return;

  return denyAccess(sessionUser, "merit:read:child", {
    actorName: sessionUser.name,
    targetType: "MeritAward",
    metadata: { studentProfileId: childProfileId },
  });
}

export async function getChildMerit(
  sessionUser: SessionUser,
  childProfileId: string,
  track: MeritTrack,
  year?: number,
): Promise<StudentMeritView> {
  await assertIsChildOf(sessionUser, childProfileId);
  return readMerit(childProfileId, track, year);
}

function recentAwardFilter(input: RecentAwardsExportInput): RecentAwardFilter {
  return {
    track: input.track,
    kind: input.kind,
    status: input.status,
    q: input.q,
  };
}

export async function listRecentAwards(actor: SessionUser, query: RecentAwardsQuery) {
  await assertCan(actor, "merit:read:any");

  const filter = recentAwardFilter(query);
  const skip = (query.page - 1) * RECENT_AWARD_PAGE_SIZE;
  const [entries, total] = await Promise.all([
    repo.findRecentAwardPage(filter, skip, RECENT_AWARD_PAGE_SIZE),
    repo.countRecentAwards(filter),
  ]);

  return {
    entries,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / RECENT_AWARD_PAGE_SIZE)),
  };
}

export async function exportClassRoster(
  actor: SessionUser,
  params: ClassRosterExportInput,
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

  const scope = view.year === null ? "누적" : `${view.year}`;

  return {
    rows: toHistorySheet(view.awards, {
      track: params.track,
      studentName: header.name,
    }),
    filename: `${header.name}_${MERIT_TRACK_LABELS[params.track]}상벌점_${scope}.xlsx`,
  };
}

export async function exportRecentAwards(
  actor: SessionUser,
  input: RecentAwardsExportInput,
): Promise<{ rows: (string | number)[][]; filename: string }> {
  await assertCan(actor, "merit:read:any");

  const filter = recentAwardFilter(input);
  const awards = await repo.findRecentAwardsForExport(filter);

  return {
    rows: toRecentAwardsSheet(awards, filter),
    filename: `${MERIT_TRACK_LABELS[input.track]}_최근부여.xlsx`,
  };
}
