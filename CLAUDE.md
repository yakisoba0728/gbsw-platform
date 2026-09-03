@AGENTS.md

# gbsw-platform

경북소프트웨어마이스터고등학교 통합관리시스템. 자체 호스팅, 초대 기반 계정, 역할 기반 접근제어.

**현재 상태:** 인증·권한·감사로그·앱 셸에 더해 **학년도·명단·상벌점·전자출입증·커뮤니티**까지 있다.
상벌점이 첫 업무 모듈이고, 전자출입증이 둘째, 커뮤니티가 셋째다. 새 모듈의 본보기는 둘로 나뉜다 — **파일
구성과 계층 경계는 `src/modules/account/`**(schema·repo·service 셋), **권한·오류 코드·
서비스 분할까지 갖춘 업무 모듈의 모습은 `src/modules/merit/`**(repo는 하나, 서비스는
책임별로 나눈다). 자세한 것은 아래 「폴더 구조」에 적었다.

## 명령어

```bash
npm run db:up        # Postgres 컨테이너 (호스트 5433)
npm run db:migrate   # prisma migrate dev
npm run dev          # 사용자가 0명이면 최초 관리자 생성 링크가 콘솔에 찍힌다

npm run verify:unit  # typecheck + lint + 단위 테스트. DB가 필요 없어 개발 중 상시로 돌린다
npm run verify       # verify:unit + 통합 테스트(DB 필요) + build — 작업 종료 조건
```

`verify`는 `verify:unit` → `db:test:setup` → `test:integration` → `build` 순이다.
통합 테스트는 `TEST_DATABASE_URL`의 별도 DB를 쓰므로 Postgres가 떠 있어야 한다.

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
- **커뮤니티의 게시판별 읽기·쓰기만 이 규칙 밖이다.** 게시판마다 다르고 교사가 화면에서
  바꾸는 값이라 컴파일 시점 표에 담기지 않는다 — 판정은 `modules/community/community.access.ts`
  의 순수 함수 둘이 하고, 게시판을 다루는 권한(`community:manage`·`community:moderate`)만
  `can()`에 있다. 거부는 `denyAccess()`로 감사 기록 후 `ForbiddenError`를 던진다.
  **다른 모듈이 이것을 따라하면 안 된다** — 역할로 가를 수 있는 권한은 `can()`에 넣는다.
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
  못 가르는 거부(소유권 검사 등)는 `denyAccess(actor, action, details)`를 쓴다.

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
    pass/                전자출입증(외출·외박). merit과 같은 모양이되 순수 함수 조각이
                          더 있다 — pass.token.ts(학생증 코드. HMAC 하나, 시계를 모른다)·
                          pass.qr.ts(uqr → SVG path, 서버 전용)·pass.url.ts·
                          pass.window.ts(유형별 유효 창). 서비스는 request·decision·
                          verify 셋이다.
    community/           게시판·글·댓글·첨부. merit과 같은 모양이되 순수 조각이 더
                          있다 — community.access.ts(역할 판정. DB를 모른다)·
                          community.view.ts(**익명을 가리는 유일한 자리**)·
                          community.storage.ts(디스크. DB를 모른다)·
                          community.exif.ts(바이트→바이트. 사진의 촬영 위치·기기를
                          벗긴다). 서비스는 board·post·comment·attachment 넷이다.
                          **첨부 업로드는 서버 액션이 아니라 라우트 핸들러다** —
                          bodySizeLimit이 액션 전체에 걸려서다.
    verification/        가입 인증코드. 감사로그 예외다(아래 참조). 순수 조각이 하나
                          있다 — verification.code-hash.ts(BETTER_AUTH_SECRET에서
                          HKDF로 키를 파생해 코드를 HMAC으로 묶는다. DB도 시계도
                          모른다).
  app/
    (auth)/             비로그인 — login
    (app)/              로그인 필수 — layout.tsx가 세션 가드 + mustChangePassword 가로채기
    scan/               **앱 셸 밖**의 출입증 판독 화면. (app)의 layout이 자기 경로를
                          몰라 로그인 후 돌아올 주소를 못 들고 가서 여기 둔다.
    api/auth/[...all]/  Better Auth 핸들러
    api/health/         컨테이너 헬스체크
  components/           ui/ (Button·Badge·Input) · app-shell/ · icons.tsx
tests/
  core/ · modules/      구조를 src/와 맞춘다
  helpers/              공용 테스트 픽스처 — src/에 짝이 없는 예외
