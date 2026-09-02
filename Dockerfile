# syntax=docker/dockerfile:1

# 멀티아키텍처 OCI 인덱스 다이제스트를 고정한다.
FROM node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Prisma CLI의 OpenSSL ABI 탐지용이며 runner에는 포함하지 않는다.
FROM base AS build-base
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# postinstall의 Prisma 생성에는 연결 없이 DATABASE_URL·스키마·설정이 필요하다.
# 빌드용 DB 자리표시자는 deps/builder에만 두어 runner의 운영 환경변수 검사를 유지한다.
FROM build-base AS deps
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# Prisma CLI가 있는 builder를 1회성 migrate 서비스에서도 사용한다.
FROM build-base AS builder
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# SQL 누락 시 0개 적용으로 성공하는 배포를 막는다.
RUN find prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -print -quit \
 | grep -q .
# 운영 비밀은 빌드 컨텍스트에 넣지 않고 이 RUN에만 빌드용 값을 준다.
RUN BETTER_AUTH_SECRET="build-only-not-a-runtime-secret-00000000" \
    BETTER_AUTH_URL="http://127.0.0.1:3000" \
    sh -c 'npx prisma generate && npm run build'

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# public/static을 포함해 검증한 standalone 산출물을 그대로 복사한다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 비루트 실행 전에 볼륨 디렉터리 소유권을 설정한다.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
