# 세로 조각 통독 감사 — 확정분 수정 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [`docs/reviews/2026-09-01-vertical-full-read.md`](../../reviews/2026-09-01-vertical-full-read.md)가 확정한 **높음 1건 + 중간 48건**을 고친다. 낮음 353건은 이번 배치에서 하지 않는다.

**기준선:** `main @ fef594d` (감사 문서가 커밋된 시점). 감사 자체의 기준선은 `2c32b44`이고 그 뒤 코드는 안 바뀌었다.

**Spec:** 없다. 이 배치는 새 기능이 아니라 **감사 문서가 자리와 고칠 방향까지 적어 둔 결함**을 처리하는 일이다.

---

## 0. 먼저 읽을 것

**항목마다의 전체 근거는 감사 문서에 있다.** 이 계획은 목록과 순서만 담는다.

- **높음 1건** — 감사 문서 §3
- **중간 48건** — 감사 문서 §4. 항목마다 **위치 · 현재 코드 인용 · 어떤 입력에서 무엇이 어떻게 잘못되는가 · 고치기**가 적혀 있다.
- 항목 하나를 열려면 문서에서 그 **id**(예: `merit-5-R01`)를 찾는다.

문서를 안 읽고 이 계획의 한 줄 제목만 보고 고치지 않는다 — 제목은 증상이고, 고칠 자리와 이유는 문서에 있다.

## 1. 사람이 이미 정한 것 — 그대로 따른다

감사 뒤 사용자가 네 가지를 정했다. **다시 묻지 않는다.**

### 결정 1 · 학부모 초대코드 (`auth-1-R03`)

세 가지를 함께 바꾼다.

1. **한도를 3에서 2로 내린다** — `src/modules/invites/invite.service.ts:20`의 `MAX_ACTIVE_PARENT_INVITES`. 학부모가 둘이라 2가 맞는 값이다. 화면 문구 두 곳(`admin/invites/actions.ts:35` · `parent-invite/actions.ts:21`)은 이 상수를 문자열에 끼워 쓰므로 자동으로 따라온다 — 눈으로 확인만 한다.
2. **교사가 발급한 코드도 학생 화면에 보이게 한다** — `invite.repo.ts:64`의 `listByStudent`에서 `createdById` 조건을 뺀다. 한도를 세는 `countActiveByStudent`는 이미 발급자를 안 가리므로, 이 변경으로 **세는 모수와 보여 주는 모수가 같아진다**(그것이 이 결함의 뿌리다).
3. **학생이 그 코드를 폐기할 수 있게 한다** — `invite.service.ts:238-240`의 소유권 판정은 지금 세 조건의 곱이다:

   ```ts
   invite.role === "PARENT" &&
   invite.studentId === profile.id &&
   invite.createdById === actor.id;   // ← 이 줄을 뺀다
   ```

   앞의 둘이 이미 「내 학부모 코드인가」를 말하므로 **셋째 줄만 빼면 된다.** 이것을 안 하면 목록에 코드가 보여도 「하나를 폐기하고 만드세요」를 따를 수 없다. **거부 경로의 `authz:denied` 감사로그(242행 이하)는 그대로 둔다.**

교사 초대코드(`role: "ADMIN"`)의 폐기 규칙은 건드리지 않는다.

### 결정 2 · 명단 확정 결과 숫자 (`roster-2-R01`)

지금 「N건 반영했습니다」의 N은 **안 바뀐 학생을 전부 세고 신규 학생을 하나도 안 센다.**

- `roster.service.ts:413`의 `saved`를 **실제로 달라진 줄**(reassign + statusChange + newAssignment)로 좁힌다 — `untouched`를 뺀다.
- **발급된 초대코드 수를 별도 필드로** 함께 돌려준다.
- 화면(`admin/students/import/import-form.tsx:424`)을 「N건 반영, 초대코드 M장 발급」으로 나눈다. 기존 「N명 명단에서 뺐습니다」 갈래는 그대로 둔다.
- `admin/students/import/action-state.ts:32`의 주석(「반영 건수(saved) 중 계정째 삭제된 학생 수」)도 고친다 — `missingFromFile`은 `untouched`에서 제외되므로 `deleted`는 `saved`의 부분집합이 **아니다**.

