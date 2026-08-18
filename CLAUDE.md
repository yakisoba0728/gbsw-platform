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

### verification 모듈은 감사로그 예외다

`src/modules/verification/`은 쓰기를 하면서 **`recordAudit`을 하나도 남기지 않는다**
(코드 발급·만료·시도 횟수·확인·소진 전부). "모든 생성/수정/삭제는 `recordAudit`을
남긴다"에 대해 `src/modules/` 안에서는 유일한 예외이며(설치용 `scripts/seed-merit-rules.ts`는
행위자가 없는 별개의 예외다), 의도적이다 — 인증코드 행은 도메인 데이터가 아니라
가입 흐름을 통제하는 임시 데이터라, 감사로그에 남기면 "누가 무엇을 했는가"를 읽으려는
기록이 5분짜리 코드의 생명주기 잡음에 묻힌다. `AUDIT_ACTIONS`에 verification 계열
액션이 아예 없는 것이 설계 단계의 같은 판단이다. 발송 사실은 콘솔 로그가 남기고
(`[인증코드] … 발송` / 알리고 경로는 `[SMS] … 발송 접수`, 둘 다 대상을 가리고 코드는
절대 남기지 않는다), 가입이 실제로 이뤄지면 그때 `registration:complete`가 남는다.

**대신 잃는 것:** 발송 남용과 반복 실패 시도가 **감사로그로는 보이지 않는다.**
그 자리를 `verification.service`의 대상별 5회/시간·IP별 20회/시간 제한이 맡는다 —
막는 것이지 남기는 것이 아니므로, "누가 얼마나 시도했나"를 나중에 되짚을 자료는 없다.
그 추적이 필요해지는 날에는 예외를 거두고 감사로그를 넣어야 한다.

**다른 모듈이 이 예외를 따라하면 안 된다.** 업무 데이터를 건드리는 쓰기는 예외 없이
`recordAudit`을 남긴다.

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

`docs/design/2026-08-17-redesign-spec.md`가 기준이다. 원본 시안은
`docs/design/DESIGN-supabase.md` — **흰 캔버스 · 근검정 잉크 · 에메랄드 하나**.
색·크기·모서리는 `src/app/globals.css`의 `@theme`에 토큰으로 있고, 화면 코드는
토큰 이름만 쓴다 (`text-caption`, `rounded-card`, `bg-pri` …).

**에메랄드(`--color-pri` `#3ecf8e`)는 배경 전용이다.** 흰 배경에서 대비가 2:1이라
글자로 쓰면 안 읽힌다 — `text-pri`는 타입 검사도 lint도 잡아 주지 않으므로 스스로
쓰지 않아야 한다. 초록 글자가 필요하면 `text-pri-ink`(5.3:1)를 쓰고, `bg-pri` 위
글자는 흰색이 아니라 `text-on-pri`(근검정)다.

그 밖의 금지 사항: `font-bold`·`font-extrabold`(제목은 `font-semibold`, 나머지는
`font-medium`), `text-[NNpx]` 임의 글자크기, 카드에 `shadow-*`. 페이지 바탕도 흰색
이라 카드는 `border border-line`으로만 보인다 — 테두리를 빼면 카드가 사라진다.

문구 규칙(한 문장 · 완충어 금지 · 용어 고정표)도 같은 문서 §3에 있다.

### 화면을 만들기 전에 있는 것부터 찾는다

같은 모양을 손으로 다시 그리면 규격이 갈라진다. 아래는 이미 있다.

