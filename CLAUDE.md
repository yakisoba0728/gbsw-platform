@AGENTS.md

# gbsw-platform

경북소프트웨어마이스터고등학교 통합관리시스템. 자체 호스팅, 초대 기반 계정, 역할 기반 접근제어.

**현재 상태:** 인증·권한·감사로그·앱 셸에 더해 **학년도·명단·상벌점**까지 있다.
상벌점이 첫 업무 모듈이며, 새 모듈은 `src/modules/merit/`의 구조를 본보기로 삼는다
(repo는 하나, 서비스는 책임별로 나눈다).

## 명령어

```bash
npm run db:up        # Postgres 컨테이너 (호스트 5433)
npm run db:migrate   # prisma migrate dev
npm run dev          # 사용자가 0명이면 최초 관리자 생성 링크가 콘솔에 찍힌다

npm run verify       # typecheck + lint + test — 작업 종료 전 필수
```

## 아키텍처 규칙 (어기지 말 것)

```
Route / Server Action  →  Service  →  Repo
  requireAuth()            can()        Prisma 호출만
  zod .safeParse()         업무 로직
  (얇게)                    recordAudit()
```

- **라우트·페이지·서버액션에 업무 로직이나 Prisma 호출을 두지 않는다.**
- **zod 검증은 경계에서 한 번만.** 서비스는 타입이 맞는 입력을 신뢰한다.
- **`can()`은 서비스 안에서도 호출한다.** 페이지에서 이미 막았어도 다시 검사한다 (defense-in-depth).
- **모든 생성/수정/삭제는 `recordAudit`을 남긴다.**
- 권한 판정 경로는 `core/authz/can.ts` 하나뿐. Better Auth admin 플러그인의 접근제어
  (`core/auth/permissions.ts`)는 **계정 관리 API 전용**이며 업무 권한과 섞지 않는다.
- 역할 검사만으로 부족한 경우(본인 소유 데이터 등)는 서비스에서 **소유권 검사**를 추가한다.
  세션에서 유도할 수 있는 식별자는 절대 클라이언트 입력으로 받지 않는다.
  (예: `getMyAwards(sessionUser)`는 `studentId`를 인자로 받지 않는다.)

## 오류 규약

두 갈래를 의도적으로 유지한다 — 통일 비용이 통일 이득보다 커서, 대신 경계를 여기 명확히 적는다.

- **로그인 이전 화면**(가입·부트스트랩 — `RegistrationError`, `VerificationError`)은
  **한글 문구 자체**를 `message`에 담고 액션이 그대로 화면에 보여준다. 이 경로는 애초에
  "무엇이 틀렸는지 알려주지 않는" 게 설계 목표(코드 대조 실패 사유를 숨긴다)라 코드→문구
  매핑 계층을 추가로 두는 이득이 없다.
- **그 밖의 모든 서비스**(`InviteError`·`RosterError`·`AdminUserError`·`AcademicYearError`·
  `EnrollmentError`·`ForbiddenError` 등)는 **코드**를 `message`에 담고, 화면 문구로 옮기는
  일은 액션(`app/**/actions.ts`)의 `MESSAGES` 사전이 담당한다. 새 모듈은 이쪽을 기본으로
  따른다.
- 권한 거부는 `core/authz/errors.ts`의 `assertCan(actor, action)`을 쓴다 — `can()` 검사와
  `ForbiddenError` throw, 거부 감사로그(`authz:denied`) 기록을 한 번에 한다. `can()`만으로
  못 가르는 거부(소유권 검사 등)는 `ForbiddenError`를 직접 던지고 같은 방식으로 감사로그를
  남긴다 (`invite.service.ts`의 `revokeInvite` 참고).

## 아키텍처 결정: 단일 Next.js (Nest 분리 안 함)

프론트/백을 Next + NestJS로 쪼개는 안을 검토했고 **하지 않기로 했다.** 전교 200~300명
규모에 웹 클라이언트 하나뿐이라 분리의 이득(독립 배포·팀 분담·다중 클라이언트)이 나오지
않는 반면, 교차 출처 세션 쿠키·페이지마다 HTTP 왕복·DTO 이중 관리 비용은 그대로 발생한다.

**단, 위의 3계층 규칙을 지키는 것이 곧 이 결정을 되돌릴 수 있게 유지하는 일이다.**
업무 로직이 `service.ts`에만 있으면 진입점(서버 액션 → 컨트롤러)만 갈아끼워 옮길 수 있다.
페이지에서 Prisma를 직접 부르기 시작하면 그 순간부터 분리는 재작성이 된다.

다시 검토할 만한 계기: 모바일 앱 등 외부 클라이언트가 생길 때, 프론트·백 인원이 나뉠 때.

## 폴더 구조

