import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { generateInviteCode } from "@/lib/invite-code";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import { parseRoster, type RosterRow } from "./roster.parse";
import { planRoster, type RosterPlan } from "./roster.plan";
import * as repo from "./roster.repo";

export class RosterError extends Error {}

function assertMayImport(actor: SessionUser) {
  // 소속을 바꾸고 초대코드도 만든다. 둘 다 확인한다.
  if (!can(actor, "student:manage") || !can(actor, "invite:create")) {
    throw new Error("FORBIDDEN");
  }
}

/** 미리보기. **아무것도 저장하지 않는다.** */
export async function previewRoster(
  actor: SessionUser,
  file: { filename: string; buffer: Buffer },
): Promise<{ year: number; rows: RosterRow[]; plan: RosterPlan }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  const rows = await parseRoster(file);
  if (rows.length === 0) throw new RosterError("EMPTY");

  const plan = planRoster(rows, await repo.listExisting(year));
  return { year, rows, plan };
}

/**
 * 확정 반영.
 *
 * 클라이언트가 돌려보낸 행을 **서버가 다시 분류한다.** 미리보기 결과를 그대로 믿으면
 * 중간에 손댄 값이 그대로 들어가고, 그 사이 DB가 바뀌었을 수도 있다.
 */
export async function applyRosterPlan(
  actor: SessionUser,
  expectedYear: number,
  rows: RosterRow[],
): Promise<{ saved: number; invites: Awaited<ReturnType<typeof repo.applyRoster>>["invites"] }> {
  assertMayImport(actor);

  const year = await getCurrentYear();
  if (year !== expectedYear) throw new RosterError("YEAR_CHANGED");

  const existing = await repo.listExisting(year);
  const plan = planRoster(rows, existing);
  if (plan.hasBlockingError) throw new RosterError("BLOCKED");

  // 지우고 새로 넣으므로, 바뀌지 않은 학생의 배정도 다시 만들어야 한다.
  const untouched = existing
    .filter(
      (s) =>
        s.status !== null &&
        !plan.reassign.some((r) => r.studentProfileId === s.studentProfileId) &&
        !plan.statusChange.some((r) => r.studentProfileId === s.studentProfileId) &&
        !plan.missingFromFile.some((m) => m.studentProfileId === s.studentProfileId),
    )
    .map((s) => ({
      line: 0,
      name: s.name,
      birthDate: s.birthDate,
      grade: s.grade,
      classNo: s.classNo,
      number: s.number,
      status: s.status as RosterRow["status"],
      errors: [],
      studentProfileId: s.studentProfileId,
    }));

  const assignments = [...plan.reassign, ...plan.statusChange, ...untouched];
  const newStudents = plan.newStudents.map((row) => ({
    row,
    code: generateInviteCode(),
  }));

  const { invites } = await repo.applyRoster(year, {
    assignments,
    newStudents,
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "enrollment:import",
    targetType: "AcademicYear",
    targetId: String(year),
    // 건수만 남긴다. 학생 이름·소속이 들어가면 감사로그가 명단 사본이 된다.
    metadata: {
      year,
      reassign: plan.reassign.length,
      statusChange: plan.statusChange.length,
      newStudents: plan.newStudents.length,
      removed: plan.missingFromFile.length,
    },
  });

  return { saved: assignments.length, invites };
}
