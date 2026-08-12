import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { formatDateInput } from "@/lib/datetime";
import { generateTempPassword } from "@/lib/temp-password";
import * as repo from "./admin-user.repo";
import type { UpdateUserInput } from "./admin-user.schema";

export class AdminUserError extends Error {}

export const USER_STATUS = { ACTIVE: "ACTIVE", INACTIVE: "INACTIVE" } as const;

export async function listUsers(actor: SessionUser) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");
  return repo.listUsers();
}

/** 최근 감사로그 몇 건까지 상세에 붙일지. */
const RELATED_AUDIT_LIMIT = 20;

export async function getUserDetail(actor: SessionUser, userId: string) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const user = await repo.findDetail(userId);
  if (!user) throw new AdminUserError("NOT_FOUND");

  const audit = await repo.findRelatedAudit(userId, RELATED_AUDIT_LIMIT);
  return { user, audit };
}

/**
 * 정보 수정.
 *
 * 실제로 달라진 항목만 감사로그에 남긴다 — **값이 아니라 필드 이름만**.
 * 감사로그가 개인정보 사본이 되면 안 된다.
 * 바뀐 게 없으면 저장도 기록도 하지 않는다 (no-op으로 로그가 오염되지 않게).
 */
export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: UpdateUserInput,
): Promise<{ changed: string[] }> {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const current = await repo.findDetail(userId);
  if (!current) throw new AdminUserError("NOT_FOUND");

  const nextPhone = input.phone ? input.phone : null;
  const changed: string[] = [];

  if (current.name !== input.name) changed.push("name");
  if (current.phone !== nextPhone) changed.push("phone");

  const profile = current.studentProfile;
  const isStudent = profile !== null && profile !== undefined;

  if (isStudent) {
    if (
      input.birthDate &&
      formatDateInput(profile.birthDate) !== input.birthDate
    ) {
      changed.push("birthDate");
    }
    if (input.grade !== undefined && profile.schoolClass?.grade !== input.grade) {
      changed.push("grade");
    }
    if (
      input.classNo !== undefined &&
      profile.schoolClass?.classNo !== input.classNo
    ) {
      changed.push("classNo");
    }
    if (input.number !== undefined && profile.number !== input.number) {
      changed.push("number");
    }
  }

  if (changed.length === 0) return { changed };

  if (changed.includes("name") || changed.includes("phone")) {
    await repo.updateProfile(userId, { name: input.name, phone: nextPhone });
  }

  const studentChanged = ["birthDate", "grade", "classNo", "number"].some((f) =>
    changed.includes(f),
  );

  if (isStudent && studentChanged) {
    if (!input.birthDate || input.grade == null || input.classNo == null) {
      throw new AdminUserError("INCOMPLETE_STUDENT_INPUT");
    }
    await repo.updateStudentProfile(profile.id, {
      // 생년월일은 날짜만 의미가 있다. KST 자정으로 고정해 하루 밀림을 막는다.
      birthDate: new Date(`${input.birthDate}T00:00:00+09:00`),
      grade: input.grade,
      classNo: input.classNo,
      number: input.number ?? profile.number ?? 1,
    });
  }

  await recordAudit({
    actorUserId: actor.id,
    action: "user:update",
    targetType: "User",
    targetId: userId,
    // 바뀐 값이 아니라 바뀐 항목 이름만 남긴다.
    metadata: { changed },
  });

  return { changed };
}

/**
 * 계정 활성/비활성 토글.
 *
 * 비활성화하면 세션도 함께 끊는다. requireAuth()가 상태를 다시 확인하므로
 * 남아 있는 쿠키로도 들어올 수 없다.
 */
export async function setUserActive(
  actor: SessionUser,
  userId: string,
  active: boolean,
): Promise<void> {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  // 스스로를 잠가 가두는 상황을 막는다.
  if (userId === actor.id && !active) {
    throw new AdminUserError("CANNOT_DEACTIVATE_SELF");
  }

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");

  await repo.setStatus(userId, active ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE);
  if (!active) await repo.deleteSessions(userId);

  await recordAudit({
    actorUserId: actor.id,
    action: active ? "user:activate" : "user:deactivate",
    targetType: "User",
    targetId: userId,
  });
}

/**
 * 비밀번호 초기화.
 *
 * SMTP가 없으므로 임시 비밀번호를 화면에 한 번 띄워 관리자가 직접 전달한다.
 * 평문은 반환값으로만 존재하고 저장·기록되지 않는다.
 */
export async function resetPassword(
  actor: SessionUser,
  userId: string,
): Promise<{ tempPassword: string }> {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");

  const tempPassword = generateTempPassword();
  const updated = await repo.replaceCredentialPassword(
    userId,
    await hashPassword(tempPassword),
  );

  if (updated === 0) {
    // 비밀번호 로그인 수단이 없는 계정 — 초기화할 대상이 없다.
    throw new AdminUserError("NO_CREDENTIAL_ACCOUNT");
  }

  // 다음 로그인에 강제 변경시키고, 기존 세션은 모두 끊는다.
  await repo.setMustChangePassword(userId, true);
  await repo.deleteSessions(userId);

  await recordAudit({
    actorUserId: actor.id,
    action: "user:reset-password",
    targetType: "User",
    targetId: userId,
    // 임시 비밀번호는 감사로그에도 남기지 않는다.
  });

  return { tempPassword };
}
