# gbsw-platform

경북소프트웨어마이스터고등학교 통합관리시스템.

Next.js 16 (App Router) · TypeScript · Prisma 7 + PostgreSQL 18 · Better Auth · Tailwind CSS v4.
자체 호스팅(Docker Compose), 외부 SaaS 의존 없음, SMTP 불필요.

> **현재 상태:** 뼈대. 인증·권한·감사로그·앱 셸까지 완성되어 있고 업무 모듈은 아직 없다.
> 상벌점(merit)이 첫 번째로 붙을 모듈이다.

## 시작하기

필요한 것: Node 20.12+ (개발은 24에서 확인), Docker.

```bash
cp .env.example .env
# BETTER_AUTH_SECRET을 새로 만든다
openssl rand -base64 32

npm install
npm run db:up          # Postgres 18 컨테이너 (호스트 5433 포트)
npm run db:migrate     # 스키마 적용
npm run dev            # http://localhost:3000
```

### 최초 관리자 만들기

등록된 사용자가 없으면 서버가 뜰 때 콘솔에 1회성 토큰이 찍힌다. 주소와 토큰을
일부러 다른 줄로 나눈다(M17) — 로그 수집기에 완성된 링크 한 줄로 남으면
자동 링크화·로그를 훑는 도구에 그대로 걸려 클릭 한 번으로 소진될 수 있다.

```
────────────────────────────────────────────────────────────────
 등록된 사용자가 없습니다. 최초 관리자를 생성하세요.

   주소: http://localhost:3000/register?token=
   토큰: Xk9f3aQ2...c21b
   (주소 끝에 토큰을 이어 붙여 접속하세요)

 · 이 토큰은 서버를 재시작하면 새로 발급됩니다
 · 계정이 생성되면 즉시 무효화됩니다
────────────────────────────────────────────────────────────────
```

이 링크로 들어가 이름·이메일·비밀번호를 넣으면 최고관리자가 만들어지고 바로 로그인된다.
토큰은 **서버 콘솔에만** 나오므로, 서버에 접근할 수 있는 사람만 최초 관리자를 만들 수 있다.

계정이 하나라도 있으면 토큰이 발급되지 않고 `/register`는 거부 화면을 보여준다.
설계 근거는 [`docs/superpowers/specs/2026-08-12-bootstrap-admin-design.md`](docs/superpowers/specs/2026-08-12-bootstrap-admin-design.md) 참고.

## 명령어

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run verify` | 타입체크 + 린트 + 테스트 (작업 종료 전 실행) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest 단위 테스트 (`--project unit`) — 실 DB 없이 돈다, CI가 도는 대상 |
| `npm run test:integration` | repo 계층 통합 테스트 (`--project integration`) — 아래 참고 |
| `npm run db:up` | Postgres 컨테이너만 기동 |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:test:setup` | 통합 테스트 전용 DB(`gbsw_test`) 생성 + 마이그레이션 |
| `npm run db:studio` | Prisma Studio |
| `npm run auth:generate` | Better Auth가 기대하는 스키마 생성 (대조용) |

### 통합 테스트 (I7)

repo 계층 대부분은 `vi.mock("@/core/db/client")`로 Prisma를 통째로 대체해 단위
테스트한다 — 로직은 빠르게 검증되지만, 트랜잭션 롤백이 실제로 도는지·초대코드
동시 사용 방어가 실제로 하나만 통과시키는지·유일 제약이 실제로 걸리는지는
목으로는 검증할 수 없다. `tests/integration/`의 소수 테스트만 실 Postgres에
대고 이걸 확인한다.

**개발 DB(`gbsw`)와 완전히 분리된 별도 데이터베이스(`gbsw_test`)를 쓴다** —
같은 컨테이너(`gbsw-db`) 안에 두되 데이터베이스 이름 자체가 다르다. 통합
테스트가 실 계정·감사로그를 건드릴 수 없게 하기 위한 안전장치다.

```bash
# .env에 TEST_DATABASE_URL을 넣는다 (.env.example 참고, DATABASE_URL과
# 데이터베이스 이름이 달라야 한다)
npm run db:test:setup       # gbsw_test 생성 + 마이그레이션 (멱등)
npm run test:integration
```

`npm test`/`npm run verify`에는 포함되지 않는다 — CI는 DB 없이 단위 테스트만
돈다. 각 통합 테스트는 자기가 만든 데이터만 정리하고 끝난다(전역
`deleteMany()` 금지) — `AcademicYear` 부분 유니크 인덱스를 확인하는 테스트만
예외로, 마이그레이션이 심어 두는 시드 행(`2026`, `isCurrent: true`)의 값을
건드렸다가 끝에 원래대로 되돌린다.

## 전체 스택 실행

```bash
docker compose up -d --build
```

`db` → `migrate`(1회성) → `app` 순으로 뜬다. 마이그레이션이 성공해야 앱이 시작된다.
런타임 이미지를 가볍게 유지하려고 Prisma CLI는 `migrate` 서비스(builder 스테이지)에만 들어 있다.

HTTPS는 별도 리버스 프록시에서 처리하고, 운영에서는 `BETTER_AUTH_URL`을 실제 도메인으로 바꾼다.

## 역할

| 역할 | 설명 |
|---|---|
| `ADMIN` | 관리자 = 교직원. 교사와 관리자를 구분하지 않으며 서로 권한이 동등하다. 최초 1개는 부트스트랩 토큰으로 생성하고, 이후에는 관리자가 서로를 초대한다 |
| `STUDENT` | 학생 |
| `PARENT` | 학부모. 학생이 직접 만든 초대코드로 가입한다 |

교사를 별도 역할로 두지 않는 이유: 이 학교 규모에서 교직원 사이에 권한 차등을 둘 실익이 없고,
등급을 나누면 "누가 무엇을 할 수 있는가"가 곧바로 복잡해진다.

## 구조와 규칙

`CLAUDE.md` 참고 — 레이어링 규칙(Route → Service → Repo), 권한 판정 경로,
새 모듈 추가 체크리스트가 정리되어 있다.