### 결정 3 · 고아 첨부 청소 (`community-1-R01`)

**감사로그 예외로 문서화하지 않고, 규약대로 기록을 남긴다.**

- `attachment.service.ts`의 `sweepMyOrphans`가 지운 것에 `community:attachment:delete`를 남긴다. 액션 문자열과 라벨은 이미 있다(`audit-log.labels.ts:71,126,176` — `post.service.ts:336`이 쓰고 있다). **새 액션을 만들지 않는다.**
- **청소 실패를 삼키는 성질은 유지한다** — `recordAudit`도 같은 `try` 안에 둔다. 청소가 업로드를 막으면 안 된다.
- **같은 파일 148줄의 보상 삭제도 기록한다.** 등록 감사로그는 트랜잭션 안(121행)에서 먼저 남고 디스크 쓰기는 그 밖(144행)에서 일어난다 — 쓰기가 실패하면 행은 148행에서 지워지는데 **「첨부 등록」 기록만 남아 존재한 적 없는 파일을 가리킨다.** 그 자리를 닫는다.
- **주석을 사실에 맞게 고친다.** `sweepMyOrphans`의 머리말이 「남의 행은 건드리지 않는다」라고 적지만, `community.repo.ts:401`의 `OR: [{ uploaderUserId }, { uploaderUserId: null }]`가 **계정이 완전히 삭제된 사람의 파일도 함께 걷는다.**

### 결정 4 · 범위

- **한다:** 높음 1 + 중간 48.
- **안 한다:** 낮음 353건. 감사 문서 §5에 목록으로 남는다.
- **손대지 않는다:** 감사 문서 **§6.1의 보류 5건.** 지난 감사에서 「고치지 않기로」 정해진 것들이라 이번 배치가 건드리면 결정을 뒤집는 것이 된다. `auth-1-C03`(로그인 게이트의 `deletedAt`)이 중간 심각도로 올라왔지만 여기 속하므로 **§4에 없다.**

---

## 2. Global Constraints

이 절은 **모든 태스크의 요구사항에 암묵적으로 포함된다.**

- **계층 경계.** 라우트·페이지·서버액션에 업무 로직이나 Prisma 호출을 두지 않는다. zod 검증은 경계에서 한 번만.
- **권한.** `can()`으로 가를 수 있는 거부는 `assertCan(actor, action)`, 그 밖(소유권)은 `ForbiddenError`를 직접 던지고 `authz:denied` 감사로그를 남긴다. **결정 1의 폐기 권한 확대가 여기 걸린다** — 소유권 판정을 넓히되 거부 경로의 감사로그는 그대로 남긴다.
- **감사로그.** 모든 생성/수정/삭제는 `recordAudit`. 예외는 셋뿐(`bootstrap`·`verification`·`scripts/seed-merit-rules.ts`). 업무 쓰기와 **같은 트랜잭션 클라이언트(`tx`)**를 넘긴다.
- **오류 규약.** 서비스는 **코드**를 `message`에 담고 화면 문구는 `app/**/actions.ts`의 `MESSAGES` 사전이 옮긴다. 로그인 이전 화면(`RegistrationError`·`VerificationError`)만 한글 문구를 직접 담는다.
- **디자인 토큰만 쓴다.** 금지: `text-pri`(대비 2:1 — 초록 글자는 `text-pri-ink`), `font-bold`/`font-extrabold`, `text-[NNpx]`, 카드에 `shadow-*`. 카드 여백은 `flush`/`panel`/`page` 셋뿐이고 `cardClass()`가 소유한다.
- **이름은 늘 `honorificName(name, role)`.** 맨이름을 그리지 않는다.
- **커밋.** 태스크마다 하나. Conventional Commits + 한글 제목. **Claude/AI 귀속 트레일러를 넣지 않는다.**
- **개발 중** `npm run verify:unit`(DB 불필요)을 상시로 돌린다. 단위 하나만: `npx vitest run --project unit <경로>`.
- **종료 조건은 `npm run verify`** — 통합 테스트와 `build`까지 포함하고 Postgres가 떠 있어야 한다(`npm run db:up`).

## 3. 함정