```
src/
  core/                 횡단 인프라 — 도메인 로직 없음
    db/client.ts        Prisma 싱글턴 (드라이버 어댑터)
    auth/               auth.ts / auth-client.ts / session.ts / permissions.ts
    authz/              roles.ts / can.ts
    audit/audit.ts      recordAudit()
  modules/<모듈>/        <모듈>.schema.ts · <모듈>.repo.ts · <모듈>.service.ts
    merit/               첫 업무 모듈. repo·schema·error는 하나, 서비스는 책임별로
                          나눈다(rule.service.ts · award.service.ts ·
                          stats.service.ts) — 화면도 같은 경계를 따른다
                          (app/(app)/admin/merit/rules · app/(app)/merit ·
                          app/(app)/merit/stats).
  app/
    (auth)/             비로그인 — login
    (app)/              로그인 필수 — layout.tsx가 세션 가드 + mustChangePassword 가로채기
    api/auth/[...all]/  Better Auth 핸들러
    api/health/         컨테이너 헬스체크
  components/           ui/ (Button·Badge·Input) · app-shell/ · icons.tsx
tests/                  core/ · modules/ — 구조를 src/와 맞춘다
```

`src/modules/account/`가 **모듈 템플릿**이다. 새 모듈은 이 구조를 복사한다.

### bootstrap 모듈은 예외다

`src/modules/bootstrap/`은 프로젝트에서 유일하게 **`can()` 없이 쓰기를 수행**한다.
로그인 개념이 없는 시점(사용자 0명)이라 역할 기반 권한이 성립하지 않기 때문이며,
그 자리를 "서버 콘솔에만 출력되는 1회성 토큰 + 사용자 수 0명" 이중 게이트가 대신한다.
**다른 모듈이 이 예외를 따라하면 안 된다.** 설계 근거는
`docs/superpowers/specs/2026-08-12-bootstrap-admin-design.md`에 있다.

## 새 모듈 추가 체크리스트

1. `prisma/schema.prisma`에 모델 추가 → `npm run db:migrate`
2. `core/authz/can.ts`의 `Action`과 `RULES`에 액션 등록
3. `tests/core/authz/can.test.ts`의 `EXPECTED`에 기대값 추가 (빠뜨리면 테스트가 깨진다)
4. `modules/<모듈>/{schema,repo,service}.ts` 작성
5. `tests/modules/<모듈>/<모듈>.service.test.ts` — 권한 거부/허용 + 감사로그 검증 (repo·audit은 목)
6. `app/(app)/<모듈>/` 페이지 + 얇은 서버 액션
7. `components/app-shell/nav.ts`의 `NAV_ITEMS`에 메뉴 한 줄 추가
8. `npm run verify` 통과

## 디자인

`~/Downloads/UI 디자인 재개발/`의 Claude Design 시안이 기준. 색·간격·컴포넌트 규격은
`GBSW 통합관리시스템.dc.html`을 따른다. 시안의 CSS 변수는 `src/app/globals.css`의
`@theme`에 같은 이름으로 옮겨져 있다 (`--color-pri`, `--color-ink` …).

시안은 인라인 style이라 hover·반응형을 표현하지 못한다 (`style-hover`는 디자인 툴 전용
속성, `@media`는 0개). 이식할 때 hover는 `hover:`, PC/모바일 전환은 `lg:` 브레이크포인트로
바꾼다 — 시안의 `device`/`isMobile` prop 토글을 JS로 재현하지 말 것 (SSR 불일치 발생).

## 주의점

- **Prisma 7**: 생성자는 `prisma-client`, 출력은 `src/generated/prisma`(gitignore됨),
  접속 URL은 `prisma.config.ts`에 있다. SQL 접속은 드라이버 어댑터(`@prisma/adapter-pg`)로만.
- **Postgres 18**: 볼륨은 `/var/lib/postgresql`에 마운트한다 (`/data` 아님).
- 마이그레이션은 compose의 별도 `migrate` 서비스가 돌린다. 런타임 이미지에는 Prisma CLI가 없다.
- **스키마를 바꿨으면 `next dev`를 반드시 재시작한다** (`.next`도 지우고). 돌던 개발 서버는
  옛 Prisma 클라이언트를 물고 있어서, 새 필드를 쓰는 화면만 `PrismaClientValidationError`로
  조용히 실패한다. 타입 검사·테스트·빌드는 디스크의 새 클라이언트를 보므로 전부 통과한다 —
  화면에서만 터지고, 서버 액션의 catch가 오류를 삼키면 원인이 어디에도 남지 않는다.
- 역할은 `ADMIN / STUDENT / PARENT` 3개. **교사 = 관리자**이며 교직원 사이에 권한 차등이 없다.
  최상위 계정 개념도 없다 — 관리자끼리 서로를 초대한다.
