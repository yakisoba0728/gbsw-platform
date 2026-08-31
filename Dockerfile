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
# DATABASE_URL 자리표시자는 base에 두지 않는다. runner도 base를 상속하므로 여기 두면
# 최종 이미지의 환경변수로 굳고, 실제 값 없이 띄웠을 때 core/db/client.ts의
# 「DATABASE_URL 환경변수가 없습니다」 가드가 안 걸린 채 build:build로 접속을 시도한다.
# 값이 실제로 필요한 deps·builder에만 각각 둔다.

# Prisma CLI가 generate/migrate 때 대상 OpenSSL ABI를 판별한다. slim 이미지에는
# openssl과 libssl이 없어 1.1.x로 추측한다는 경고가 나므로 빌드·마이그레이션
# 스테이지만 보강한다. 순수 Node standalone runner에는 이 패키지를 싣지 않는다.
FROM base AS build-base
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# ─── deps: 의존성만 설치 (레이어 캐시용) ──────────────────────
FROM build-base AS deps
# npm ci의 postinstall(prisma generate)이 prisma.config.ts를 통해 DATABASE_URL을
# 요구한다 — 실제 접속은 하지 않고 값이 존재하기만 하면 되는 자리표시자다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
# postinstall이 prisma generate를 돌리므로 스키마·설정도 이 시점에 있어야 한다
# (스키마 없이 npm ci만 하면 "Could not find Prisma Schema"로 실패한다).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# ─── builder: prisma generate + next build ───────────────────
# docker-compose의 migrate 서비스가 이 스테이지를 그대로 재사용한다
# (Prisma CLI가 여기에만 있고 runner에는 없다).
FROM build-base AS builder
# prisma generate와 next build도 같은 자리표시자를 요구한다. compose의 migrate
# 서비스가 이 스테이지로 뜰 때는 compose가 진짜 DATABASE_URL로 덮어쓴다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# migrate 서비스가 이 스테이지를 그대로 실행한다. ignore 규칙 실수로 SQL이
# 빠지면 `migrate deploy`가 성공한 척 0개를 적용하므로 빌드에서 먼저 막는다.
RUN find prisma/migrations -mindepth 2 -maxdepth 2 -name migration.sql -print -quit \
 | grep -q .
# page-data 수집 중 Better Auth 모듈도 평가된다. 진짜 운영 값은 빌드 컨텍스트에
# 넣지 않고, 이 RUN 하나에만 명백한 비밀 아닌 자리표시자를 준다. runner는 base를
# 직접 상속하므로 값이 환경변수로 남지 않으며 실제 기동 때 compose 값만 읽는다.
RUN BETTER_AUTH_SECRET="build-only-not-a-runtime-secret-00000000" \
    BETTER_AUTH_URL="http://127.0.0.1:3000" \
    sh -c 'npx prisma generate && npm run build'

# ─── runner: standalone 산출물만 담은 최소 런타임 ─────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# build 스크립트가 public과 .next/static을 standalone에 넣고 그 최종 디렉터리를
# 검사한다. runner에는 검증 후 변경되지 않은 그 산출물 하나만 복사한다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 커뮤니티 첨부가 사는 곳. 볼륨이 이 경로에 마운트되면 도커가 여기의 소유권을
# 물려주므로, **USER를 바꾸기 전에** 만들어야 한다. 안 만들면 볼륨이 root 소유로
# 생기고, 컨테이너는 cap_drop: ALL이라 나중에 고칠 방법도 없다.
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# standalone 빌드가 만들어 주는 진입점
CMD ["node", "server.js"]