- **테스트를 조였는데 실패하면 그것은 진짜 결함이다.** 이 배치의 49건 중 **23건이 「통과할 수밖에 없는 단언」**이고, 감사 때 여럿이 「소스에 변이를 넣어도 2,281건이 전부 통과한다」로 확인됐다. 조인 단언이 **현재 코드에서 빨간불이 나면 단언을 약하게 만들지 말고 멈추고 보고한다** — 감사가 못 본 결함을 그 테스트가 찾은 것이다.
- **스키마는 안 바뀐다.** 49건 중 `prisma/`를 건드리는 것은 하나도 없다. 마이그레이션을 만들 일이 없다 — 만들게 됐다면 범위를 벗어난 것이다.
- **감사로그 액션을 새로 만들지 않는다.** 만들게 되면 `AUDIT_ACTIONS`·라벨 표·`tests/modules/audit-log/audit-log.labels.test.ts:67`의 하한(현재 39, 실제 42)을 함께 손봐야 한다. 이번 배치에 필요한 액션은 전부 이미 있다.
- **`auth-1-R02`는 테스트 기대값을 뒤집는다.** `SAFE_ENDPOINTS.POST`에서 `sign-in/email`을 빼면 `tests/app/api/auth/route.test.ts:28`이 그 항목이 허용됨을 단언하고 있으므로 함께 뒤집는다. 앱 안의 로그인 경로 셋은 이 라우트를 지나지 않는다(감사 문서 §4 참조).
- **`community-1-C03`은 `next/link`를 `<a href>`로 바꾸는 일이다.** 형제 분기(PDF)가 이미 그렇게 돼 있으니 그 모양에 맞춘다. `download` 속성은 필요 없다 — `Content-Disposition`이 이미 정한다.
- **한 태스크가 여러 조각의 id를 담을 수 있다.** id의 접두사(`merit-5` 등)는 감사 때 나눈 읽기 조각이지 코드 경계가 아니다.

---

## 4. 태스크

각 태스크가 커밋 하나다. 순서는 **독립적이고 위험이 큰 것부터**다 — 배포 설정이 첫째이고, 화면 조립이 마지막이다. 태스크 사이에 의존은 없으므로 순서를 바꿔도 되지만, 바꾸면 커밋 단위는 유지한다.

**`Files`는 결함이 앉은 자리이지 고침이 닿는 파일 전부가 아니다.** 예를 들어 `merit-1-C01`은 `class-roster.tsx`에 앵커돼 있지만 실제 수정은 `components/merit/award-confirm-dialog.tsx`의 버튼 `type`이다. 감사 문서의 **고치기** 문단이 어디를 건드릴지 말해 준다.

### Task 1: 배포·설정 (1건)

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**운영 코드·설정 (1)**

- [ ] **infra-R01** — compose가 DATABASE_URL을 퍼센트 인코딩 없이 조립해, 문서가 시키는 대로 만든 비밀번호에 `/`가 들어가면 migrate·app이 통째로 뜨지 않는다
      `docker-compose.yml:51` · `.env.example:8`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 2: 시연 시드 스크립트 (1건)

**Files:**
- Modify: `scripts/seed-demo.ts`

**운영 코드·설정 (1)**

- [ ] **data-R01** — seed-demo의 --clean이 Invite.createdById로 달린 초대를 안 지워 시연 교사가 초대코드를 발급했으면 정리가 외래키 위반으로 죽는다
      `scripts/seed-demo.ts:133`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 3: 로그인·가입·초대 (8건)

**Files:**
- Modify: `src/app/(app)/admin/invites/actions.ts`
- Modify: `src/app/(auth)/login/login-state.ts`
- Modify: `src/app/(auth)/register/actions.ts`
- Modify: `src/app/(auth)/register/register-flow.tsx`
- Modify: `src/app/api/auth/[...all]/route.ts`
- Modify: `src/modules/invites/invite.repo.ts`
- Modify: `src/modules/invites/invite.service.ts`
- Modify: `tests/integration/verification.rate-limit.integration.test.ts`
- Modify: `tests/modules/account/account.service.test.ts`

**운영 코드·설정 (6)**

- [ ] **auth-1-R01** — 발급·폐기 액션이 redirect 스텁뿐인 /admin/invites를 revalidate한다 — 목록을 그리는 /admin/users는 무효화되지 않는다
      `src/app/(app)/admin/invites/actions.ts:100`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-34 (DL-30의 나머지 범위))
