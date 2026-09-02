import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { prisma } from "@/core/db/client";
import { assertCredentialSignInSessionStillCurrent } from "./credential-session-boundary";
import { isLoginBlocked } from "./login-eligibility";
import { ac, adminRoles } from "./permissions";

export const auth = betterAuth({
  appName: "GBSW 통합관리시스템",

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      status: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "ACTIVE",
      },
      mustChangePassword: {
        type: "boolean",
        required: false,
        input: false,
        defaultValue: false,
      },
      deletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { status: true, deletedAt: true },
          });

          if (isLoginBlocked(user)) {
            throw APIError.from("FORBIDDEN", {
              message: "비활성화된 계정입니다.",
              code: "ACCOUNT_INACTIVE",
            });
          }
        },
        after: async (session, context) => {
          await assertCredentialSignInSessionStillCurrent(session, context);
        },
      },
    },
  },

  plugins: [
    admin({
      ac,
      roles: adminRoles,
      adminRoles: ["ADMIN"],
      defaultRole: "STUDENT",
    }),

    nextCookies(),
  ],
});
