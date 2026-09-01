#!/usr/bin/env bash
set -euo pipefail

# 통합 테스트(I7) 전용 DB를 준비한다.
#
# 개발 DB(gbsw)와 완전히 분리된 별도 데이터베이스를 같은 컨테이너(gbsw-db) 안에
# 만든다 — 통합 테스트가 실 계정·감사로그를 절대 건드리지 않게 하기 위해서다.
# 이미 있으면 건너뛰고, 마이그레이션만 최신으로 맞춘다(멱등).

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL을 .env에 설정하세요 (.env.example 참고, DATABASE_URL과 DB 이름이 달라야 합니다)}"

# 문자열 완전일치로는 `localhost`↔`127.0.0.1`, 포트 생략, `?schema=` 유무가
# 전부 「다른 값」이 되어 같은 DB를 그대로 통과시킨다. Playwright·vitest와
# 같은 정규화 판정을 쓴다 (scripts/database-target.mjs).
node scripts/assert-test-database.mjs

# DATABASE_URL 형태: postgresql://user:pass@host:port/dbname[?...]
TEST_DB_NAME=$(echo "$TEST_DATABASE_URL" | sed -E 's#^[a-z]+://[^/]+/([^/?]+).*$#\1#')
ADMIN_DB_USER="${POSTGRES_USER:-gbsw}"
ADMIN_DB_NAME="${POSTGRES_DB:-gbsw}"

echo "[test-db] '${TEST_DB_NAME}' 데이터베이스 확인 중… (컨테이너: gbsw-db)"
EXISTS=$(docker exec gbsw-db psql -U "$ADMIN_DB_USER" -d "$ADMIN_DB_NAME" -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'")

if [ "$EXISTS" != "1" ]; then
  echo "[test-db] '${TEST_DB_NAME}' 데이터베이스가 없어 새로 만듭니다."
  docker exec gbsw-db psql -U "$ADMIN_DB_USER" -d "$ADMIN_DB_NAME" -c "CREATE DATABASE \"${TEST_DB_NAME}\""
else
  echo "[test-db] 이미 있습니다."
fi

echo "[test-db] 마이그레이션 적용 중…"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

echo "[test-db] 준비 완료 — npm run test:integration 으로 돌릴 수 있습니다."
