import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
import { withTransaction } from "@/core/db/client";
import * as repo from "./bootstrap.repo";
import type { BootstrapInput } from "./bootstrap.schema";
import {
  clearToken,
  consumeToken,
  issueToken,
  matchesToken,
  restoreToken,
} from "./bootstrap.token";

export class BootstrapError extends Error {}

export async function isBootstrapNeeded(): Promise<boolean> {
  return (await repo.countUsers()) === 0;
}

export async function issueBootstrapTokenIfNeeded(): Promise<string | null> {
  if (!(await isBootstrapNeeded())) {
    clearToken();
    return null;
  }
  return issueToken();
}

export async function canShowBootstrapForm(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  if (!matchesToken(token)) return false;
  return isBootstrapNeeded();
}

/** 로그인 이전 경로로, 콘솔 토큰과 사용자 0명이 권한 검사를 대신한다. */
export async function createInitialAdmin(
  token: string,
  input: BootstrapInput,
): Promise<void> {
  if (!(await isBootstrapNeeded())) {
    clearToken();
    throw new BootstrapError("ALREADY_INITIALIZED");
  }

  if (!consumeToken(token)) {
    throw new BootstrapError("INVALID_TOKEN");
  }

  const userId = randomUUID();

  try {
    const passwordHash = await hashPassword(input.password);

    await withTransaction(async (tx) => {
      await repo.createAdminUser({
        userId,
        accountId: randomUUID(),
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
      }, tx);

      await recordAudit({
        actorUserId: userId,
        action: "account:bootstrap",
        targetType: "User",
        targetId: userId,
      }, tx);
    });
  } catch (error) {
    restoreToken(token);
    throw error;
  }
}