```

**파일 구성은 `src/modules/account/`를 복사한다** — `<모듈>.schema.ts` ·
`<모듈>.repo.ts` · `<모듈>.service.ts` 셋뿐인 가장 작은 형태라 계층 경계가 그대로 보인다.

**업무 모듈의 완성형은 `src/modules/merit/`다** — 권한 액션·오류 코드(`merit.error.ts`)·
책임별 서비스 분할까지 갖춘 모습이 필요하면 이쪽을 본다. 둘은 대립하지 않는다:
account에서 시작해 모듈이 커지면 merit의 모양으로 간다.

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
액션이 아예 없는 것이 설계 단계의 같은 판단이다. 앱 시작 로그는 현재 발송 경로를,
알리고 성공 로그는 가린 번호와 접수 결과를 남긴다. 코드는 로그에 남기지 않으며,
가입이 실제로 이뤄지면 그때 `registration:complete`가 남는다.

**대신 잃는 것:** 발송 남용과 반복 실패 시도가 **감사로그로는 보이지 않는다.**
그 자리를 `verification.service`의 대상별 5회/시간·IP별 60회/시간 제한이 맡는다 —
막는 것이지 남기는 것이 아니므로, "누가 얼마나 시도했나"를 나중에 되짚을 자료는 없다.
그 추적이 필요해지는 날에는 예외를 거두고 감사로그를 넣어야 한다.

**다른 모듈이 이 예외를 따라하면 안 된다.** 업무 데이터를 건드리는 쓰기는 예외 없이
`recordAudit`을 남긴다.

### 가입 인증은 실제 발송과 코드 확인을 거친다

`requestVerification`은 초대코드를 확인한 뒤 `requestCode`로 이메일 또는 휴대폰에
6자리 코드를 보낸다. 화면에서 코드를 확인해야 `verifiedAt`이 기록되고, 가입 완료는
이메일·휴대폰 proof 두 개를 같은 트랜잭션에서 한 번만 소진한다. 따라서
`registration.repo`의 `emailVerified: true`는 실제 소유 확인을 전제로 한다.

운영 이메일은 SMTP(`SMTP_*`), 문자는 알리고(`SMS_*`)를 쓴다. 해당 채널의 설정이
없거나 발송이 실패하면 확인 요청도 실패하고, 생성했던 코드 행은 지워져 발송 실패가
횟수 제한을 소모하지 않는다. `SMS_TEST_MODE=true`는 실제 문자를 보내지 않으므로
운영에서는 비워 둔다. 개발에서 외부 발송 없이 가입 흐름을 시험할 때만
`VERIFICATION_MOCK=true`를 사용하며, production에서는 이 값이 강제로 무시된다.

## 새 모듈 추가 체크리스트

1. `prisma/schema.prisma`에 모델 추가 → `npm run db:migrate`
2. `core/authz/can.ts`의 `Action`과 `RULES`에 액션 등록
3. `tests/core/authz/can.test.ts`의 `EXPECTED`에 기대값 추가 (빠뜨리면 테스트가 깨진다)
4. `modules/<모듈>/{schema,repo,service}.ts` 작성
5. `tests/modules/<모듈>/<모듈>.service.test.ts` — 권한 거부/허용 + 감사로그 검증 (repo·audit은 목)
6. `app/(app)/<모듈>/` 페이지 + 얇은 서버 액션
7. `components/app-shell/nav.ts`의 `NAV_ITEMS`에 메뉴 한 줄 추가
8. `npm run verify:unit`으로 빠르게 돌려 보고, **종료 조건은 `npm run verify` 통과**
   (통합 테스트와 `build`까지 포함한다)

## 디자인

`docs/design/2026-08-17-redesign-spec.md`(색·크기·굵기)와
`docs/design/2026-08-30-ui-refresh.md`(화면 짜는 법 — 상자를 몇 겹 쌓나,
세그먼티드와 칩을 어떻게 가르나)가 함께 기준이다. 원본 시안은
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

**화면이 사람에게 말을 걸지 않는다.** 시각대별 인사말·「~해 보세요」·「팁」·
도움말 말풍선 같은 것을 새로 만들지 않는다 — 설명이 필요한 화면은 문구가
아니라 배치를 고친다. 대시보드가 답할 것은 몇 시인지가 아니라 무엇이 남았는지다.

### 화면을 만들기 전에 있는 것부터 찾는다

같은 모양을 손으로 다시 그리면 규격이 갈라진다. 아래는 이미 있다.

| 필요한 것 | 쓸 것 |
|---|---|
| 페이지 제목·설명·동작 | `PageHeader` — **카드가 아니다.** 바탕 위에 앉는다. 제목을 카드에 담으면 그 아래 내용 카드와 무게가 같아진다 |
| 제목 달린 카드 | `SectionCard` — 머리글 띠가 필요 없으면 `variant="panel"`, 되돌릴 수 없는 동작이면 `tone="danger"` |
| 제목 앞에 다른 것이 오는 카드 | `cardClass(pad, className)` — 역할 라벨·상태 배지가 `<h2>` 앞에 오면 `SectionCard`로 표현할 수 없다 |
| 표 | `DataTable` — 폰에서 카드로 바뀌어야 하면 `narrow="cards"`. 열마다 `card` 자리를 고른다 |
| 표(직접 조립) | `TableFrame` — 셀 구성이 제각각이라 열을 데이터로 못 쓸 때만 |
| 버튼 모양의 링크 | `buttonClass({ … })` — `<Link>`는 `<button>`이 아니라 `Button`을 못 쓴다 |
| 아이콘만 있는 버튼 | `Button size="icon"` (또는 `buttonClass({ size: "icon" })`) |
| 뒤로 가기 | `BackLink` |
| 방금 발급된 코드·임시 비밀번호 | `SecretPanel` |
| 합계 한 칸 | `StatTile` — 여럿이면 `StatStrip`으로 묶는다(테두리는 하나, 칸 사이는 머리카락 선) |
| 보는 방식을 바꾸는 탭 | `Segmented` + `SegmentLink`/`SegmentButton` — 늘 하나가 켜져 있고 끌 수 없는 것. 끄면 넓어지는 **필터는 칩**(`ChipLink`)이고 둘은 일부러 다르게 생겼다. 항목이 열을 넘으면 `Select` |
| 대시보드의 짧은 목록 | `SummaryList` + `SummaryRow` — 표를 좁은 칸에 넣으면 한 건이 세 줄이 된다 |
| 결과·오류 배너 | `Note` — `tone="error"`면 `role="alert"`이 자동으로 붙는다 |
| 빈 상태 | `EmptyState` — 이미 카드 안이면 `variant="inside"`. 거기서 할 수 있는 일이 있으면 `action`으로 버튼을 함께 준다 |

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
- **QR은 출입증이 아니라 학생증이다.** 코드가 붙는 곳은 학생 프로필이고(출입증 한
  건이 아니다), **20초마다 갈린다.** 둘을 함께 두는 이유가 있다 — 프로필에 붙이므로
  승인된 것이 없어도 학생증은 있고 정문에서 찍으면 그 자리에서 「이 학생이 지금 나가도
  되는가」가 판정되며, 20초마다 갈리므로 찍어 둔 사진이 다음 창에서 못 쓴다.
- **학생증 QR은 `BETTER_AUTH_URL`을 가리킨다.** 앱은 `127.0.0.1`에만 묶여 공개 주소를
  요청 헤더로 알 수 없다. 서명 키도 `BETTER_AUTH_SECRET`에서 HKDF로 파생하므로, 그 값을
  바꾸면 **그 순간 살아 있던 QR이 전부 무효가 된다** (학생이 화면을 새로 고치면 된다).
  **가입 인증코드도 같은 비밀에서 키를 파생한다**(`verification.code-hash.ts`, info는
  다르다) — 회전하면 발송된 인증번호도 함께 무효가 된다. 수명이 5분이라 다시 요청하면
  된다. 6자리는 후보가 10^6뿐이라 비밀키 없는 해시로 저장하면 DB 한 줄이 곧 코드다.
- **완전 삭제는 삭제 표시된 계정만 지운다.** `deletedAt`이 없는 계정은 서비스와
  repo 양쪽에서 거절한다 — `User` 삭제는 `StudentProfile`을 타고 학적·상벌점·출입증·
  보호자 연결까지 Cascade로 지운다. 명단에서 빠뜨리는 것(soft delete)이 먼저다.
- **출입증 자격은 진입점마다 같아야 한다.** 판정 술어(학생·활성·미삭제·현재 학년도
  ENROLLED)는 `pass.repo.ts`의 `ELIGIBLE_USER`와 `enrolledIn()` 두 조각에만 적는다.
  쓰기 경로는 `lockEligibleStudentForPassCreation`(잠근다), 학생증처럼 쓰기가 없는
  경로는 `isEligibleStudent`를 쓴다. **새 진입점에서 조건을 손으로 다시 적지 않는다** —
  학생 신청 경로만 느슨했던 것이 실제 결함이었다.
- **판독(`/scan`)은 메뉴에 없다.** 출입증 화면의 「스캔」 버튼으로 들어간다. 앱 셸 밖에
  사는 화면이며 제목은 `src/app/scan/page.tsx`의 메타데이터와 `<h1>`이 소유한다.
- **부분 유니크 인덱스는 마이그레이션 SQL에만 있다.** `AcademicYear_single_current`는
  Prisma가 표현하지 못하며, Prisma 7.9.1의 `migrate diff`가 드리프트로 보지 않는 것을
  빈 마이그레이션으로 확인했다. **Prisma 메이저 업그레이드 때 다시 확인한다.**
- **스키마를 바꿨으면 `next dev`를 반드시 재시작한다** (`.next`도 지우고). 돌던 개발 서버는
  옛 Prisma 클라이언트를 물고 있어서, 새 필드를 쓰는 화면만 `PrismaClientValidationError`로
  조용히 실패한다. 타입 검사·테스트·빌드는 디스크의 새 클라이언트를 보므로 전부 통과한다 —
  화면에서만 터지고, 서버 액션의 catch가 오류를 삼키면 원인이 어디에도 남지 않는다.
- **익명 게시판은 화면까지만 익명이다.** 쓰기가 `recordAudit`을 남기므로, 교사가
  감사로그를 시각으로 대조하면 작성자를 알아낼 수 있다. 감수하고 택한 것이며
  (욕설·협박 글의 추적 수단이 그것뿐이다) 글쓰기 화면이 학생에게 그 사실을 알린다.
  화면·API 어디서도 작성자가 안 나오게 하는 일은 `community.view.ts` 한 곳이 맡는다 —
  **repo 행을 화면으로 직접 넘기지 않는다.**
- **사진의 EXIF는 게시판을 가리지 않고 벗긴다** (`community.exif.ts`). 익명 게시판만
  벗기면 우회로가 남아서다 — 첨부는 글보다 먼저 올라가고 새 글의 `attachToPost`는
  올린 사람과 `postId: null`만 보므로, 실명 게시판에 올려 그 id를 익명 글에 실으면
  그만이다. 글 수정에서는 본인의 미결 첨부와 이미 같은 글에 붙은 첨부만 센다.
  재인코딩이 아니라 세그먼트를 도려내므로 값은 버퍼 한 벌 복사이고, 벗길 것이 없으면
  원본 참조가 그대로 돌아온다. **벗기기에 실패하면 업로드를 거절한다** — 조용히 원본을
  저장하면 첨부가 「벗겨졌거나 아닐 수도 있는 것」이 되어 검사가 무의미해진다.
- **커뮤니티 글 본문은 마크다운이다** (`components/ui/markdown.tsx`). 살균이 두
  겹이다 — **`rehype-raw`를 쓰지 않아 날 HTML을 아예 파싱하지 않고**(통과시킬
  HTML 자체가 없다), 그 위에 `rehype-sanitize` 허용 목록이 있다. `img`·`input`·
  프레임 계열은 목록에서 뺐고 주소는 `http`·`https`·`mailto`만 남는다.
  **`rehype-raw`를 켜자는 말이 나오면 그 순간 이 모듈에서 가장 위험한 코드가 된다.**
  댓글은 평문이고 주소만 링크가 된다 (`components/ui/plain-text.tsx`).
- **첨부 응답의 CSP는 `next.config.ts`가 소유한다.** 라우트 핸들러가 응답에 직접
  건 CSP는 전역 `headers()`에 덮인다 — 첨부 전용 규칙을 전역 규칙 **뒤에** 두어야
  선다. PDF는 그 엄격한 CSP 아래에서도 브라우저 내장 뷰어로 열린다(확인함).
  한글(hwp·hwpx)은 쓸 만한 웹 뷰어가 없어 내려받기로 둔다.
  **첨부는 파일당 20MB다** — 올리면 프록시 본문 상한(`docs/deploy.md`)과 앱
  컨테이너의 `mem_limit`이 함께 움직인다.
- **첨부는 `gbsw-uploads` 볼륨에 있고 DB 덤프에 안 들어간다.** 백업을 따로 뜬다
  (`docs/deploy.md`). 디스크의 파일 이름은 랜덤 32자이고 올린 사람이 붙인 이름은
  DB에만 있다 — 경로 탈출과 확장자 위조를 검사로 막는 대신 그 값이 파일 이름에
  닿을 길을 없앴다. nginx 뒤에 두면 `client_max_body_size`를 올려야 한다.
- 역할은 `ADMIN / STUDENT / PARENT` 3개. **코드 상수는 `ADMIN`이지만 화면에서는 「교사」**다
  (`ROLE_LABELS`) — 학교에서 그 자리는 교사이고 「관리자」는 시스템 운영자로 읽힌다.
  교직원 사이에 권한 차등이 없고 최상위 계정 개념도 없다 — 교사끼리 서로를 초대한다.
- **이름은 역할에 따라 호칭을 붙여 쓴다** — `honorificName(name, role)` 하나가 정한다.
  교사는 `이정민 선생님`, 학부모는 `김보호 학부모님`, 학생은 `김민준님`(「님」은 의존명사라
  붙여 쓴다). 역할을 모르면 「님」으로 떨어진다. 이름을 맨으로 그리는 화면을 새로 만들지 않는다.