| 필요한 것 | 쓸 것 |
|---|---|
| 제목 달린 카드 | `SectionCard` — 머리글 띠가 필요 없으면 `variant="panel"`, 되돌릴 수 없는 동작이면 `tone="danger"` |
| 제목 앞에 다른 것이 오는 카드 | `cardClass(pad, className)` — 역할 라벨·상태 배지가 `<h2>` 앞에 오면 `SectionCard`로 표현할 수 없다 |
| 표 | `DataTable` — 폰에서 카드로 바뀌어야 하면 `narrow="cards"`. 열마다 `card` 자리를 고른다 |
| 표(직접 조립) | `TableFrame` — 셀 구성이 제각각이라 열을 데이터로 못 쓸 때만 |
| 버튼 모양의 링크 | `buttonClass({ … })` — `<Link>`는 `<button>`이 아니라 `Button`을 못 쓴다 |
| 아이콘만 있는 버튼 | `Button size="icon"` (또는 `buttonClass({ size: "icon" })`) |
| 뒤로 가기 | `BackLink` |
| 방금 발급된 코드·임시 비밀번호 | `SecretPanel` |
| 합계 한 칸 | `StatTile` |
| 결과·오류 배너 | `Note` — `tone="error"`면 `role="alert"`이 자동으로 붙는다 |
| 빈 상태 | `EmptyState` — 이미 카드 안이면 `variant="inside"` |

**카드 안쪽 여백은 세 가지뿐이다.** 표를 담으면 `flush`, 폼·안내는 `panel`(p-5),
페이지 대표 카드는 `page`(p-8). 그 외 값을 새로 만들지 않는다. 카드 껍데기
클래스는 `cardClass()` 하나가 소유하므로 화면 코드에 직접 적지 않는다 —
토큰을 바꿀 때 열여섯 곳을 손으로 찾게 된다.

**폭에 따른 재배치는 `@container`로 한다.** 같은 블록이 전폭에도 서고 대시보드의
절반 폭 카드 안에도 서기 때문에 뷰포트 폭(`lg:`)으로는 옳게 굽지 않는다.
`lg:`는 앱 셸(사이드바↔하단탭)과 표↔카드 전환에만 쓴다.

## 주의점

- **Prisma 7**: 생성자는 `prisma-client`, 출력은 `src/generated/prisma`(gitignore됨),
  접속 URL은 `prisma.config.ts`에 있다. SQL 접속은 드라이버 어댑터(`@prisma/adapter-pg`)로만.
- **Postgres 18**: 볼륨은 `/var/lib/postgresql`에 마운트한다 (`/data` 아님).
- 마이그레이션은 compose의 별도 `migrate` 서비스가 돌린다. 런타임 이미지에는 Prisma CLI가 없다.
- **앱·DB는 `127.0.0.1`에만 묶는다.** 리버스 프록시가 같은 호스트에서 받아 넘긴다.
  0.0.0.0에 열면 세션 쿠키가 평문으로 흐르고 `x-forwarded-for`(감사로그의 접속 IP)를
  누구나 위조할 수 있다. 배포 절차는 `docs/deploy.md`.
- **부분 유니크 인덱스는 마이그레이션 SQL에만 있다.** `AcademicYear_single_current`
  (현재 학년도는 하나뿐)가 그렇다 — Prisma가 표현하지 못해 `schema.prisma`에 선언이 없고,
  그래서 다음 `migrate dev`가 이것을 군더더기로 보고 `DROP INDEX`를 만들 수 있다. 드롭돼도
  오류는 안 난다: 현재 학년도가 둘이 되고 `findCurrent()`(findFirst)가 어느 쪽을 줄지 몰라
  전교 집계 범위가 흔들린다. **마이그레이션을 새로 만들면 생성된 SQL을 눈으로 확인한다.**
- **스키마를 바꿨으면 `next dev`를 반드시 재시작한다** (`.next`도 지우고). 돌던 개발 서버는
  옛 Prisma 클라이언트를 물고 있어서, 새 필드를 쓰는 화면만 `PrismaClientValidationError`로
  조용히 실패한다. 타입 검사·테스트·빌드는 디스크의 새 클라이언트를 보므로 전부 통과한다 —
  화면에서만 터지고, 서버 액션의 catch가 오류를 삼키면 원인이 어디에도 남지 않는다.
- 역할은 `ADMIN / STUDENT / PARENT` 3개. **교사 = 관리자**이며 교직원 사이에 권한 차등이 없다.
  최상위 계정 개념도 없다 — 관리자끼리 서로를 초대한다.
