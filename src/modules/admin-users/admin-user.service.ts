import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { assertCan } from "@/core/authz/errors";
import { withTransaction } from "@/core/db/client";
import { isSerializationConflict } from "@/core/db/transaction-conflict";
import { formatDateInput, parseDateInputKst } from "@/lib/datetime";
import { generateTempPassword } from "@/lib/temp-password";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./admin-user.repo";
import type { UpdateUserInput } from "./admin-user.schema";

export class AdminUserError extends Error {}

export async function listUsers(actor: SessionUser) {
  await assertCan(actor, "user:manage");
  return repo.listUsers(await getCurrentYear());
}

const RELATED_AUDIT_LIMIT = 20;

export async function getUserDetail(actor: SessionUser, userId: string) {
  await assertCan(actor, "user:manage");

  const year = await getCurrentYear();
  const user = await repo.findDetail(userId, year);
  if (!user) throw new AdminUserError("NOT_FOUND");

  const audit = await repo.findRelatedAudit(userId, RELATED_AUDIT_LIMIT);
  return { user, audit };
}

export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: UpdateUserInput,
  reason?: string,
): Promise<{ changed: string[] }> {
  await assertCan(actor, "user:manage");

  const year = await getCurrentYear();
  const current = await repo.findDetail(userId, year);
  if (!current) throw new AdminUserError("NOT_FOUND");
  if (current.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  const changed: string[] = [];

  if (current.name !== input.name) changed.push("name");
  if (current.email !== input.email) changed.push("email");
  if (current.phone !== input.phone) changed.push("phone");

  const profile = current.studentProfile;
  const isStudent = profile !== null && profile !== undefined;
  const enrollment = profile?.enrollments[0];
  const canEditAssignment = enrollment?.status === "ENROLLED";

  if (isStudent) {
    if (
      input.birthDate &&
      formatDateInput(profile.birthDate) !== input.birthDate
    ) {
      changed.push("birthDate");
    }
    if (canEditAssignment) {
      if (
        input.grade !== undefined &&
        enrollment?.grade !== input.grade
      ) {
        changed.push("grade");
      }
      if (
        input.classNo !== undefined &&
        enrollment?.classNo !== input.classNo
      ) {
        changed.push("classNo");
      }
      if (input.number !== undefined && enrollment?.number !== input.number) {
        changed.push("number");
      }
    }
  }

  if (changed.length === 0) return { changed };

  const profileChanged = ["name", "email", "phone"].some((f) => changed.includes(f));
  const birthDateChanged = changed.includes("birthDate");
  const assignmentChanged = ["grade", "classNo", "number"].some((f) =>
    changed.includes(f),
  );

  if (isStudent && assignmentChanged) {
    if (
      !input.birthDate ||
      input.grade == null ||
      input.classNo == null ||
      input.number == null
    ) {
      throw new AdminUserError("INCOMPLETE_STUDENT_INPUT");
    }
  }

  try {
    await withTransaction(async (tx) => {
      if (assignmentChanged) {
        const currentYear = await repo.findCurrentYearForUpdate(tx);
        if (currentYear !== year) throw new AdminUserError("YEAR_CHANGED");
      }

      await repo.updateUserAndEnrollment(userId, {
        expectedUpdatedAt: input.updatedAt,
        profile: profileChanged
          ? { name: input.name, email: input.email, phone: input.phone }
          : null,
        studentProfile:
          isStudent && birthDateChanged
            ? {
                studentProfileId: profile.id,
                birthDate: parseDateInputKst(input.birthDate!),
              }
            : null,
        enrollment:
          isStudent && assignmentChanged
            ? {
                studentProfileId: profile.id,
                year,
                grade: input.grade!,
                classNo: input.classNo!,
                number: input.number!,
              }
            : null,
      }, tx);

      await recordAudit({
        actorUserId: actor.id,
        action: "user:update",
        targetType: "User",
        targetId: userId,
        metadata: { changed, reason },
      }, tx);
    });
  } catch (error) {
    if (error instanceof repo.EmailTakenError) throw new AdminUserError("EMAIL_TAKEN");
    if (error instanceof repo.NumberTakenError) throw new AdminUserError("NUMBER_TAKEN");
    if (error instanceof repo.UserRevisionConflictError) {
      throw new AdminUserError("USER_CHANGED");
    }
    if (isSerializationConflict(error)) {
      const currentYear = await repo.findCurrentYear();
      throw new AdminUserError(currentYear === year ? "USER_CHANGED" : "YEAR_CHANGED");
    }
    throw error;
  }

  return { changed };
}

export async function setUserActive(
  actor: SessionUser,
  userId: string,
  active: boolean,
  reason?: string,
): Promise<void> {
  await assertCan(actor, "user:manage");

  if (userId === actor.id && !active) {
    throw new AdminUserError("CANNOT_DEACTIVATE_SELF");
  }

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");
  if (target.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  await withTransaction(async (tx) => {
    await repo.setActive(userId, active, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: active ? "user:activate" : "user:deactivate",
      targetType: "User",
      targetId: userId,
      metadata: { reason },
    }, tx);
  });
}

export async function resetPassword(
  actor: SessionUser,
  userId: string,
  reason?: string,
): Promise<{ tempPassword: string }> {
  await assertCan(actor, "user:manage");

  if (userId === actor.id) throw new AdminUserError("CANNOT_RESET_SELF");

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");
  if (target.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await withTransaction(async (tx) => {
    const updated = await repo.resetCredential(userId, passwordHash, tx);

    if (updated === 0) {
      throw new AdminUserError("NO_CREDENTIAL_ACCOUNT");
    }

    await recordAudit({
      actorUserId: actor.id,
      action: "user:reset-password",
      targetType: "User",
      targetId: userId,
      metadata: { reason },
    }, tx);
  });

  return { tempPassword };
}

export async function deleteUserPermanently(
  actor: SessionUser,
  userId: string,
  confirmName: string,
): Promise<void> {
  await assertCan(actor, "user:manage");

  if (userId === actor.id) throw new AdminUserError("CANNOT_DELETE_SELF");

  try {
    await withTransaction(async (tx) => {
      const target = await repo.findById(userId, tx);
      if (!target) throw new AdminUserError("NOT_FOUND");
      if (target.role !== "STUDENT") throw new AdminUserError("DELETE_STUDENT_ONLY");
      if (target.name !== confirmName) throw new AdminUserError("NAME_MISMATCH");

      const deleted = await repo.deletePermanently(userId, confirmName, tx);
      if (!deleted) throw new AdminUserError("NAME_MISMATCH");

      await recordAudit({
        actorUserId: actor.id,
        action: "user:delete",
        targetType: "User",
        targetId: userId,
      }, tx);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isSerializationConflict(error)) throw new AdminUserError("USER_CHANGED");
    throw error;
  }
}
