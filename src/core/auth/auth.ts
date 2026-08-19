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
    // 자체 회원가입은 막는다. 계정 생성은 초대 흐름과 시드로만.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      phone: { type: "string", required: false },
      // 클라이언트가 직접 넣지 못하게 input:false — 서버에서만 설정한다.
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
      // 명단에서 빠져 소프트 삭제된 계정. 세션 훅과 requireAuth()가 함께 본다.
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
      // 비밀번호 대입 공격 완화
      "/sign-in/email": { window: 60, max: 10 },
    },
  },

  /**
   * 중지·삭제된 계정은 세션 발급 자체를 막는다 — /api/auth/sign-in/email은
   * requireAuth() 밖이라 여기서 막지 않으면 쿠키가 나간다.
   */
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
    // 계정 컬럼(role·banned…)만 이 플러그인이 관리한다. 업무 권한은 can.ts뿐이다.
    admin({
      ac,
      roles: adminRoles,
      adminRoles: ["ADMIN"],
      defaultRole: "STUDENT",
    }),

    // 서버 액션에서 Set-Cookie가 적용되게 해준다. 반드시 마지막.
    nextCookies(),
  ],
});
