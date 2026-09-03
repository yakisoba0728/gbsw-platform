import { recordAudit, type RecordAuditInput } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, denyAccess } from "@/core/authz/errors";
import type { DbClient } from "@/core/db/client";
import { withTransaction } from "@/core/db/client";
import { isUniqueViolation } from "@/core/db/unique-violation";
import { generateInviteCode } from "./generate-invite-code";
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

/** 열린 트랜잭션의 코드 충돌을 바깥의 전체 트랜잭션 재시도에 알린다. */
export class InviteCodeCollisionError extends Error {}

export const MAX_ACTIVE_PARENT_INVITES = 2;

/** 학부모 코드와 명단 발급 학생 코드의 공통 만료일. */
export const INVITE_EXPIRES_DAYS = 90;

export const INVITE_CODE_RETRIES = 5;

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < INVITE_CODE_RETRIES; i += 1) {
    const code = generateInviteCode();
    if (!(await repo.codeExists(code))) return code;
  }
  throw new InviteError("CODE_GENERATION_FAILED");
}

function toExpiresAt(days: number | undefined): Date | null {
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
    expiresInDays: INVITE_EXPIRES_DAYS,
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

/** 명단 반영으로 새로 들어온 학생의 사전등록 신원. */
export type BulkInviteStudent = {
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

export type IssuedBulkInvite = {
  id: string;
  name: string;
  code: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
};

/**
 * 코드 충돌을 도메인 오류로 옮긴다. PostgreSQL은 제약 오류가 난 트랜잭션을
 * 중단하므로 여기서 같은 tx를 재사용하지 않고, 호출자가 트랜잭션 전체를 다시 연다.
 */
async function insertInvite(
  insert: repo.InsertInviteInput,
  tx: DbClient,
): Promise<{ id: string; code: string }> {
  try {
    const created = await repo.insertInvite(insert, tx);
    return { id: created.id, code: created.code };
  } catch (error) {
    if (isUniqueViolation(error, "code")) {
      throw new InviteCodeCollisionError();
    }
    throw error;
  }
}

/**
 * 명단 반영처럼 이미 열려 있는 트랜잭션 안에서 학생 초대코드를 대량 발급한다.
 * 코드는 사전 DB 검사 없이 로컬로 만든다. 유일 제약 충돌은 호출자가 트랜잭션
 * 전체를 다시 열 때 새 코드를 뽑는다 — 신규 학생 수만큼 codeExists를 치던 이전
 * 방식의 쿼리 폭증을 없앤다. 발급 규칙(코드 알파벳·만료 90일·발급자 스냅샷)은
 * 단건 발급과 이 한 곳에서 같다.
 */
export async function issueInvitesBulk(
  input: {
    actorId: string;
    actorName: string;
    students: BulkInviteStudent[];
  },
  tx: DbClient,
): Promise<IssuedBulkInvite[]> {
  const issued: IssuedBulkInvite[] = [];

  for (const student of input.students) {
    const { id, code } = await insertInvite({
      code: generateInviteCode(),
      role: "STUDENT",
      metadata: {
        name: student.name,
        birthDate: student.birthDate,
        grade: student.grade,
        classNo: student.classNo,
        number: student.number,
      },
      expiresAt: toExpiresAt(INVITE_EXPIRES_DAYS),
      createdById: input.actorId,
      createdByName: input.actorName,
    }, tx);
    issued.push({
      id,
      name: student.name,
      code,
      grade: student.grade,
      classNo: student.classNo,
      number: student.number,
    });
  }

  return issued;
}
