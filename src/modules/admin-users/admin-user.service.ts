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

/** 최근 감사로그 몇 건까지 상세에 붙일지. */
const RELATED_AUDIT_LIMIT = 20;

export async function getUserDetail(actor: SessionUser, userId: string) {
  await assertCan(actor, "user:manage");

  const year = await getCurrentYear();
  const user = await repo.findDetail(userId, year);
  if (!user) throw new AdminUserError("NOT_FOUND");

  const audit = await repo.findRelatedAudit(userId, RELATED_AUDIT_LIMIT);
  return { user, audit };
}

/**
 * 정보 수정. 달라진 항목의 이름만 감사로그에 남긴다 — 값을 남기면 감사로그가
 * 개인정보 사본이 된다. 학년·반·번호는 재학 중일 때만 바뀐 항목으로 잡는다.
 */
export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: UpdateUserInput,
): Promise<{ changed: string[] }> {
  await assertCan(actor, "user:manage");

  const year = await getCurrentYear();
  const current = await repo.findDetail(userId, year);
  if (!current) throw new AdminUserError("NOT_FOUND");
  // 화면 가드는 실수 방지일 뿐이라 서버에서도 막는다.
  if (current.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  const changed: string[] = [];

  if (current.name !== input.name) changed.push("name");
  if (current.email !== input.email) changed.push("email");
  if (current.phone !== input.phone) changed.push("phone");

  const profile = current.studentProfile;
  const isStudent = profile !== null && profile !== undefined;
  const enrollment = profile?.enrollments[0];
  // 재학 중일 때만 학년·반·번호를 이 화면에서 편집 가능한 것으로 본다.
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
        enrollment?.schoolClass?.grade !== input.grade
      ) {
        changed.push("grade");
      }
      if (
        input.classNo !== undefined &&
        enrollment?.schoolClass?.classNo !== input.classNo
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
    // 값을 지어내지 않는다 — 하나라도 없으면 거절한다.
    if (
      !input.birthDate ||
      input.grade == null ||
      input.classNo == null ||
      input.number == null
    ) {
      throw new AdminUserError("INCOMPLETE_STUDENT_INPUT");
    }
  }

  // 셋을 한 트랜잭션으로 저장한다 — 절반만 저장되는 상태를 막는다.
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
                // 생년월일은 날짜만 의미가 있다. KST 자정으로 고정해 하루 밀림을 막는다.
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
        // 바뀐 값이 아니라 바뀐 항목 이름만 남긴다.
        metadata: { changed },
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

/** 계정 활성/비활성 토글. 비활성화는 repo가 세션 삭제까지 한 트랜잭션으로 묶는다. */
export async function setUserActive(
  actor: SessionUser,
  userId: string,
  active: boolean,
): Promise<void> {
  await assertCan(actor, "user:manage");

  // 스스로를 잠가 가두는 상황을 막는다.
  if (userId === actor.id && !active) {
    throw new AdminUserError("CANNOT_DEACTIVATE_SELF");
  }

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");
  // 화면이 이 폼을 감추는 건 실수 방지일 뿐이라 서버에서도 막는다.
  if (target.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  await withTransaction(async (tx) => {
    await repo.setActive(userId, active, tx);

    await recordAudit({
      actorUserId: actor.id,
      action: active ? "user:activate" : "user:deactivate",
      targetType: "User",
      targetId: userId,
    }, tx);
  });
}

/**
 * 비밀번호 초기화. SMTP가 없어 임시 비밀번호를 화면에 한 번 띄우고, 평문은
 * 반환값으로만 존재한다 — 저장하지도 기록하지도 않는다.
 */
export async function resetPassword(
  actor: SessionUser,
  userId: string,
): Promise<{ tempPassword: string }> {
  await assertCan(actor, "user:manage");

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");
  if (target.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await withTransaction(async (tx) => {
    const updated = await repo.resetCredential(userId, passwordHash, tx);

    if (updated === 0) {
      // 비밀번호 로그인 수단이 없는 계정 — 초기화할 대상이 없다.
      throw new AdminUserError("NO_CREDENTIAL_ACCOUNT");
    }

    await recordAudit({
      actorUserId: actor.id,
      action: "user:reset-password",
      targetType: "User",
      targetId: userId,
      // 임시 비밀번호는 감사로그에도 남기지 않는다.
    }, tx);
  });

  return { tempPassword };
}

/**
 * 완전 삭제 (오등록 정리 전용). 되돌릴 수 없다. 이름 대조도 화면이 아니라
 * 여기가 강제하고, 삭제 직전 조건에도 다시 들어간다.
 */
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
        // 이름은 남기지 않는다 — 삭제된 사람의 개인정보가 감사로그에 남으면 안 된다.
      }, tx);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // Serializable로 돌면서 충돌 판정이 없으면, 되돌릴 수 없는 삭제가 정체불명
    // 실패로 끝난다 — 교사는 지워졌는지 아닌지 모른 채 다시 누르게 된다.
    // updateUser와 같은 판정을 쓴다.
    if (isSerializationConflict(error)) throw new AdminUserError("USER_CHANGED");
    throw error;
  }
}
