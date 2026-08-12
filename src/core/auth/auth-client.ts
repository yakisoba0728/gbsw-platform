"use client";

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, adminRoles } from "./permissions";

/**
 * baseURL을 주지 않으면 현재 오리진을 쓴다.
 * 덕분에 NEXT_PUBLIC_* 빌드타임 변수 없이도 어떤 도메인에 배포하든 그대로 동작한다.
 */
export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: adminRoles })],
});

export const { signIn, signOut, useSession } = authClient;
