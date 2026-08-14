import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { prisma } from "@/core/db/client";
import { isLoginBlocked } from "./login-eligibility";
import { ac, adminRoles } from "./permissions";

export const auth = betterAuth({
  appName: "GBSW 통합관리시스템",

  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // 자체 회원가입은 막는다. 계정 생성은 초대 흐름(추후 모듈)과 시드로만.
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
      // 명단에서 빠져 소프트 삭제된 계정. input:false — 클라이언트가 직접 못 넣는다.
      // 세션 훅과 requireAuth() 둘 다 이 값을 본다 (defense-in-depth).
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

  /*
   * status !== "ACTIVE"이거나 deletedAt이 찍힌 계정은 세션 자체를 만들지 못하게 한다.
   *
   * requireAuth()가 매 요청마다 이 둘을 다시 검사하긴 하지만, 그건 (app) 레이아웃과
   * 서버 액션 "안"에서만 실행된다. /api/auth/sign-in/email은 그 밖이라 Better Auth가
   * 이 계정을 얼마든지 로그인시켜 새 세션 쿠키를 내줄 수 있었다 — admin 플러그인의
   * session.create.before가 banned만 보고 우리 status·deletedAt은 모르기 때문이다.
   * 같은 자리(session.create.before)에 우리 검사를 추가해 발급 자체를 막는다.
   *
   * deletedAt 검사를 빠뜨리면 명단에서 빠져 소프트 삭제된 학생이 자기 비밀번호를
   * 그대로 기억하고 있는 한 다시 로그인할 수 있다 — status만 보던 시절 이 자리에
   * 정확히 같은 구멍이 있었다(위 문단). isLoginBlocked()가 두 조건을 함께 본다.
   *
   * ctx.context.internalAdapter로 조회하는 대신 prisma를 직접 쓴다 — admin.mjs는 타입이
   * 없는 자바스크립트라 findUserById의 반환 타입에 status가 보이지 않고, ctx가 null인
   * 경로(내부 API 직접 호출 등)에서도 검사가 빠지지 않게 하려는 목적도 있다.
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
      },
    },
  },

  plugins: [
    // role / banned / banReason / banExpires 컬럼과 대리로그인은 이 플러그인이 관리한다.
    // 업무 권한 판정은 core/authz/can.ts 단일 경로로만 한다.
    admin({
      ac,
      roles: adminRoles,
      adminRoles: ["ADMIN"],
      defaultRole: "STUDENT",
    }),

    // 서버 액션에서 Set-Cookie가 실제로 적용되게 해준다. 반드시 마지막.
    nextCookies(),
  ],
});
