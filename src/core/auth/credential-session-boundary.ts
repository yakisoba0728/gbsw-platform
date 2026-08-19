import { APIError } from "better-auth";
import { verifyPassword } from "better-auth/crypto";
import { prisma, withTransaction } from "@/core/db/client";

type CreatedSession = {
  id?: string;
  userId?: string;
};

type HookContext = {
  path?: unknown;
  body?: unknown;
} | null | undefined;

type SignInEmailBody = {
  email: string;
  password: string;
};

type CredentialAccountRow = {
  id: string;
  password: string | null;
};

type CredentialSessionCheck = "current" | "stale";

function unauthorizedCredentialSignIn(): APIError {
  return APIError.from("UNAUTHORIZED", {
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  });
}

function getCredentialSignInBody(context: HookContext): SignInEmailBody | null {
  if (context?.path !== "/sign-in/email") return null;
  const body = context.body;
  if (!body || typeof body !== "object") return null;

  const maybeBody = body as Partial<SignInEmailBody>;
  if (typeof maybeBody.email !== "string" || typeof maybeBody.password !== "string") {
    return null;
  }

  return { email: maybeBody.email, password: maybeBody.password };
}

export function isCredentialSignInHookContext(context: HookContext): boolean {
  return getCredentialSignInBody(context) !== null;
}

/**
 * Better Auth verifies the password before inserting the session. A concurrent
 * password change can commit between those two steps, so the session insert is
 * rechecked against the current credential row while holding its row lock.
 */
export async function assertCredentialSignInSessionStillCurrent(
  session: CreatedSession | null | undefined,
  context: HookContext,
): Promise<void> {
  const body = getCredentialSignInBody(context);
  if (!body) return;
  if (!session?.id || !session.userId) throw unauthorizedCredentialSignIn();

  const check = await withTransaction<CredentialSessionCheck>(async (tx) => {
    const accounts = await tx.$queryRaw<CredentialAccountRow[]>`
      SELECT "id", "password"
      FROM "account"
      WHERE "userId" = ${session.userId}
        AND "providerId" = 'credential'
      FOR UPDATE
    `;

    const account = accounts[0];
    const passwordMatches = account?.password
      ? await verifyPassword({ hash: account.password, password: body.password })
      : false;

    if (passwordMatches) return "current";

    await tx.session.deleteMany({
      where: { id: session.id, userId: session.userId },
    });
    return "stale";
  });

  if (check === "stale") throw unauthorizedCredentialSignIn();
}

export async function lockCredentialAccountForMutation(
  userId: string,
  db: Pick<typeof prisma, "$queryRaw">,
): Promise<void> {
  await db.$queryRaw<Pick<CredentialAccountRow, "id">[]>`
    SELECT "id"
    FROM "account"
    WHERE "userId" = ${userId}
      AND "providerId" = 'credential'
    FOR UPDATE
  `;
}
