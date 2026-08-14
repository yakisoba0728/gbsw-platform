# syntax=docker/dockerfile:1

# ─── base ────────────────────────────────────────────────────
# 태그(24-slim)만으로는 같은 이름의 이미지가 나중에 바뀔 수 있다 — 다이제스트로
# 고정해 빌드가 항상 같은 이미지를 받게 한다 (M16). 갱신하려면:
#   docker buildx imagetools inspect node:24-slim
# 위 명령의 최상단 Digest(멀티아키텍처 인덱스, application/vnd.oci.image.index)를
# 쓴다 — 특정 아키텍처의 매니페스트 다이제스트를 쓰면 다른 아키텍처에서 빌드가 깨진다.
FROM node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# deps 단계의 npm ci(postinstall: prisma generate)도, builder 단계의 next build도
# prisma.config.ts를 통해 DATABASE_URL을 요구한다 — 실제 접속은 하지 않고 값이
# 존재하기만 하면 되는 자리표시자다. 둘 다에서 쓰이므로 공통 조상인 base에 둔다.
# 런타임 값은 compose가 주입한다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

# ─── deps: 의존성만 설치 (레이어 캐시용) ──────────────────────
FROM base AS deps
# postinstall이 prisma generate를 돌리므로 스키마·설정도 이 시점에 있어야 한다
# (스키마 없이 npm ci만 하면 "Could not find Prisma Schema"로 실패한다).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ─── builder: prisma generate + next build ───────────────────
# docker-compose의 migrate 서비스가 이 스테이지를 그대로 재사용한다
# (Prisma CLI가 여기에만 있고 runner에는 없다).
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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
