import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { prisma } from "@/core/db/client";
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