- [ ] **auth-2-R01** — loginErrorMessage가 Object.prototype 키를 문구로 인정해 /login?loginError=constructor 요청이 로그인 화면을 깨뜨린다
      `src/app/(auth)/login/login-state.ts:18`
- [ ] **auth-1-C02** — checkInviteAction의 빈 catch가 예상 못 한 오류까지 로그 없이 「쓸 수 없는 가입코드입니다」로 바꾼다
      `src/app/(auth)/register/actions.ts:105`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-32)
- [ ] **auth-1-C01** — 가입 1단계의 가입코드 칸만 제출값을 되심지 않아, 코드 확인에 실패하면 12자리 코드를 처음부터 다시 친다
      `src/app/(auth)/register/register-flow.tsx:60`
- [ ] **auth-1-R02** — Better Auth 화이트리스트가 sign-in/email을 열어 둬 감사로그 없는 로그인 경로가 남는다
      `src/app/api/auth/[...all]/route.ts:11`
- [ ] **auth-1-R03** — 학부모 코드 한도는 교사가 만든 코드까지 세는데 학생 목록에는 자기가 만든 것만 나와, 학생이 폐기할 수 없는 코드에 막힌다
      `src/modules/invites/invite.repo.ts:88` · `src/modules/invites/invite.service.ts:135`

**테스트 (2)**

- [ ] **auth-3-R01** — IP 한도 통합 테스트가 제 머리말이 「일어난다」고 적은 maxWait 거부를 금지하는 단언을 달고 있다
      `tests/integration/verification.rate-limit.integration.test.ts:104`
