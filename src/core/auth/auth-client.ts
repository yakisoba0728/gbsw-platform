"use client";

import { createAuthClient } from "better-auth/react";

/** baseURL을 주지 않으면 현재 오리진을 쓴다 — 빌드타임 변수 없이 배포된다. */
export const authClient = createAuthClient();
