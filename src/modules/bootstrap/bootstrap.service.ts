import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { recordAudit } from "@/core/audit/audit";
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
 * 최초 관리자 부트스트랩.
 *
 * ⚠️ 이 모듈은 프로젝트에서 유일하게 `can()` 없이 쓰기를 수행한다.
 * 로그인 개념이 존재하지 않는 시점이라 역할 기반 권한이 성립하지 않기 때문이다.
 * 그 자리를 "서버 콘솔에만 출력된 토큰" + "사용자 수 0명" 두 조건이 대신한다.
 * **다른 모듈은 이 예외를 따라해서는 안 된다.**
 */

export class BootstrapError extends Error {}

export async function isBootstrapNeeded(): Promise<boolean> {
  return (await repo.countUsers()) === 0;
}

/**
 * 서버 부팅 시 호출한다.
 * 사용자가 없으면 토큰을 발급해 돌려주고, 있으면 기존 토큰을 없앤 뒤 null을 준다.
 */
export async function issueBootstrapTokenIfNeeded(): Promise<string | null> {
  if (!(await isBootstrapNeeded())) {
    clearToken();
    return null;
  }
  return issueToken();
}

/**
 * 부트스트랩 폼을 그려도 되는지 판단한다. 토큰을 소진하지 않는다.
 * 실패 사유(토큰 불일치 / 이미 설정됨)를 구분해 돌려주지 않는다 — 정보 노출 방지.
 */
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

  // 원자적 소진 — 동시 요청 중 여기를 통과하는 쪽은 반드시 하나뿐이다.
  if (!consumeToken(token)) {
    throw new BootstrapError("INVALID_TOKEN");
  }

  const userId = randomUUID();

  try {
    await repo.createAdminUser({
      userId,
      accountId: randomUUID(),
      name: input.name,
      email: input.email,
      // Better Auth가 로그인 때 쓰는 것과 동일한 해시 함수.
      passwordHash: await hashPassword(input.password),
    });
  } catch (error) {
    // 생성이 실패했으면 부트스트랩은 여전히 필요하다. 토큰을 되돌린다.
    restoreToken(token);
    throw error;
  }

  await recordAudit({
    actorUserId: userId,
    action: "account:bootstrap",
    targetType: "User",
    targetId: userId,
  });
}
