import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { generateInviteCode } from "@/lib/invite-code";
import * as repo from "./invite.repo";
import type {
  CreateAdminInviteInput,
  CreateParentInviteForInput,
  CreateParentInviteInput,
  CreateStudentInviteInput,
} from "./invite.schema";

export class InviteError extends Error {}

/** 학생 한 명이 동시에 살려둘 수 있는 학부모 코드 수. */
export const MAX_ACTIVE_PARENT_INVITES = 3;

/** 코드 충돌 시 재시도 횟수. 31^10 공간이라 실제로는 거의 일어나지 않는다. */
const CODE_RETRIES = 5;

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < CODE_RETRIES; i += 1) {
    const code = generateInviteCode();
    if (!(await repo.codeExists(code))) return code;
  }
  throw new InviteError("CODE_GENERATION_FAILED");
}

function toExpiresAt(days: number | undefined): Date | null {
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ── 관리자가 발급하는 코드 ─────────────────────────────────────

export async function createStudentInvite(
  actor: SessionUser,
  input: CreateStudentInviteInput,
) {
  if (!can(actor, "invite:create")) throw new Error("FORBIDDEN");

  const invite = await repo.insertInvite({
    code: await generateUniqueCode(),
    role: "STUDENT",
    metadata: {
      name: input.name,
      birthDate: input.birthDate,
      grade: input.grade,
      classNo: input.classNo,
      number: input.number,
    },
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "invite:create",
    targetType: "Invite",
    targetId: invite.id,
    // 코드 값 자체는 감사로그에 남기지 않는다.
    metadata: { role: "STUDENT", grade: input.grade, classNo: input.classNo },
  });

  return invite;
}

export async function createAdminInvite(
  actor: SessionUser,
  input: CreateAdminInviteInput,
) {
  if (!can(actor, "invite:create")) throw new Error("FORBIDDEN");

  const invite = await repo.insertInvite({
    code: await generateUniqueCode(),
    role: "ADMIN",
    metadata: { name: input.name },
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "invite:create",
    targetType: "Invite",
    targetId: invite.id,
    metadata: { role: "ADMIN" },
  });

  return invite;
}

// ── 학생이 만드는 학부모 코드 ──────────────────────────────────

/**
 * 학부모 초대코드 생성.
 *
 * `studentId`를 인자로 받지 않는다 — 세션에서 본인 StudentProfile을 찾아 쓴다.
 * 따라서 학생이 남의 자녀에 붙는 코드를 만들 경로가 없다.
 * 관리자가 대신 발급할 때는 아래 createParentInviteFor를 쓴다.
 */
export async function createParentInvite(
  actor: SessionUser,
  input: CreateParentInviteInput,
) {
  if (!can(actor, "invite:create:parent")) throw new Error("FORBIDDEN");

  const profile = await repo.getStudentProfileByUserId(actor.id);
  if (!profile) throw new InviteError("NOT_A_STUDENT");

  const active = await repo.countActiveByStudent(profile.id);
  if (active >= MAX_ACTIVE_PARENT_INVITES) {
    throw new InviteError("TOO_MANY_ACTIVE_INVITES");
  }

  const invite = await repo.insertInvite({
    code: await generateUniqueCode(),
    role: "PARENT",
    metadata: { name: input.name },
    studentId: profile.id,
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "invite:create",
    targetType: "Invite",
    targetId: invite.id,
    metadata: { role: "PARENT", studentId: profile.id },
  });

  return invite;
}

/**
 * 관리자가 학생을 지정해 학부모 코드를 발급한다.
 *
 * 학생 본인 경로(createParentInvite)와 달리 studentId를 인자로 받는다.
 * 관리자는 원래 모든 학생을 관리하므로 대상 지정이 정상 권한 범위 안이다.
 * 다만 실재하는 학생인지는 서버에서 확인한다.
 */
export async function createParentInviteFor(
  actor: SessionUser,
  input: CreateParentInviteForInput,
) {
  if (!can(actor, "invite:create")) throw new Error("FORBIDDEN");

  const student = await repo.findStudentById(input.studentId);
  if (!student) throw new InviteError("STUDENT_NOT_FOUND");

  const active = await repo.countActiveByStudent(student.id);
  if (active >= MAX_ACTIVE_PARENT_INVITES) {
    throw new InviteError("TOO_MANY_ACTIVE_INVITES");
  }

  const invite = await repo.insertInvite({
    code: await generateUniqueCode(),
    role: "PARENT",
    metadata: { name: input.name },
    studentId: student.id,
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  });

  await recordAudit({
    actorUserId: actor.id,
    action: "invite:create",
    targetType: "Invite",
    targetId: invite.id,
    metadata: { role: "PARENT", studentId: student.id, issuedByAdmin: true },
  });

  return invite;
}

// ── 조회 ──────────────────────────────────────────────────────

/** 학부모 코드 발급 화면에서 고를 학생 목록. */
export async function listStudentsForInvite(actor: SessionUser) {
  if (!can(actor, "invite:create")) throw new Error("FORBIDDEN");
  return repo.listStudents();
}

export async function listInvites(actor: SessionUser) {
  if (!can(actor, "invite:list")) throw new Error("FORBIDDEN");
  return repo.listAll();
}

/** 학생 본인이 만든 학부모 코드 목록. studentId를 인자로 받지 않는다. */
export async function listMyParentInvites(sessionUser: { id: string }) {
  const profile = await repo.getStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listByStudent(profile.id);
}

// ── 폐기 ──────────────────────────────────────────────────────

/**
 * 코드 폐기. 관리자는 아무 코드나, 학생은 자기가 만든 학부모 코드만 폐기할 수 있다.
 * 이미 사용됐거나 폐기된 코드는 건드리지 않는다.
 */
export async function revokeInvite(actor: SessionUser, inviteId: string) {
  const invite = await repo.findById(inviteId);
  if (!invite) throw new InviteError("NOT_FOUND");

  const isAdmin = can(actor, "invite:revoke");

  if (!isAdmin) {
    // 학생 소유권 검사 — 자기 학생 프로필에 귀속된 코드인가.
    const profile = await repo.getStudentProfileByUserId(actor.id);
    const owns = profile !== null && invite.studentId === profile.id;
    if (!owns) throw new Error("FORBIDDEN");
  }

  const count = await repo.revokePending(inviteId);
  if (count === 0) throw new InviteError("NOT_PENDING");

  await recordAudit({
    actorUserId: actor.id,
    action: "invite:revoke",
    targetType: "Invite",
    targetId: inviteId,
  });
}
