import { recordAudit, type RecordAuditInput } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, denyAccess } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { generateInviteCode } from "@/lib/generate-invite-code";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./invite.repo";
import type {
  CreateAdminInviteInput,
  CreateParentInviteForInput,
  CreateParentInviteInput,
  CreateStudentInviteInput,
  RevokeInviteInput,
} from "./invite.schema";

export class InviteError extends Error {}

export const MAX_ACTIVE_PARENT_INVITES = 2;

const PARENT_INVITE_EXPIRES_DAYS = 90;

const CODE_RETRIES = 5;

export async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < CODE_RETRIES; i += 1) {
    const code = generateInviteCode();
    if (!(await repo.codeExists(code))) return code;
  }
  throw new InviteError("CODE_GENERATION_FAILED");
}

export function toExpiresAt(days: number | undefined): Date | null {
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

type IssueInviteInput = Pick<repo.InsertInviteInput, "role" | "metadata" | "studentId"> & {
  expiresInDays?: number;
  auditMetadata: RecordAuditInput["metadata"];
  missingStudentError?: "NOT_A_STUDENT" | "STUDENT_NOT_FOUND";
};

async function issueInvite(actor: SessionUser, input: IssueInviteInput) {
  const insert = {
    code: await generateUniqueCode(),
    role: input.role,
    metadata: input.metadata,
    ...(input.studentId ? { studentId: input.studentId } : {}),
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
    createdByName: actor.name,
  };

  return withTransaction(async (tx) => {
    if (input.studentId) {
      // 같은 학생의 한도 검사와 발급을 직렬화한다.
      const exists = await repo.lockStudentForParentInvite(input.studentId, tx);
      if (!exists) throw new InviteError(input.missingStudentError ?? "STUDENT_NOT_FOUND");
      const active = await repo.countActiveByStudent(input.studentId, new Date(), tx);
      if (active >= MAX_ACTIVE_PARENT_INVITES) {
        throw new InviteError("TOO_MANY_ACTIVE_INVITES");
      }
    }

    const invite = await repo.insertInvite(insert, tx);
    await recordAudit({
      actorUserId: actor.id,
      action: "invite:create",
      targetType: "Invite",
      targetId: invite.id,
      // 초대코드와 사전등록 신원은 감사로그에 복사하지 않는다.
      metadata: input.auditMetadata,
    }, tx);
    return invite;
  });
}

export async function createStudentInvite(
  actor: SessionUser,
  input: CreateStudentInviteInput,
) {
  await assertCan(actor, "invite:create");
  return issueInvite(actor, {
    role: "STUDENT",
    metadata: {
      name: input.name,
      birthDate: input.birthDate,
      grade: input.grade,
      classNo: input.classNo,
      number: input.number,
    },
    expiresInDays: input.expiresInDays,
    auditMetadata: { role: "STUDENT", grade: input.grade, classNo: input.classNo },
  });
}

export async function createAdminInvite(
  actor: SessionUser,
  input: CreateAdminInviteInput,
) {
  await assertCan(actor, "invite:create");
  return issueInvite(actor, {
    role: "ADMIN",
    metadata: { name: input.name },
    expiresInDays: input.expiresInDays,
    auditMetadata: { role: "ADMIN" },
  });
}

/** 학생 식별자는 입력을 받지 않고 세션에서 찾는다. */
export async function createParentInvite(
  actor: SessionUser,
  input: CreateParentInviteInput,
) {
  await assertCan(actor, "invite:create:parent");
  const profile = await repo.getStudentProfileByUserId(actor.id);
  if (!profile) throw new InviteError("NOT_A_STUDENT");
  return issueInvite(actor, {
    role: "PARENT",
    metadata: { name: input.name },
    studentId: profile.id,
    expiresInDays: PARENT_INVITE_EXPIRES_DAYS,
    missingStudentError: "NOT_A_STUDENT",
    auditMetadata: { role: "PARENT", studentId: profile.id },
  });
}

export async function createParentInviteFor(
  actor: SessionUser,
  input: CreateParentInviteForInput,
) {
  await assertCan(actor, "invite:create");
  const student = await repo.findStudentById(input.studentId);
  if (!student) throw new InviteError("STUDENT_NOT_FOUND");
  return issueInvite(actor, {
    role: "PARENT",
    metadata: { name: input.name },
    studentId: student.id,
    expiresInDays: input.expiresInDays,
    auditMetadata: { role: "PARENT", studentId: student.id, issuedByAdmin: true },
  });
}

export async function listStudentsForInvite(actor: SessionUser) {
  await assertCan(actor, "invite:create");
  return repo.listStudents(await getCurrentYear());
}

export async function listInvites(actor: SessionUser) {
  await assertCan(actor, "invite:list");
  return repo.listAll(await getCurrentYear());
}

export async function listMyParentInvites(sessionUser: { id: string }) {
  const profile = await repo.getStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listByStudent(profile.id);
}

export async function revokeInvite(actor: SessionUser, input: RevokeInviteInput) {
  const { inviteId, reason } = input;
  const invite = await repo.findById(inviteId);
  if (!invite) throw new InviteError("NOT_FOUND");

  const isAdmin = can(actor, "invite:revoke");

  if (!isAdmin) {
    const profile = await repo.getStudentProfileByUserId(actor.id);
    const owns =
      profile !== null &&
      invite.role === "PARENT" &&
      invite.studentId === profile.id;
    if (!owns) {
      await denyAccess(actor, "invite:revoke", {
        targetType: "Invite",
        targetId: inviteId,
      });
    }
  }

  await withTransaction(async (tx) => {
    const count = await repo.revokePending(inviteId, tx);
    if (count === 0) throw new InviteError("NOT_PENDING");

    await recordAudit({
      actorUserId: actor.id,
      action: "invite:revoke",
      targetType: "Invite",
      targetId: inviteId,
      metadata: { reason },
    }, tx);
  });
}
