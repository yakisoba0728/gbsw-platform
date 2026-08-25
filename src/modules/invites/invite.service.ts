import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { assertCan, ForbiddenError } from "@/core/authz/errors";
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

/** 학생 한 명이 동시에 살려둘 수 있는 학부모 코드 수. */
export const MAX_ACTIVE_PARENT_INVITES = 3;

/** 코드 충돌 시 재시도 횟수. 코드 공간의 근거는 generate-invite-code.ts에 있다. */
const CODE_RETRIES = 5;

/** DB에 없는 코드를 뽑을 때까지 재시도한다. 발급 경로는 전부 여기를 거친다. */
export async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < CODE_RETRIES; i += 1) {
    const code = generateInviteCode();
    if (!(await repo.codeExists(code))) return code;
  }
  throw new InviteError("CODE_GENERATION_FAILED");
}

/** roster.service.ts도 같은 만료 계산을 쓴다 — 계산 방식을 한 곳에 둔다. */
export function toExpiresAt(days: number | undefined): Date | null {
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ── 교사가 발급하는 코드 ─────────────────────────────────────

export async function createStudentInvite(
  actor: SessionUser,
  input: CreateStudentInviteInput,
) {
  await assertCan(actor, "invite:create");

  const insert = {
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
  };

  return withTransaction(async (tx) => {
    const invite = await repo.insertInvite(insert, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: "invite:create",
      targetType: "Invite",
      targetId: invite.id,
      // 코드 값 자체는 감사로그에 남기지 않는다.
      metadata: { role: "STUDENT", grade: input.grade, classNo: input.classNo },
    }, tx);

    return invite;
  });
}

export async function createAdminInvite(
  actor: SessionUser,
  input: CreateAdminInviteInput,
) {
  await assertCan(actor, "invite:create");

  const insert = {
    code: await generateUniqueCode(),
    role: "ADMIN",
    metadata: { name: input.name },
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  };

  return withTransaction(async (tx) => {
    const invite = await repo.insertInvite(insert, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: "invite:create",
      targetType: "Invite",
      targetId: invite.id,
      metadata: { role: "ADMIN" },
    }, tx);

    return invite;
  });
}

// ── 학생이 만드는 학부모 코드 ──────────────────────────────────

/**
 * 학부모 초대코드 생성. studentId를 인자로 받지 않는다 — 세션에서 본인 프로필을
 * 찾으므로 학생이 남의 자녀에 붙는 코드를 만들 경로가 없다.
 */
export async function createParentInvite(
  actor: SessionUser,
  input: CreateParentInviteInput,
) {
  await assertCan(actor, "invite:create:parent");

  const profile = await repo.getStudentProfileByUserId(actor.id);
  if (!profile) throw new InviteError("NOT_A_STUDENT");

  const insert = {
    code: await generateUniqueCode(),
    role: "PARENT",
    metadata: { name: input.name },
    studentId: profile.id,
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  };

  return withTransaction(async (tx) => {
    const exists = await repo.lockStudentForParentInvite(profile.id, tx);
    if (!exists) throw new InviteError("NOT_A_STUDENT");

    const active = await repo.countActiveByStudent(profile.id, new Date(), tx);
    if (active >= MAX_ACTIVE_PARENT_INVITES) {
      throw new InviteError("TOO_MANY_ACTIVE_INVITES");
    }

    const invite = await repo.insertInvite(insert, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: "invite:create",
      targetType: "Invite",
      targetId: invite.id,
      metadata: { role: "PARENT", studentId: profile.id },
    }, tx);

    return invite;
  });
}

/**
 * 교사가 학생을 지정해 학부모 코드를 발급한다. 교사는 모든 학생이 권한
 * 범위라 studentId를 받되, 실재하는 학생인지는 서버가 확인한다.
 */
export async function createParentInviteFor(
  actor: SessionUser,
  input: CreateParentInviteForInput,
) {
  await assertCan(actor, "invite:create");

  const student = await repo.findStudentById(input.studentId);
  if (!student) throw new InviteError("STUDENT_NOT_FOUND");

  const insert = {
    code: await generateUniqueCode(),
    role: "PARENT",
    metadata: { name: input.name },
    studentId: student.id,
    expiresAt: toExpiresAt(input.expiresInDays),
    createdById: actor.id,
  };

  return withTransaction(async (tx) => {
    const exists = await repo.lockStudentForParentInvite(student.id, tx);
    if (!exists) throw new InviteError("STUDENT_NOT_FOUND");

    const active = await repo.countActiveByStudent(student.id, new Date(), tx);
    if (active >= MAX_ACTIVE_PARENT_INVITES) {
      throw new InviteError("TOO_MANY_ACTIVE_INVITES");
    }

    const invite = await repo.insertInvite(insert, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: "invite:create",
      targetType: "Invite",
      targetId: invite.id,
      metadata: { role: "PARENT", studentId: student.id, issuedByAdmin: true },
    }, tx);

    return invite;
  });
}

// ── 조회 ──────────────────────────────────────────────────────

/** 학부모 코드 발급 화면에서 고를 학생 목록. */
export async function listStudentsForInvite(actor: SessionUser) {
  await assertCan(actor, "invite:create");
  return repo.listStudents(await getCurrentYear());
}

export async function listInvites(actor: SessionUser) {
  await assertCan(actor, "invite:list");
  return repo.listAll(await getCurrentYear());
}

/** 학생 본인이 만든 학부모 코드 목록. studentId를 인자로 받지 않는다. */
export async function listMyParentInvites(sessionUser: { id: string }) {
  const profile = await repo.getStudentProfileByUserId(sessionUser.id);
  if (!profile) return [];
  return repo.listByStudent(profile.id);
}

// ── 폐기 ──────────────────────────────────────────────────────

/**
 * 코드 폐기. 교사는 아무 코드나, 학생은 자기가 만든 학부모 코드만 폐기할 수 있다.
 * 이미 사용됐거나 폐기된 코드는 건드리지 않는다.
 */
export async function revokeInvite(actor: SessionUser, input: RevokeInviteInput) {
  const { inviteId, reason } = input;
  const invite = await repo.findById(inviteId);
  if (!invite) throw new InviteError("NOT_FOUND");

  const isAdmin = can(actor, "invite:revoke");

  if (!isAdmin) {
    // 소유권 검사는 can()으로 못 가르는 거부라 assertCan을 못 쓴다. 거부 기록과
    // ForbiddenError를 같은 방식으로 직접 맞춘다.
    const profile = await repo.getStudentProfileByUserId(actor.id);
    const owns = profile !== null && invite.studentId === profile.id;
    if (!owns) {
      try {
        await recordAudit({
          actorUserId: actor.id,
          action: "authz:denied",
          targetType: "Invite",
          targetId: inviteId,
          metadata: { action: "invite:revoke" },
        });
      } catch {
        // 감사 기록 실패가 거부 자체를 막지 않는다.
      }
      throw new ForbiddenError("invite:revoke");
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
      // 사유는 여기에만 남는다 — 폐기된 코드는 목록에서 대기 상태를 잃는다.
      metadata: { reason },
    }, tx);
  });
}
