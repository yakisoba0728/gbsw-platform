import { recordAudit } from "@/core/audit/audit";
import { auth } from "@/core/auth/auth";
import { getSessionUser } from "@/core/auth/session";

export type LoginAuditReason =
  | "credentials"
  | "disabled"
  | "rateLimited"
  | "server";

export type EmailAuthenticationResult =
  | { ok: true; response: Response }
  | { ok: false; reason: LoginAuditReason; response: Response };

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return local.length <= 2 ? `***@${domain}` : `${local.slice(0, 2)}***@${domain}`;
}

// 감사 저장 실패가 이미 결정된 로그인 성공·실패를 바꾸지 않게 한다.
async function recordLoginAttempt(input: {
  ok: boolean;
  email: string;
  userId?: string | null;
  reason?: LoginAuditReason;
}): Promise<void> {
  try {
    await recordAudit({
      actorUserId: input.userId ?? null,
      action: input.ok ? "auth:login" : "auth:login-failed",
      targetType: "User",
      targetId: input.userId ?? undefined,
      metadata: input.reason
        ? { email: maskEmail(input.email), reason: input.reason }
        : { email: maskEmail(input.email) },
    });
  } catch (error) {
    console.error("[auth] 로그인 기록을 남기지 못했습니다.", error);
  }
}

async function loginFailureReason(response: Response): Promise<LoginAuditReason> {
  if (response.status === 429) return "rateLimited";
  if (response.status === 403) {
    try {
      const body = (await response.clone().json()) as { code?: unknown };
      if (body.code === "ACCOUNT_INACTIVE") return "disabled";
    } catch {
      // 비정형 인증 응답은 일반 서버 오류로 안내한다.
    }
    return "server";
  }
  return "credentials";
}

async function signedInUserId(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { user?: { id?: unknown } };
    return typeof body.user?.id === "string" ? body.user.id : null;
  } catch {
    return null;
  }
}

export async function authenticateWithEmail(input: {
  email: string;
  password: string;
  origin: string;
  requestHeaders: Headers;
}): Promise<EmailAuthenticationResult> {
  const authHeaders = new Headers(input.requestHeaders);
  authHeaders.set("content-type", "application/json");
  authHeaders.set("accept", "application/json");
  authHeaders.set("origin", input.origin);
  authHeaders.delete("content-length");

  const response = await auth.handler(
    new Request(new URL("/api/auth/sign-in/email", input.origin), {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email: input.email, password: input.password }),
    }),
  );

  if (!response.ok) {
    const reason = await loginFailureReason(response);
    await recordLoginAttempt({ ok: false, email: input.email, reason });
    return { ok: false, reason, response };
  }

  await recordLoginAttempt({
    ok: true,
    email: input.email,
    userId: await signedInUserId(response),
  });
  return { ok: true, response };
}

export async function signInSilently(
  email: string,
  password: string,
  requestHeaders: Promise<Headers>,
): Promise<void> {
  let userId: string;
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: await requestHeaders,
    });
    userId = result.user.id;
  } catch {
    return;
  }

  try {
    await recordAudit({
      actorUserId: userId,
      action: "auth:login",
      targetType: "User",
      targetId: userId,
      metadata: { email: maskEmail(email) },
    });
  } catch (error) {
    console.error("[auth] 자동 로그인 기록을 남기지 못했습니다.", error);
  }
}

export async function signOut(request: Request): Promise<Response> {
  const actor = await getSessionUser();
  const response = await auth.handler(request);

  if (response.ok && actor) {
    try {
      await recordAudit({
        actorUserId: actor.id,
        action: "auth:logout",
        targetType: "User",
        targetId: actor.id,
      });
    } catch (error) {
      console.error("[auth] 로그아웃 기록을 남기지 못했습니다.", error);
    }
  }

  return response;
}
