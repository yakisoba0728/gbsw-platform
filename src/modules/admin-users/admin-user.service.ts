import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import type { SessionUser } from "@/core/auth/session";
import { can } from "@/core/authz/can";
import { formatDateInput, parseDateInputKst } from "@/lib/datetime";
import { generateTempPassword } from "@/lib/temp-password";
import { getCurrentYear } from "@/modules/academic-year/academic-year.service";
import * as repo from "./admin-user.repo";
import type { UpdateUserInput } from "./admin-user.schema";

export class AdminUserError extends Error {}

export async function listUsers(actor: SessionUser) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");
  return repo.listUsers(await getCurrentYear());
}

/** 최근 감사로그 몇 건까지 상세에 붙일지. */
const RELATED_AUDIT_LIMIT = 20;

export async function getUserDetail(actor: SessionUser, userId: string) {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const user = await repo.findDetail(userId, year);
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
 *
 * 이메일을 바꾸면 다음 로그인부터 새 주소를 쓴다. credential 계정은 accountId가
 * userId라 로그인 수단 자체는 그대로다. emailVerified도 건드리지 않는다 —
 * 초대코드가 신뢰 기준이고 이번엔 관리자가 직접 바꾼 것이라 근거가 약해지지 않는다.
 * 세션도 끊지 않는다. 이메일은 인증 수단이 아니고, 계정을 실제로 뺏는 경로
 * (비밀번호 초기화·비활성화)는 각자 세션을 끊는다.
 *
 * 학년·반·번호는 **재학 중인 학생만** 이 화면에서 다룬다 (I2). 졸업·자퇴 등으로
 * Enrollment.status가 ENROLLED가 아니면 학년·반·번호는 애초에 "바뀐 항목"으로도
 * 잡지 않는다 — 학적 변경은 /admin/students 표(계정 상태 동기화가 있는 곳) 한
 * 곳에서만 하도록 통일한다. 생년월일(신원)은 학적과 무관하게 언제나 고칠 수 있다.
 */
export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: UpdateUserInput,
): Promise<{ changed: string[] }> {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const year = await getCurrentYear();
  const current = await repo.findDetail(userId, year);
  if (!current) throw new AdminUserError("NOT_FOUND");

  const changed: string[] = [];

  if (current.name !== input.name) changed.push("name");
  if (current.email !== input.email) changed.push("email");
  if (current.phone !== input.phone) changed.push("phone");

  const profile = current.studentProfile;
  const isStudent = profile !== null && profile !== undefined;
  const enrollment = profile?.enrollments[0];
  // 재학 중일 때만 학년·반·번호를 이 화면에서 편집 가능한 것으로 본다 (I2).
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
    // M10: 값을 지어내지 않는다 — 셋 중 하나라도 없으면 거절한다.
    if (
      !input.birthDate ||
      input.grade == null ||
      input.classNo == null ||
      input.number == null
    ) {
      throw new AdminUserError("INCOMPLETE_STUDENT_INPUT");
    }
  }

  // 이름·이메일·전화번호, 생년월일, 학년·반·번호를 한 트랜잭션으로 저장한다 (I1) —
  // 절반만 저장되고 감사로그는 안 남는 상태를 막는다. repo.updateUserAndEnrollment가
  // enrollment.repo.ts의 applyAll과 같은 패턴으로 묶는다.
  try {
    await repo.updateUserAndEnrollment(userId, {
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
    });
  } catch (error) {
    if (error instanceof repo.EmailTakenError) throw new AdminUserError("EMAIL_TAKEN");
    if (error instanceof repo.NumberTakenError) throw new AdminUserError("NUMBER_TAKEN");
    throw error;
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
 * 비활성화하면 세션도 함께 끊는다 — repo.setActive가 상태 변경과 세션 삭제를
 * 한 트랜잭션으로 묶는다 (M11). requireAuth()가 상태를 다시 확인하므로
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

  await repo.setActive(userId, active);

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
 *
 * 비밀번호 교체 → 다음 로그인 강제 변경 → 세션 삭제를 repo.resetCredential이
 * 한 트랜잭션으로 묶는다 (M11) — 중간 실패로 "비밀번호는 바뀌었는데 강제 변경이
 * 안 걸림" 상태가 남는 걸 막는다.
 */
export async function resetPassword(
  actor: SessionUser,
  userId: string,
): Promise<{ tempPassword: string }> {
  if (!can(actor, "user:manage")) throw new Error("FORBIDDEN");

  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");

  const tempPassword = generateTempPassword();
  const updated = await repo.resetCredential(userId, await hashPassword(tempPassword));

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
  });

  return { tempPassword };
}
