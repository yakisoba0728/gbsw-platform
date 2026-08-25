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

/**
 * 최초 교사 부트스트랩. **`can()` 없이 쓰는 유일한 모듈이다** — 로그인 개념이
 * 없는 시점이라, 콘솔에만 찍히는 토큰 + 사용자 0명이 그 자리를 대신한다.
 */

export class BootstrapError extends Error {}

export async function isBootstrapNeeded(): Promise<boolean> {
  return (await repo.countUsers()) === 0;
}

/** 서버 부팅 시 호출한다. 사용자가 있으면 기존 토큰을 없애고 null을 준다. */
export async function issueBootstrapTokenIfNeeded(): Promise<string | null> {
  if (!(await isBootstrapNeeded())) {
    clearToken();
    return null;
  }
  return issueToken();
}

/** 폼을 그려도 되는가. 토큰을 소진하지 않고, 실패 사유도 구분해 주지 않는다. */
export async function canShowBootstrapForm(
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;
  if (!matchesToken(token)) return false;
  return isBootstrapNeeded();
}

export async function createInitialAdmin(
  token: string,
  input: BootstrapInput,
): Promise<void> {
  // 토큰이 유효하더라도 그 사이에 계정이 생겼을 수 있다.
  if (!(await isBootstrapNeeded())) {
    clearToken();
    throw new BootstrapError("ALREADY_INITIALIZED");
  }

  // 원자적 소진 — 동시 요청 중 여기를 통과하는 쪽은 하나뿐이다.
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
    // 생성이나 감사가 실패했으면 부트스트랩은 여전히 필요하다. 토큰을 되돌린다.
    restoreToken(token);
    throw error;
  }
}
