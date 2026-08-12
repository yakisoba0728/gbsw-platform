# syntax=docker/dockerfile:1

# ─── base ────────────────────────────────────────────────────
FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ─── deps: 의존성만 설치 (레이어 캐시용) ──────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ─── builder: prisma generate + next build ───────────────────
# docker-compose의 migrate 서비스가 이 스테이지를 그대로 재사용한다
# (Prisma CLI가 여기에만 있고 runner에는 없다).
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build 중에 모듈 초기화만 일어나고 실제 접속은 하지 않는다.
# core/db/client.ts가 DATABASE_URL 부재로 즉시 throw하는 걸 막기 위한 자리표시자.
# 런타임 값은 compose가 주입한다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npx prisma generate && npm run build

# ─── runner: standalone 산출물만 담은 최소 런타임 ─────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# standalone 빌드가 만들어 주는 진입점
CMD ["node", "server.js"]
