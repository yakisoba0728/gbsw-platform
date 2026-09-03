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
      // 위의 확인은 트랜잭션 밖이라 인스턴스가 둘이면 서로를 보지 못한다.
      // 잠금을 먼저 잡고 그 안에서 사용자 수를 다시 세는 것이 실제 직렬화다.
      await repo.lockBootstrap(tx);
      if ((await repo.countUsers(tx)) !== 0) {
        throw new BootstrapError("ALREADY_INITIALIZED");
      }

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
    // 이미 만들어졌으면 되돌릴 것이 없다 — 소진된 토큰을 살려 두면 다음 요청이
    // 같은 벽에 다시 부딪힌다. 일시적 오류만 토큰을 돌려준다.
    if (!isAlreadyInitialized(error)) restoreToken(token);
    throw error;
  }
}

function isAlreadyInitialized(error: unknown): boolean {
  return error instanceof BootstrapError && error.message === "ALREADY_INITIALIZED";
}