- [ ] **auth-3-C02** — verifyPassword가 {status:false}로 resolve하는 경로가 없어 「현재 비밀번호가 틀리면 막는다」의 주 경로가 미검증이다
      `tests/modules/account/account.service.test.ts:49`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 4: 공용 UI·유틸 (4건)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/app-shell/bottom-tab.tsx`
- Modify: `src/components/ui/markdown.tsx`
- Modify: `src/lib/masks.ts`

**운영 코드·설정 (4)**

- [ ] **shell-R01** — 전역 `outline: none`이 체크박스와 파일 선택칸의 포커스 표시를 지워 버린다
      `src/app/globals.css:154`
- [ ] **ui-1-R04** — 하단탭이 최장일치를 하지 않아 /merit/recent에서 「상벌점」과 「최근」 두 칸이 동시에 켜지고 aria-current가 둘이 된다
      `src/components/app-shell/bottom-tab.tsx:16`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-39)
- [ ] **ui-1-C01** — Markdown 컴포넌트가 className 뒤에 props를 펼쳐, 살균기가 남긴 class가 디자인 클래스를 통째로 덮는다 — GFM 체크리스트가 글머리표·들여쓰기 없이 그려진다
      `src/components/ui/markdown.tsx:95`
- [ ] **core-2-R06** — formatPhone이 국내 0을 남긴 +82 표기를 `001-0123-4567`로 망가뜨려 가입·계정 수정 폼에서 붙여넣기가 형식 오류로 막힌다
      `src/lib/masks.ts:37`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 5: 상벌점 (9건)

**Files:**
- Modify: `src/app/(app)/merit/class-roster.tsx`
- Modify: `src/components/merit/rule-picker.tsx`
- Modify: `tests/modules/merit/merit.repo.recent.test.ts`
- Modify: `tests/modules/merit/merit.repo.removed-student.test.ts`
- Modify: `tests/modules/merit/merit.repo.totals.test.ts`
- Modify: `tests/modules/merit/merit.watch-list.test.ts`

**운영 코드·설정 (2)**

- [ ] **merit-1-C01** — 일괄 부여 확인창의 확인 버튼이 type="submit"이라 폼의 default button이 되어, 메모 칸에서 Enter를 치면 확인창 없이 부여가 나간다
      `src/app/(app)/merit/class-roster.tsx:460`
- [ ] **merit-2-R01** — 규정 고르기 칸을 아무 조작 없이 Tab으로 지나가면 첫 규정이 조용히 선택된다
      `src/components/merit/rule-picker.tsx:113`

**테스트 (7)**

- [ ] **merit-5-C01** — 최근 부여 검색어의 OR 4갈래 중 2갈래만 단언해, 메모·학생이름 갈래를 지워도 안 잡힌다
      `tests/modules/merit/merit.repo.recent.test.ts:90`
- [ ] **merit-5-C02** — 총건수 질의가 페이지와 같은 필터인지 대조하지 않아, 검색어·상태가 갈라져도 안 잡힌다
      `tests/modules/merit/merit.repo.recent.test.ts:148`
- [ ] **merit-5-C03** — findStudentHeader가 재적 줄을 그 학년도로 좁혀 읽는지 아무 테스트도 보지 않는다
      `tests/modules/merit/merit.repo.removed-student.test.ts:106`
- [ ] **merit-5-R01** — trackTotals·topRules·listAwardsForChart의 모집단(재적) 술어를 어느 테스트도 확인하지 않는다
      `tests/modules/merit/merit.repo.totals.test.ts:31`
- [ ] **merit-5-R02** — 합계 학년도(totalsYear)가 where.year에 실리는지를 8개 집계 중 둘만 확인한다
      `tests/modules/merit/merit.repo.totals.test.ts:138`
- [ ] **merit-5-R03** — listClassRoster·classSummaries 집계에서 track 조건이 빠져도 아무 테스트가 안 깨진다
      `tests/modules/merit/merit.repo.totals.test.ts:510`
- [ ] **merit-5-C04** — getMeritStats에 반 범위를 준 결과(반별 현황 필터·명단·scope)를 아무 테스트도 보지 않는다
      `tests/modules/merit/merit.watch-list.test.ts:232`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 6: 전자출입증 (7건)

**Files:**
- Modify: `src/app/(app)/pass/admin-view.tsx`
- Modify: `src/app/(app)/pass/issue-form.tsx`
- Modify: `src/modules/pass/request.service.ts`
- Modify: `tests/modules/pass/decision.service.test.ts`
- Modify: `tests/modules/pass/pass.window.test.ts`
- Modify: `tests/modules/pass/request.service.test.ts`

**운영 코드·설정 (3)**

- [ ] **pass-1-C01** — 결재 대기·지금 나가 있는 학생 카드가 실제로 그린 줄 수보다 큰 건수를 제목 옆에 적는다
      `src/app/(app)/pass/admin-view.tsx:57`　(지난 감사: 2026-09-01-full-read-audit.md RL-23)
- [ ] **pass-1-C12** — 바로 부여가 실패하면 행선지·사유·시각이 지워진 빈 폼과 오류 문구만 남는다
      `src/app/(app)/pass/issue-form.tsx:89`
- [ ] **pass-2-R01** — 학생 신청은 명단 반영과 같은 user 행 잠금을 기다리는데 트랜잭션 예산도 P2028 변환도 없어 원인 불명 오류로 죽는다
      `src/modules/pass/request.service.ts:35`

**테스트 (4)**

- [ ] **pass-3-C03** — 대행 재시도의 「보호자 기록을 덮지 않는다」 단언이 두 키가 모두 맞을 때만 실패한다 — consentByProxy만 켜도 통과한다
      `tests/modules/pass/decision.service.test.ts:298`
- [ ] **pass-3-R01** — 이어 붙이기를 막는 60분 여백(conflictWindow)에 닿는 단언이 저장소 전체에 하나도 없다 — 상수를 0으로 바꿔도 단위 스위트 2281건이 전부 통과한다
      `tests/modules/pass/pass.window.test.ts:3`
- [ ] **pass-3-C05** — issueWindow 외출의 종료일이 KST로 집힌다는 것에 단언이 닿지 않는다 — 고른 시각이 UTC와 KST가 같은 날인 지점뿐이다
      `tests/modules/pass/pass.window.test.ts:186`
- [ ] **pass-3-C01** — getMyStudentQr 테스트가 QR 안에 무엇이 들었는지 한 번도 보지 않는다 — 학생증을 통째로 갈아치워도 스위트가 초록이다
      `tests/modules/pass/request.service.test.ts:495`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 7: 커뮤니티 (6건)

**Files:**
- Modify: `src/app/(app)/community/[slug]/[postId]/attachment-list.tsx`
- Modify: `src/app/(app)/community/[slug]/actions.ts`
- Modify: `src/modules/community/attachment.service.ts`
- Modify: `src/modules/community/post.service.ts`
- Modify: `tests/modules/community/post.service.test.ts`

**운영 코드·설정 (4)**

- [ ] **community-1-C03** — PDF가 아닌 첨부만 next/link로 API 라우트를 가리켜 목록이 보이기만 해도 서버가 파일을 통째로 읽고 클릭하면 두 번 읽는다
      `src/app/(app)/community/[slug]/[postId]/attachment-list.tsx:99`
- [ ] **community-1-C01** — 댓글 작성이 실패하면 입력한 댓글 본문이 통째로 사라진다
      `src/app/(app)/community/[slug]/actions.ts:166`
- [ ] **community-1-R01** — 고아 첨부 정리가 DB 행과 디스크 파일을 지우면서 감사로그를 한 줄도 남기지 않는다
      `src/modules/community/attachment.service.ts:172`　(지난 감사: 2026-08-31-codebase-audit.md L-11 · 2026-08-31-codebase-audit-deep.md DL-22)
- [ ] **community-2-C01** — updatePost의 커밋 뒤 디스크 삭제 루프가 감싸이지 않아, 파일 하나가 안 지워지면 이미 저장된 수정이 「처리하지 못했습니다」로 보고된다
      `src/modules/community/post.service.ts:351`　(지난 감사: 2026-08-31-codebase-audit.md L-18)

**테스트 (2)**

- [ ] **community-2-C03** — updatePost의 `kept + attached === requested.length` 대조가 테스트에서 한 번도 실행되지 않는다
      `tests/modules/community/post.service.test.ts:230`
- [ ] **community-2-C04** — 첨부를 안 받게 바뀐 게시판에서 detachFromPost를 건너뛰는 가드에 테스트가 없다 — 모듈의 유일한 되돌릴 수 없는 삭제다
      `tests/modules/community/post.service.test.ts:307`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 8: 명단·학년도 (8건)

**Files:**
- Modify: `src/app/(app)/admin/students/year-switcher.tsx`
- Modify: `src/modules/enrollment/roster.parse.ts`
- Modify: `src/modules/enrollment/roster.plan.ts`
- Modify: `src/modules/enrollment/roster.service.ts`
- Modify: `tests/modules/enrollment/roster.repo.listExisting.test.ts`
- Modify: `tests/modules/enrollment/roster.repo.test.ts`
- Modify: `tests/modules/enrollment/roster.service.test.ts`

**운영 코드·설정 (4)**

- [ ] **roster-1-C02** — 현재 학년도가 없을 때 학년도 Select가 빈 칸으로 서고 「현재로 지정」이 반드시 실패한다
      `src/app/(app)/admin/students/year-switcher.tsx:19`
- [ ] **roster-1-R01** — 명단 파일의 머리글 행만 NFC 정규화를 안 해, macOS에서 온 조합형 한글 머리글이면 전 줄이 오류가 된다
      `src/modules/enrollment/roster.parse.ts:462`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-11)
- [ ] **roster-2-C01** — 학생코드가 빈 신규 줄끼리는 이름·생년월일 중복을 검사하지 않아, 같은 학생이 두 줄로 들어오면 초대코드 두 장이 나가고 프로필이 둘 생긴다
      `src/modules/enrollment/roster.plan.ts:226`
- [ ] **roster-2-R01** — 확정 결과의 「N건 반영했습니다」는 신규 학생을 하나도 세지 않고 안 바뀐 학생을 전부 센다
      `src/modules/enrollment/roster.service.ts:413`　(지난 감사: 2026-08-31-codebase-audit.md L-21)

**테스트 (4)**

- [ ] **roster-3-C02** — listExisting이 생년월일을 KST로 자르는지 확인하는 단언이 어디에도 없다
      `tests/modules/enrollment/roster.repo.listExisting.test.ts:30`
- [ ] **roster-3-C01** — schoolClass upsert 목이 늘 같은 id를 줘서 학생이 제 반에 들어가는지 아무도 보지 않는다
      `tests/modules/enrollment/roster.repo.test.ts:399`
- [ ] **roster-3-R02** — applyRoster에 넘어가는 managedStudentProfileIds·createdById를 아무 테스트도 단언하지 않는다
      `tests/modules/enrollment/roster.service.test.ts:544`
- [ ] **roster-3-C03** — 명단 반영이 낸 초대코드의 invite:create 감사로그가 통째로 미검증이고, 픽스처에 targetId가 될 id가 없다
      `tests/modules/enrollment/roster.service.test.ts:259`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 9: 계정관리·감사로그 (2건)

**Files:**
- Modify: `src/app/(app)/admin/logs/log-filters.tsx`
- Modify: `src/modules/audit-log/audit-log.labels.ts`

**운영 코드·설정 (2)**

- [ ] **adminops-1-R02** — 감사로그 「기간」 라벨이 `<div>`를 가리켜 네 버튼 중 어느 것도 이름을 못 받는다
      `src/app/(app)/admin/logs/log-filters.tsx:58`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-40)
- [ ] **adminops-1-R01** — 계정 조치의 사유가 감사로그에 「reason 전학」처럼 날것으로 찍히거나 아예 사라진다
      `src/modules/audit-log/audit-log.labels.ts:489`　(지난 감사: 2026-08-31-codebase-audit-deep.md DL-20)

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

### Task 10: 대시보드·나머지 (3건)

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `tests/modules/registration/registration.repo.test.ts`

**운영 코드·설정 (2)**

- [ ] **shell-C01** — 대시보드 「지금 나가 있는 학생」이 복귀 시각에서 날짜를 지워, 내일 돌아오는 외박이 오늘 저녁으로 읽힌다
      `src/app/(app)/page.tsx:271`
- [ ] **shell-C02** — 대시보드 「최근 부여」가 상쇄점을 상점과 같은 파란색으로 칠한다
      `src/app/(app)/page.tsx:226`

**테스트 (1)**

- [ ] **auth-3-C01** — registerFailedAttempt의 「한계 미만이면 폐기하지 않는다」 조기 반환을 타는 테스트가 하나도 없다
      `tests/modules/registration/registration.repo.test.ts:123`

- [ ] `npm run verify:unit` 통과
- [ ] 커밋 — `fix(<범위>): …`

---

## 5. 마무리

- [ ] **`npm run verify` 통과** (Postgres 필요 — `npm run db:up`)
- [ ] **처리 기록을 쓴다** — `docs/reviews/<날짜>-vertical-fix-batch.md`.
      지난 배치의 [`2026-09-01-fix-batch.md`](../../reviews/2026-09-01-fix-batch.md)가 본보기다. **감사 문서가 아니라 처리 기록이다** — 무엇을 고쳤나 · 고치면서 드러난 것 · 남긴 것과 그 이유를 적는다.
      특히 **테스트를 조이다 빨간불이 난 자리**가 있으면 그것이 이 배치의 가장 큰 소득이므로 따로 절을 둔다.
- [ ] **감사 문서는 고치지 않는다.** 스냅샷이다 — 「이후 코드가 바뀌어도 고쳐 쓰지 않는다」(`docs/reviews/README.md`).
- [ ] **`docs/reviews/README.md`의 표에서** `2026-09-01-vertical-full-read.md` 줄의 **「지금 상태」 칸**을 갱신한다(현재 「미처리」).
- [ ] **PR을 연다** — 브랜치는 `fix/<날짜>-vertical-audit-batch`. 코드 수정은 지난 두 배치처럼 브랜치→PR이고, 감사·계획 문서만 main에 직접 올라간다.

## 6. 이번 배치가 다루지 않는 것 — 다음에 사람이 정할 일

- **낮음 353건**(감사 문서 §5). 그중 **테스트 97건은 성격이 다르다** — 결함이 아니라 「지금 초록불이 아무것도 안 지킨다」는 것이라, 고치면 그 자리에서 회귀가 잡히기 시작한다. 낮음 중에서는 이쪽이 값이 크다.
- **`shell-C03`의 보류를 재심할 것인가**(감사 문서 §6.1). 2026-08-25 감사가 「그 상태에 도달할 경로가 없다」로 기각했는데 그 근거가 이후 무너졌다. 낮음이라 이번 배치 밖이다.
- **`--text-display` 토큰**(§6.2). 문서 두 곳이 삭제됐다고 적는데 `globals.css:75`에 살아 있고 쓰는 곳은 0곳이다.
- **학부모 대시보드에만 「새 글」 카드가 없는 것**(`shell-R05`, 낮음)이 의도인지.
