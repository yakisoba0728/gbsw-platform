"use client";

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, adminRoles } from "./permissions";

/** baseURL을 주지 않으면 현재 오리진을 쓴다 — 빌드타임 변수 없이 배포된다. */
export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: adminRoles })],
});

export const { signIn, signOut, useSession } = authClient;
