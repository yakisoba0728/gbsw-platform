# gbsw-platform 구현 계획 — 결함 수정 + 단순화·보안 정리

> **For agentic workers:** 이 문서 하나가 진입점이다. Phase A → Phase B 순서로 진행한다.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 가지를 순서대로 한다.

- **Phase A — 결함 49건 수정.** 감사가 확정한 높음 1 + 중간 48. 태스크 10개 = 커밋 10개.
- **Phase B — 단순화·보안 정리.** 약 -880줄, 개념 열몇 개 제거, 기록 밖에 있던 경로 여섯을 감사로그 안으로. 7단계.

**기준선:** `main @ 5817fb1`

**Phase A가 먼저다.** 이유 둘 — 결함 49건이 `파일:줄`에 앵커돼 있어 구조를 먼저 바꾸면 못 찾게 되고,
Phase A의 **테스트 강화 20건이 Phase B의 6·7단계를 받칠 그물**이다. 그물 없이 리팩터하면 조용한 회귀를 못 잡는다.

## 0. 근거 문서 — 항목마다의 전체 근거는 여기 있다

이 계획은 **목록·순서·결정**만 담는다. 「왜 이것이 결함인가」와 「왜 이렇게 고치나」는 아래 두 스냅샷에 있다.

| 문서 | 무엇 | 어떻게 쓰나 |
|---|---|---|
| [`docs/reviews/2026-09-01-vertical-full-read.md`](../../reviews/2026-09-01-vertical-full-read.md) | 통독 감사 — 확정 403건 | Phase A 항목의 **id**(예: `merit-5-R01`)를 찾으면 위치·현재 코드 인용·실패 시나리오·고치는 방법이 나온다. 높음은 §3, 중간은 §4 |
| [`docs/reviews/2026-09-01-simplification-survey.md`](../../reviews/2026-09-01-simplification-survey.md) | 단순화·보안 조사 — 채택 54 / 기각 16 | Phase B 항목의 **id**(예: `db-03`)를 §4에서 찾는다. **§5 기각 16건도 읽어라** — 「이 저장소가 왜 지금 모양인가」의 목록이다 |

**한 줄 제목만 보고 고치지 않는다.** 제목은 증상이고, 고칠 자리와 이유는 근거 문서에 있다.

### 이 저장소를 처음 보는 경우

`CLAUDE.md`를 먼저 읽는다. 계층 규칙(Route/Action → Service → Repo) · 권한(`can()`/`assertCan`) · 감사로그 · 오류 규약 · 디자인 토큰이 거기 있고, 아래 §2가 그 요약이다.

```bash
npm run db:up        # Postgres 컨테이너 (호스트 5433)
npm run verify:unit  # typecheck + lint + 단위 테스트. DB 불필요 — 개발 중 상시
npm run verify       # + 통합 테스트(DB 필요) + build — 각 단계의 종료 조건
npx vitest run --project unit <경로>   # 단위 하나만
```

**아직 한 번도 실사용 배포를 하지 않았다.** 사용자가 「지금 구조 다 바꿔도 상관없음」이라고 명시했다 — Phase B의 스키마 변경이 가능한 근거다.

---

## 1. 사람이 이미 정한 것 — 그대로 따른다

감사 뒤 사용자가 네 가지를 정했다. **다시 묻지 않는다.** (아직 안 정해진 것은 §4에 따로 있다.)

### 확정 1 · 학부모 초대코드 (`auth-1-R03`)

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

### 확정 2 · 명단 확정 결과 숫자 (`roster-2-R01`)

지금 「N건 반영했습니다」의 N은 **안 바뀐 학생을 전부 세고 신규 학생을 하나도 안 센다.**

- `roster.service.ts:413`의 `saved`를 **실제로 달라진 줄**(reassign + statusChange + newAssignment)로 좁힌다 — `untouched`를 뺀다.
- **발급된 초대코드 수를 별도 필드로** 함께 돌려준다.
- 화면(`admin/students/import/import-form.tsx:424`)을 「N건 반영, 초대코드 M장 발급」으로 나눈다. 기존 「N명 명단에서 뺐습니다」 갈래는 그대로 둔다.
- `admin/students/import/action-state.ts:32`의 주석(「반영 건수(saved) 중 계정째 삭제된 학생 수」)도 고친다 — `missingFromFile`은 `untouched`에서 제외되므로 `deleted`는 `saved`의 부분집합이 **아니다**.

### 확정 3 · 고아 첨부 청소 (`community-1-R01`)

**감사로그 예외로 문서화하지 않고, 규약대로 기록을 남긴다.**

- `attachment.service.ts`의 `sweepMyOrphans`가 지운 것에 `community:attachment:delete`를 남긴다. 액션 문자열과 라벨은 이미 있다(`audit-log.labels.ts:71,126,176` — `post.service.ts:336`이 쓰고 있다). **새 액션을 만들지 않는다.**
- **청소 실패를 삼키는 성질은 유지한다** — `recordAudit`도 같은 `try` 안에 둔다. 청소가 업로드를 막으면 안 된다.
- **같은 파일 148줄의 보상 삭제도 기록한다.** 등록 감사로그는 트랜잭션 안(121행)에서 먼저 남고 디스크 쓰기는 그 밖(144행)에서 일어난다 — 쓰기가 실패하면 행은 148행에서 지워지는데 **「첨부 등록」 기록만 남아 존재한 적 없는 파일을 가리킨다.** 그 자리를 닫는다.
- **주석을 사실에 맞게 고친다.** `sweepMyOrphans`의 머리말이 「남의 행은 건드리지 않는다」라고 적지만, `community.repo.ts:401`의 `OR: [{ uploaderUserId }, { uploaderUserId: null }]`가 **계정이 완전히 삭제된 사람의 파일도 함께 걷는다.**

### 확정 4 · 범위

- **한다:** 높음 1 + 중간 48.
- **안 한다:** 낮음 353건. 감사 문서 §5에 목록으로 남는다.
- **손대지 않는다:** 감사 문서 **§6.1의 보류 5건.** 지난 감사에서 「고치지 않기로」 정해진 것들이라 이번 배치가 건드리면 결정을 뒤집는 것이 된다. `auth-1-C03`(로그인 게이트의 `deletedAt`)이 중간 심각도로 올라왔지만 여기 속하므로 **§5에 없다.**

---

---

## 2. 절대 규칙 (모든 태스크에 암묵적으로 포함된다)

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

---

## 3. 함정

- **테스트를 조였는데 실패하면 그것은 진짜 결함이다.** 이 배치의 49건 중 **23건이 「통과할 수밖에 없는 단언」**이고, 감사 때 여럿이 「소스에 변이를 넣어도 2,281건이 전부 통과한다」로 확인됐다. 조인 단언이 **현재 코드에서 빨간불이 나면 단언을 약하게 만들지 말고 멈추고 보고한다** — 감사가 못 본 결함을 그 테스트가 찾은 것이다.
- **스키마는 안 바뀐다.** 49건 중 `prisma/`를 건드리는 것은 하나도 없다. 마이그레이션을 만들 일이 없다 — 만들게 됐다면 범위를 벗어난 것이다.
- **감사로그 액션을 새로 만들지 않는다.** 만들게 되면 `AUDIT_ACTIONS`·라벨 표·`tests/modules/audit-log/audit-log.labels.test.ts:67`의 하한(현재 39, 실제 42)을 함께 손봐야 한다. 이번 배치에 필요한 액션은 전부 이미 있다.
- **`auth-1-R02`는 테스트 기대값을 뒤집는다.** `SAFE_ENDPOINTS.POST`에서 `sign-in/email`을 빼면 `tests/app/api/auth/route.test.ts:28`이 그 항목이 허용됨을 단언하고 있으므로 함께 뒤집는다. 앱 안의 로그인 경로 셋은 이 라우트를 지나지 않는다(감사 문서 §4 참조).
- **`community-1-C03`은 `next/link`를 `<a href>`로 바꾸는 일이다.** 형제 분기(PDF)가 이미 그렇게 돼 있으니 그 모양에 맞춘다. `download` 속성은 필요 없다 — `Content-Disposition`이 이미 정한다.
- **한 태스크가 여러 조각의 id를 담을 수 있다.** id의 접두사(`merit-5` 등)는 감사 때 나눈 읽기 조각이지 코드 경계가 아니다.

---

---

## 4. 아직 정해지지 않은 것 10건 — Phase B가 여기서 막힌다

**Phase A는 이 절 없이 그대로 진행할 수 있다.** 아래 열 가지는 **Phase B**의 내용을 바꾼다 — 정하지 않고 시작하면 리팩터의 부산물로 사용자에게 보이는 동작이 바뀌거나, 되돌릴 수 없는 마이그레이션이 승인 없이 적용된다.

**답을 받기 전에는 그 단계를 시작하지 않는다.** 아직 답이 없으면 아래 「추천」을 기본값으로 제안하되, **실행 전에 사람에게 확인을 받는다.**

| # | 무엇을 정하나 | 막는 곳 | 추천 |
|---|---|---|---|
| 1 | 통계 「부여 건수」 모집단을 재적 학생으로 통일? | 6단계 (c) | **통일한다** |
| 2 | `SchoolClass` 테이블을 없애고 컬럼으로 내릴까? | 5단계 (e) | **한다** (세 조건 충족 시) |
| 3 | 아무도 안 읽는 컬럼 다섯을 지울까? | 5단계 (c) | **커뮤니티 네 열만, `Invite.usedAt`은 전제 확인 후** |
| 4 | 감사로그 IP를 `x-forwarded-for` 마지막 항목에서? | 4단계 (h) | **바꾼다** |
| 5 | 가입 인증 발송을 실제로 켤까? | (Phase B 밖) | **밖으로 뺀다** |
| 6 | `--text-display` 토큰과 스펙 표를 함께 지울까? | 2단계 (b) | **함께 지운다** |
| 7 | 커뮤니티 목록 「총 N건」을 그릴까, 필드를 지울까? | 1단계 | **지운다** |
| 8 | 권한 거부 문구를 통일할까? | 7단계 (c) | **통일하지 않는다** — 기계 부분만 모은다 |
| 9 | 앱 오류 화면 셋을 하나로? | 7단계 (b) | **합친다** (문구가 바뀐다) |
| 10 | 학부모 초대코드에 90일 만료를? | 4단계 (f) | **준다** |

아래에 각각의 근거와 선택지가 있다.

### 결정 1 · 상벌점 통계의 「부여 건수」 모집단을 재적 학생으로 통일할 것인가?

관련 항목: `cx-merit-pass-01` · `cx-merit-pass-03`

**왜 사람이 정해야 하나**

cx-merit-pass-01과 cx-merit-pass-03이 서로 배타라고 적은 이유가 정확히 이것이다. 01이 `studentScope`의 rosterYear를 필수로 만들면, 03이 합친 `awardsByRule`의 호출부인 `getRuleStats`도 rosterYear를 넘겨야 하고 그 순간 규정별 화면이 졸업·퇴학생 부여분을 빼고 세게 된다. **이것은 리팩터의 부산물이 되어선 안 되는 동작 변경이다.** 동시에 이것은 감사가 세 번 확정한 결함이기도 하다 — merit-3-R01 「통계 화면의 탭마다 부여 건수의 모집단이 다르다 — ruleStats·teacherTotals에만 재적 술어가 없다」(2026-08-31 C-03 · deep D-02 · 이번 라운드). 즉 지금 상태는 「의도해서 넓은 것」이 아니라 「빠진 것」일 가능성이 높다.

**선택지**

- 통일한다 — 01+03을 함께 하고, 규정별·교사별 집계도 재적 학생만 세게 된다(merit-3-R01이 의도적 부수 효과로 닫힌다)
- 지금 모집단을 유지한다 — 03만 하고 01은 rosterYear 필수화를 뺀 축소판으로 하거나 통째로 보류한다
- 01을 통째로 보류한다 — 02·03만 하고 where 조립 통합은 다음 라운드로 넘긴다

**추천 — 통일한다**

**통일한다.** 근거 둘: (1) 같은 화면의 탭을 옮길 때마다 건수가 달라지는 것을 교사가 설명할 수 없고, 세 감사가 독립적으로 같은 자리를 짚었다. (2) 통일하지 않으면 01의 「rosterYear를 필수로」가 영원히 못 들어가고, `studentScope`의 「둘 다 없으면 조건이 없다」 갈래가 남아 다음 사람이 학년도 없이 부르는 호출부를 또 만든다. 단, 통일을 고르면 **6단계 (c)를 독립 커밋으로 두고 커밋 메시지에 「집계 모집단이 재적 학생으로 좁아진다」를 한 줄로 적는다** — 리팩터에 묻히면 안 되는 변화다.

---

### 결정 2 · SchoolClass 테이블을 없애고 grade·classNo를 Enrollment 컬럼으로 인라인할 것인가?

관련 항목: `db-03` · `db-07`

**왜 사람이 정해야 하나**

이 프로그램에서 **가장 되돌리기 어려운 항목**이다. 이미 데이터가 있는 DB 셋(로컬 dev·gbsw_test·운영 중인 테스트 서버)에 백필 마이그레이션이 적용되고, 적용된 뒤에는 revert가 테이블을 되살릴 뿐 관계를 되살리지 못한다. 얻는 것은 -35줄과 테이블 하나 — 줄 수만 보면 작지만 실제 이득은 `schoolClass.upsert` 블록 넷(등록·계정관리·재적·명단 배치 루프)이 통째로 사라지고 조회 15곳의 조인 select가 평평해지는 것이다. Phase A Task 8이 `roster-3-C01`로 그 upsert에 테스트를 새로 붙이는데, 이 결정을 「한다」로 고르면 그 단언은 「학생 행에 grade·classNo가 제대로 박히는가」로 옮겨 살아야 한다.

**선택지**

- 한다 — 5단계 마지막 커밋으로, 백필 마이그레이션과 통합 테스트 기준선을 먼저 잡고
- 안 한다 — SchoolClass를 남기고 db-07의 `SchoolClass @@index([year])` 삭제만 한다
- 나중에 — 테이블 구조를 바꿀 다른 이유(반 이름·담임 같은 반 자체의 속성)가 생기면 그때 다시 본다

**추천 — 한다**

**한다.** 근거: SchoolClass는 독립된 생명주기가 없다 — 아무도 반을 만들거나 지우지 않고 학생이 배정될 때 upsert로 생겼다 사라진다. 그래서 별도 행일 이유가 「학년도마다 별개의 행이다」·「반이 지워져도 지난 소속 기록은 남아야 한다」 두 주석뿐인데, 컬럼으로 내리면 그 위험 자체가 사라진다. 다만 **세 조건을 지키지 못하면 「안 한다」가 맞다**: 백필 SQL을 눈으로 확인할 것, 새 `@@unique([year, grade, classNo, number])`가 비재학(null) 행끼리 안 걸리는 성질을 유지하는지 확인할 것, merit·pass·roster 통합 테스트로 변경 전후 같은 결과를 확인할 것. 테스트 서버 DB 덤프를 먼저 뜬다.

---

### 결정 3 · 쓰기만 하고 아무도 읽지 않는 컬럼 다섯 개를 지울 것인가? (커뮤니티 삭제 표시 넷 + Invite.usedAt)

관련 항목: `db-05` · `dead-14` · `cx-comm-roster-06`

**왜 사람이 정해야 하나**

**DROP COLUMN은 그 컬럼의 값을 지운다.** revert는 컬럼을 되살릴 뿐 「누가 왜 이 글을 지웠는가」를 되살리지 못한다. 제안의 전제는 「그 사실이 감사로그에 이미 있다」인데, 그 전제는 db-05 자신의 조건 (2)가 「확인한다」로 남겨 둔 것이지 확인된 것이 아니다. `markPostDeleted`/`markCommentDeleted`에서 인자를 뺄 때 호출부의 `recordAudit`에서 actorUserId·actorName·reason이 함께 빠지면, 사실이 옮겨 가는 게 아니라 사라진다. 세 제안(dead-14·cx-comm-roster-06·db-05)이 같은 자리를 범위만 달리해 가리키므로 어디까지 지울지도 함께 정한다.

**선택지**

- 다섯 다 지운다 — db-05 전체
- 커뮤니티 네 열만 지우고 Invite.usedAt은 남긴다 — cx-comm-roster-06 범위
- 글·댓글의 deletedByUserId·deletedReason 둘만 지운다 — dead-14 범위
- 지금은 안 지운다 — 읽는 화면을 만들 계획이 있으면 그쪽이 맞다

**추천 — 커뮤니티 네 열은 지우고, `Invite.usedAt`은 전제를 확인한 뒤 함께 지운다**

**커뮤니티 네 열은 지우고, Invite.usedAt은 전제를 확인한 뒤 함께 지운다.** 근거: 네 열은 스키마가 스스로 세운 규약(「과거의 사실이 살아 있는 외래키에 기대면 안 된다 — 이름 스냅샷을 남긴다」)을 혼자 어기는 자리이고, 삭제 사실은 `community:post:delete`·`community:comment:delete` 감사로그가 행위자 이름 스냅샷과 함께 이미 남긴다. **작업 순서를 못 박는다** — 먼저 두 서비스의 `recordAudit` 호출을 열어 actorUserId·actorName·reason이 실제로 실리는지 확인하고, 확인이 끝난 뒤에 마이그레이션을 만든다. 기존 마이그레이션을 고쳐 접지 말고 DROP COLUMN을 새로 낸다(체크섬이 깨지면 테스트 서버의 `migrate deploy`가 멈춘다).

---

### 결정 4 · 감사로그의 접속 IP를 x-forwarded-for의 첫 항목에서 마지막 항목으로 바꿀 것인가?

관련 항목: `sec-02`

**왜 사람이 정해야 하나**

테스트 네 건이 「첫 항목이 원 IP다」를 규약으로 못 박아 두었고 docs/deploy.md가 두 곳에서 같은 말을 한다. 즉 이것은 문서화된 결정을 뒤집는 변경이다. 바꾸면 프록시가 덧붙임 모드로 잘못 설정된 경우에도 클라이언트가 지어 보낸 첫 항목을 믿지 않게 된다 — 감사로그의 접속 IP가 위조되지 않는다. 바꾸지 않으면 「프록시가 헤더를 자기 값으로 덮어쓴다」는 배포 전제 하나에 감사로그의 신뢰성이 통째로 걸린 상태가 유지된다. 문서화된 설정(한 홉)에서는 값이 지금과 같으므로 **정상 경로의 동작은 안 바뀐다.**

**선택지**

- 바꾼다 — 다섯 조건(문서 두 곳·주석·테스트 4건 재작성 + 2건 신규·x-forwarded-proto와의 차이 주석)을 한 커밋에 담아
- 안 바꾼다 — 프록시 설정을 신뢰하고 문서의 경고를 강화하는 쪽으로만 간다

**추천 — 바꾼다**

**바꾼다.** 근거: 이 앱은 `127.0.0.1`에만 묶이고 리버스 프록시가 정확히 한 홉이라는 것이 이미 배포 규약이므로, 마지막 항목이 「프록시가 실제로 본 상대」라는 명제가 그 규약 위에서 참이다. 다만 **문서에 반드시 명시한다: 마지막 항목 읽기는 둘째 방어선이지 프록시 덮어쓰기 설정(`header_up X-Forwarded-For {remote_host}` · `proxy_set_header X-Forwarded-For $remote_addr`)을 빼도 된다는 뜻이 아니다.** 그리고 「프록시가 헤더를 아예 손대지 않는 오설정은 이 코드로도 못 가른다」는 한계를 주석에 같이 적는다 — 안 적으면 다음 사람이 설정을 뺀다. 무변화 증명 테스트(「항목이 하나뿐인 문서화된 설정에서는 값이 지금과 같다」)를 반드시 넣는다.

---

### 결정 5 · 가입 인증 발송을 실제로 켤 것인가? (지금은 아무것도 보내지 않고 verifiedAt이 찍힌 행을 바로 만든다)

관련 항목: `cx-comm-roster-02`

**왜 사람이 정해야 하나**

CLAUDE.md가 이 상태와 그 대가를 이미 정직하게 적어 두었다 — `User.email`·`User.phone`은 아무도 소유를 증명하지 않은 값이고 그 위에 `emailVerified: true`가 하드코딩되며, 유효한 초대코드와 사전등록 이름을 아는 사람이면 남의 이메일 주소를 선점해 진짜 소유자의 가입을 막을 수 있다. 켜는 것은 그 문단이 지목한 재검토 항목을 그대로 실행하는 일이지만, **운영자 승인(알리고 자격증명·발송 비용·실패 시 가입 차단 정책)과 EMAIL 채널 결정(SMTP 발송기를 넣을 것인가, 전화번호만 인증할 것인가)이 먼저다.** +120줄이고 정리가 아니라 기능이다.

**선택지**

- Phase B 밖으로 뺀다 — 별도 기획으로 다루고, 지금은 CLAUDE.md의 서술을 그대로 둔다
- Phase B의 마지막 단계로 넣는다 — 운영자 승인을 먼저 받고
- 지금 상태를 유지하기로 명시적으로 확정한다 — CLAUDE.md에 「당분간 켜지 않는다」와 그 재검토 조건을 적는다

**추천 — Phase B 밖으로 뺀다**

**Phase B 밖으로 뺀다.** 근거 셋: (1) 이 프로그램의 모든 다른 항목은 코드가 이미 하고 있는 일을 줄이거나 기록하는 일인데, 이것은 앱이 하지 않던 일(외부 발송)을 시작하는 일이다. (2) 결정의 절반이 코드가 아니라 운영에 있다 — 발송 비용, 실패 시 가입을 막을지, EMAIL 채널을 어떻게 할지. (3) 켜면 `verified-field.tsx`의 인증번호 입력칸·confirm 경로가 살아나 지금 도달할 수 없는 화면 흐름이 통째로 새 테스트 대상이 된다. **다만 세 번째 선택지의 값도 크다** — 지금 상태가 「아직 안 한 것」인지 「하지 않기로 한 것」인지가 문서에 없어서, 이 결정을 미룰 때마다 감사가 같은 자리를 다시 올린다.

---

### 결정 6 · `--text-display`·`--color-green-press` 토큰을 지우고 디자인 스펙 문서의 표 두 줄을 함께 지울 것인가?

관련 항목: `dead-05` · `cx-core-app-06`

**왜 사람이 정해야 하나**

Phase A 계획(이 문서 §10)이 이 항목을 「다음에 사람이 정할 일」로 명시적으로 남겼다. 문서 두 곳(responsive-audit P3-5 · reviews/README.md:62)이 「삭제됐다」고 기록했는데 코드에 살아 있고, 값까지 스펙에서 벗어났다. 감사 §6.2가 재발로 기록한 두 건 중 하나이고 경로가 git으로 확정돼 있다 — 1f63660 도입 → 250268c 삭제 → 974914e 부활. **표만 남기고 토큰만 지우면 이미 한 번 실패한 수정을 세 번째로 반복하는 것이다.**

**선택지**

- 토큰과 디자인 스펙 문서의 표 두 줄을 같은 커밋에서 지운다
- 문서에 맞춰 토큰 값을 스펙값(28/1.2/-0.42)으로 되돌리고 남긴다 — 언젠가 쓸 자리가 있다면
- 지금 그대로 둔다 — 대신 문서 두 곳의 「삭제됐다」를 사실로 고친다

**추천 — 토큰과 표를 함께 지운다**

**토큰과 표를 함께 지운다.** 근거: 세 번의 커밋 이력이 「쓰는 곳이 0곳인 채로 표에 남아 있으면 다음 개편이 되살린다」를 이미 증명했다. `--color-green-press`는 어느 문서에도 기록이 없는 새 항목이라 그냥 지우면 되고, `--text-display`는 표를 함께 지워야 재발이 닫힌다. 세 번째 선택지는 「지우기로 한 결정」을 뒤집는 것이라 그 자체로 한 번 더 정할 일이 되므로 권하지 않는다.

---

### 결정 7 · 커뮤니티 글 목록에 「총 N건」을 그릴 것인가, `PostPage.total`을 지울 것인가?

관련 항목: `dead-16` · `cx-comm-roster-08`

**왜 사람이 정해야 하나**

형제 목록 셋(최근 부여·감사로그·계정)은 모두 「총 N건」을 그리는데 커뮤니티만 서비스가 계산해 돌려주고 화면이 안 쓴다. 즉 이것은 「죽은 필드」일 수도 있고 「빠뜨린 화면」일 수도 있다 — 지우기 전에 어느 쪽인지 정해야 하고, 지우기로 하면 `post.service.test.ts:406`의 단언도 함께 지운다(안 그러면 단위 테스트가 곧바로 깨진다).

**선택지**

- 지운다 — 커뮤니티 목록에는 총 건수를 안 그리기로 확정한다
- 그린다 — 필드를 남기고 목록 화면에 「총 N건」을 넣는다(형제 셋과 같은 모양)
- 지금 그대로 둔다 — 결정을 미룬다

**추천 — 지운다**

**지운다.** 근거: 게시판 목록은 「몇 건인지」보다 「최근 글이 무엇인지」를 보는 화면이고, 쪽 넘김이 이미 규모를 알려 준다. 감사로그·계정 목록이 총 건수를 그리는 이유(집계를 읽는 화면이다)가 여기엔 없다. 세 번째 선택지를 고르면 이 필드가 다음 감사에서 또 죽은 코드로 올라오므로, 미룰 바에는 「그린다」를 골라 화면을 넣는 쪽이 낫다.

---

### 결정 8 · 권한 거부(`ForbiddenError`)의 화면 문구를 어느 쪽으로 통일할 것인가?

관련 항목: `cx-core-app-01`

**왜 사람이 정해야 하나**

cx-core-app-01이 액션 여섯 개의 「오류→문구」 껍데기를 한 곳으로 모으는데, 그 순간 지금 네 곳에 흩어진 권한 거부 문구(users·invites의 `MESSAGES["FORBIDDEN"]` · parent-invite:20 · pass:49의 `FORBIDDEN_MESSAGE`)가 하나로 수렴한다. **사용자에게 보이는 문구가 모르는 사이에 바뀌면 안 되므로, 리팩터의 부산물이 아니라 먼저 정한 결정이어야 한다.** CLAUDE.md의 오류 규약(코드는 서비스가, 문구는 액션의 MESSAGES 사전이) 자체는 그대로 지켜진다 — 사전은 파일에 남고 사전을 읽는 기계 부분만 모은다.

**선택지**

- 네 문구를 읽고 하나를 골라 전부 그것으로 맞춘다
- 공용 함수가 폴백을 호출마다 받게 만들어 파일별 문구를 그대로 유지한다(기계 부분만 모으고 문구는 안 건드린다)
- cx-core-app-01을 보류한다

**추천 — 폴백을 호출마다 받게 만들고 문구는 지금 자리를 지킨다**

**두 번째 — 폴백을 호출마다 받게 만들고 문구는 지금 자리를 지킨다.** 근거: 이 제안의 가치는 「같은 몸통이 여섯 벌」을 없애는 것이지 문구를 통일하는 것이 아니고, 문구 통일은 각 화면의 맥락(교사 화면인가 학생 화면인가)을 읽어야 하는 별개의 일이다. 다만 **네 문구를 나란히 놓고 한 번 읽어 보고**, 그중 명백히 틀린 것(예: 학생 화면에 교사용 안내)이 있으면 그것만 그 자리에서 고친다. 그리고 `firstIssue`는 pass의 「한글이 아니면 폴백」 판으로 올리거나 아예 추출하지 않는다 — 약한 판이 표준이 되면 안 된다.

---

### 결정 9 · 앱 오류 화면을 하나로 합칠 것인가, 그리고 남는 한 화면의 문구를 무엇으로 할 것인가?

관련 항목: `cx-core-app-03`

**왜 사람이 정해야 하나**

pass/error.tsx와 merit/error.tsx는 서로의 복사본이고 둘의 존재 근거인 「이 파일이 없으면 앱 셸까지 사라진다」는 전제가 틀렸다. 지우면 -96줄이고 클라이언트 오류 콘솔 기록이 앱 전체에 걸리지만, **사용자에게 보이는 문구가 바뀐다** — 「출입증을 불러오지 못했습니다」·「상벌점을 불러오지 못했습니다」가 「화면을 열지 못했습니다」가 된다. 그리고 합치는 순간 그 화면이 앱의 유일한 오류 화면이 되므로, 미처리 지적 shell-R03((app)/error.tsx:25가 교사에게도 「선생님께 알려 주세요」라고 말한다)을 여기서 함께 고치지 않으면 나중이 없다.

**선택지**

- 합친다 — 문구는 「화면을 열지 못했습니다」로 하고 shell-R03(역할별 안내)을 함께 고친다
- 합치되 문구를 다르게 정한다 — 사람이 한 줄을 직접 쓴다
- 합치지 않는다 — 두 화면의 모듈별 문구를 유지한다

**추천 — 합친다**

**합친다.** 근거: 두 화면이 덮는 것이 「그 모듈의 데이터를 못 불러온 경우」가 아니라 「그 경로에서 난 아무 오류」라, 지금 문구가 이미 정확하지 않다. 다만 **조건 둘을 지킨다** — (1) 지우고 나서 /pass와 /merit에서 실제로 오류를 내 사이드바·상단바가 남는지 눈으로 확인한다(지금 근거는 Next 문서뿐이고, 이 저장소는 next.config.ts 주석에 「실제로 확인했다」를 적는 기준을 갖고 있다), (2) 같은 김에 `(auth)/error.tsx`에도 같은 거짓 전제가 있는지 본다. 문구는 역할을 가려 적는다 — 교사에게 「선생님께 알려 주세요」는 말이 안 된다.

---

### 결정 10 · 학생이 만드는 학부모 초대코드에 90일 만료를 줄 것인가? (지금은 무조건 무기한이다)

관련 항목: `cx-comm-roster-11` · `dead-22`

**왜 사람이 정해야 하나**

제안이 「채택」으로 분류돼 있지만 **동작 변경**이다 — 지금 발급돼 있는 무기한 코드의 취급과, 앞으로 발급되는 코드가 90일 뒤 죽는다는 사실을 사람이 알아야 한다. 근거는 저장소 안에 이미 있다: `roster.service.ts:24-25`의 `INVITE_EXPIRES_DAYS` 주석이 「종이로 나눠주는 코드다. 무기한이면 잃어버린 종이가 영원히 유효하다」로 같은 값의 이유를 적어 두었다. Phase A의 「확정 1」이 이미 같은 파일의 학부모 초대 규칙 셋(한도 3→2·목록 모수·폐기 권한)을 바꾸므로 **그 뒤에 이어서 한 커밋으로** 한다.

**선택지**

- 90일을 준다 — 명단 반영이 쓰는 값과 같게
- 다른 기간을 준다 — 사람이 값을 정한다
- 무기한을 유지한다 — 대신 죽은 `expiresInDays` 필드만 지우고 무기한이 의도임을 주석에 적는다

**추천 — 90일을 준다**

**90일을 준다.** 근거: 학부모 코드도 학생이 종이·메신저로 건네는 코드라 잃어버린 코드가 영원히 유효한 위험이 명단 반영 코드와 똑같고, 저장소가 그 판단을 이미 한 번 내려 상수로 적어 두었다. 값을 나누지 말고 같은 상수를 쓴다. **세 번째 선택지를 고르더라도 죽은 필드는 지운다** — 스키마에 만료 인자가 있는데 아무도 안 넘기는 상태가 「무기한이 의도」와 「빠뜨린 것」을 구별할 수 없게 만드는 원인이다.

---

---

## 5. Phase A — 결함 49건 수정 (태스크 10개)

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

---

## 6. Phase B — 단순화·보안 정리 (7단계)

> **선행 조건: Phase A(§5)가 끝나고 머지돼 있어야 한다.** 아래는 그 전제 위에서만 성립한다.

권장 골격에서 **보안 조치를 마지막이 아니라 4단계로 올렸다.** 일곱 건이 전부 덧셈이고 각자 자기 테스트를 들고 오며 뒤 단계의 리팩터에 기대지 않는데, 뒤에 두면 IDOR 시도와 로그아웃이 기록 밖에 있는 상태가 프로그램 내내 유지된다.

### 1단계 — 죽은 코드 걷기 ① — 모듈·lib·core (운영 코드)

**-151줄 · 10건**

호출부가 하나도 없는 함수·인자·타입·오류 코드를 지운다. 성격이 달라 커밋을 나눈다: (a) datetime 함수 셋과 딸린 Intl 포맷터·probe 표(dead-02 — export와 probe를 반드시 같은 커밋에서 지운다. timezone 테스트가 「probe 표가 실제 export 목록을 덮는가」를 스스로 대조한다), (b) merit·pass의 여덟 조각(cx-merit-pass-05가 dead-03의 넷과 dead-21의 (1)(2)를 통째로 담는다 — 같은 일이므로 한 번만 한다), (c) transitionUnexpired의 `_observedAt` 인자(dead-04 — 통합 테스트 두 호출부와 `mock.calls[0]?.[3]`→`[2]` 인덱스까지 같은 커밋에서 고친다. 통합 테스트는 verify:unit에 안 잡혀 놓치면 `npm run verify`에서만 터진다), (d) auth-client를 `createAuthClient()` 한 줄로(dead-07), (e) 타입 별칭 넷(dead-09 — PostWithCounts의 JSDoc 6줄을 함께 처리하지 않으면 아래 countPosts의 엉뚱한 설명이 된다), (f) 화면 상태 필드 셋(dead-10), (g) 삼항·호스트 가지 둘(dead-12 — 조건대로 npm 스크립트 둘은 남긴다), (h) temp-password 인자·select 열(dead-22). **dead-22의 셋째 항목(createParentInviteSchema.expiresInDays)만 4단계로 미룬다** — 그 필드를 지우면 학부모 코드가 무기한으로 굳으므로 cx-comm-roster-11의 고정 만료와 한 커밋이어야 한다. dead-21의 셋째 항목(댓글 폼 reset)은 이 단계에서 하지 않는다 — 겹침 절 참조.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `dead-02` | 운영 호출부가 없는 datetime 함수 셋(formatKstDay·formatTimeInput·kstHour)과 전용 Intl 포맷터·테스트를 지운다 | -87 | 안전 |
| `cx-merit-pass-05` | 상벌점·출입증의 죽은 코드 여덟 조각을 지운다 | -30 | 안전 |
| `dead-03` | merit.repo·threshold.service의 죽은 함수·흡수되는 조건·안 읽는 select를 정리한다 | -20 | 안전 |
| `dead-09` | 선언만 있고 파일 안에서도 밖에서도 쓰이지 않는 타입 별칭 넷을 지운다 | -10 | 안전 |
| `dead-04` | 던져지지 않는 PASS_NOT_ACTIVE와 쓰이지 않는 transitionUnexpired의 _observedAt 인자를 지운다 | -8 | 안전 |
| `dead-10` | 채워지기만 하고 아무도 읽지 않는 화면 상태 필드 셋(targetId·isSelf·RuleRow.active)을 지운다 | -8 | 안전 |
| `dead-07` | 클라이언트 번들에서 도달할 수 없는 adminClient 플러그인과 안 쓰는 signIn·useSession 재수출을 뺀다 | -5 | 안전 |
| `dead-21` | 호출부가 먼저 걸러 도달할 수 없는 분기 셋(빈 목록 안내·중복 문서 주석·명시적 폼 리셋)을 지운다 | -5 | 테스트필요 |
| `dead-22` | 호출부가 없는 인자와 아무도 읽지 않는 select 열, 채워지지 않는 스키마 필드를 정리한다 | -3 | 안전 |
| `dead-12` | 거짓이 될 수 없는 삼항·참이 될 수 없는 호스트 가지·부르는 사람이 없는 npm 스크립트를 지운다 | 0 | 안전 |

**얻는 것** — **줄:** 약 -151. **개념:** 「이 함수는 왜 있나」를 물어야 하는 자리가 열 곳 없어진다 — 던져지지 않는 `PASS_NOT_ACTIVE`, 쓰이지 않는 만료 기준 인자, 흡수되는 조건, 아무 일도 하지 않는 필터. **위험:** 사실상 없다. 지우는 대상이 전부 호출부 0이고, 타입 검사가 잘못 지운 것을 그 자리에서 잡는다. 다만 dead-02·dead-04는 **주석과 테스트가 함께 죽는 자리**라 그것을 놓치면 「없는 함수를 가리키는 주석」이 새로 생긴다 — 각 제안의 조건이 그 자리를 이름으로 적어 두었으니 그대로 따른다. 부수 효과: 감사 죽은코드 44행 중 열여섯 행이 여기서 닫힌다.

**되돌리기** — 완전히 되돌릴 수 있다. 순수 삭제라 `git revert` 한 번이면 원상복구되고, 지운 것을 다시 쓰고 싶어지는 경우가 있어도 삭제 커밋에서 그대로 꺼내면 된다. 커밋을 (a)~(h)로 쪼개 두면 하나만 되돌릴 수도 있다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 2단계 — 죽은 코드 걷기 ② — 공용 UI·디자인 토큰·첨부 헤더

**-77줄 · 10건**

여러 제안이 같은 자리를 세 번씩 가리키는 구간이다. **한 번씩만 한다.** (a) 아이콘 셋·Badge tone 둘·SectionCard headerAlign·Select rows 갈래·EXTRA_TITLES의 /scan을 cx-core-app-04로 한 번에 지운다(dead-01·dead-06·dead-18은 그 부분집합이다). 조건 둘을 지킨다 — SlidersIcon 주석의 「사용자 관리가 톱니바퀴를 쓴다」는 거짓이므로(계정 관리는 UsersIcon이다) 근거를 재생산하지 말고 지우고, nav.ts:85의 「제목은 EXTRA_TITLES가 맡는다」 한 줄도 CLAUDE.md와 함께 고친다. (b) globals.css의 `--text-display` 셋과 `--color-green-press`를 지우되 **디자인 스펙 문서의 표 두 줄을 같은 커밋에서 지운다** — 표를 남기고 토큰만 지우는 것은 이미 한 번 실패한 수정을 세 번째로 반복하는 것이다(1f63660 도입 → 250268c 삭제 → 974914e 부활). 사람의 승인을 받고 시작한다. (c) 첨부 라우트가 응답에 직접 거는 CSP·nosniff를 지우고 「소유자는 next.config.ts의 ATTACHMENT_HEADERS다」 한 줄을 남기며, 같은 404를 내는 catch 둘을 합친다. **테스트를 지우지 말고 옮긴다** — next.config.ts의 headers()를 불러 첨부 규칙이 `default-src 'none'; sandbox`를 담고 전역 규칙 **뒤에** 오는지 단언한다. (d) PostPage.total 삭제는 「목록에 총 N건을 그릴 것인가」를 먼저 정한 뒤에만 한다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `cx-core-app-04` | 공용 UI·아이콘·nav의 죽은 코드 여섯 자리를 지운다 (아이콘 3개 · Badge tone 2개 · SectionCard headerAlign · Select rows 갈래 · EXTRA_TITLES의 /scan) | -60 | 안전 |
| `dead-01` | 쓰는 화면이 하나도 없는 아이콘 셋(ScanIcon·InviteIcon·SettingsIcon)을 지우고 SlidersIcon 주석을 사실에 맞춘다 | -38 | 안전 |
| `dead-06` | 호출부가 없는 UI prop 셋(SectionCard.headerAlign·Select.rows·Badge의 read·unread)을 지워 컴포넌트 분기를 줄인다 | -18 | 안전 |
| `cx-comm-roster-08` | 커뮤니티 죽은 코드 셋을 지운다 — 내려받기 라우트의 덮이는 헤더·PostPage.total·댓글 폼 reset() | -12 | 안전 |
| `dead-11` | 전역 headers()에 덮여 사라지는 첨부 라우트의 CSP·nosniff 줄과 반대로 적힌 주석을 지우고, 같은 응답을 내는 catch 둘을 합친다 | -8 | 안전 |
| `dead-18` | 읽는 코드가 없고 그 화면이 쓰는 제목과도 다른 EXTRA_TITLES의 /scan 항목을 지운다 | -6 | 안전 |
| `cx-core-app-06` | globals.css의 죽은 토큰을 지운다 — 쓰는 곳이 0곳인 --text-display 세 줄과 --color-green-press | -6 | 안전 |
| `dead-05` | globals.css의 @theme 토큰 중 실사용 0곳인 --text-display 3줄과 --color-green-press를 지운다 | -4 | 안전 |
| `cx-core-app-07` | 첨부 내려받기 라우트가 응답에 직접 거는 CSP 헤더는 전역 headers()에 덮여 한 번도 선 적이 없다 — 지우고 거짓 주석을 정정한다 | -4 | 테스트필요 |
| `dead-16` | 서비스가 계산해 돌려주지만 그리는 화면이 없는 PostPage.total을 지운다 | -3 | 안전 |

**얻는 것** — **줄:** 약 -77. **개념:** 컴포넌트 분기 넷(headerAlign 삼항·Select 목록형 갈래·Badge tone 둘·WITH_DOT 항목)이 사라져 공용 UI가 실제로 쓰이는 모양만 갖는다. **위험이 줄어드는 자리가 하나 있다** — 사용자가 올린 바이트가 나가는 유일한 경로의 CSP가 지금은 「라우트가 걸고 전역이 덮는」 상태이고 테스트는 라우트 쪽을 보고 있어 **운영에서 참인지를 아무것도 보증하지 않는다.** (c)가 끝나면 그 헤더에 진짜 검사가 붙는다. **재발 하나가 닫힌다** — `--text-display`는 감사 §6.2가 「고쳤다고 기록됐는데 코드에 다시 있는 것」으로 올린 두 건 중 하나다.

**되돌리기** — 코드는 `git revert` 한 번. **문서 표는 되돌리면 안 되는 쪽이다** — 코드와 스펙이 같이 움직여야 세 번째 부활이 막힌다. (c)의 테스트 이전은 되돌리면 검사가 사라지므로, 되돌릴 일이 생기면 라우트 헤더만 복구하고 next.config 테스트는 남긴다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 3단계 — 테스트 층 정리 — 픽스처를 한 벌로 모은다

**-305줄 · 2건**

tests/helpers/session.ts에 `user(role, id, over)` 하나, tests/helpers/core-mocks.ts에 `coreMocks(tag)` 하나를 두고 43개 파일의 복제를 지운다(tests-01). **`vi.mock(...)` 줄 자체는 각 파일에 남긴다** — 무엇을 목했는지가 파일 머리에서 보여야 한다. `txClient`에 파일별 `tag`를 넣는 관행도 유지한다(서비스가 prisma가 아니라 넘겨받은 tx로 썼는지를 단언하는 근거다). 조건 둘이 이 단계의 성패를 가른다: (1) `withTransaction`을 **두 모양으로** 내보낸다 — pass·community·merit 계열은 `vi.fn(async fn => fn(txClient))`로 미리 배선돼 있고 roster·registration·verification·enrollment·academic-year·admin-user는 맨 `vi.fn()`이라 테스트마다 구현을 갈아 끼운다. 한 모양으로 통일하면 후자가 조용히 다른 경로를 탄다. (2) repo 테스트의 `tx`(prisma 모델 목이 들어 있다)와 roster.service.test의 `recordAuditMany`·`auditEntries`는 범위 밖으로 둔다. 이어서 dead-19를 **조건이 남긴 범위로만** 한다 — 확실한 것은 merit/actions.test.ts:89의 고아 JSDoc 하나이고, merit.bulk-award:266-270은 지우지 말고 실재 파일 `src/app/(app)/merit/recent/page.tsx`를 가리키게 고치며, decision.service.test.ts의 목을 줄일 때 반대로 빠져 있는 둘(countStatusesForStudent·listEnrolledStudents)도 함께 다룬다. registration.repo의 학생코드 재시도 테스트는 **지우지 않는다**(분기가 실제로 살아 있다). award.service.test와 roster.service.test의 중복 쌍은 확인 전에는 손대지 않는다. 마지막으로 CLAUDE.md 「폴더 구조」에 `tests/helpers/` 예외 한 줄을 적는다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `tests-01` | tests/helpers/에 세션 사용자 픽스처와 core 목(recordAudit·withTransaction·txClient)을 모아 43개 파일의 복제를 지운다 | -300 | 테스트필요 |
| `dead-19` | 대상이 사라진 테스트 주석·존재하지 않는 파일 참조·중복 테스트·부르지 않는 함수의 목을 정리한다 | -20 | 테스트필요 |

**얻는 것** — **줄:** 약 -305(이 프로그램에서 한 단계가 내는 가장 큰 감소이고, 운영 코드는 한 줄도 안 바뀐다). **개념:** 세션 사용자 픽스처를 고칠 자리가 28곳에서 1곳이 되고, core 목을 고칠 자리가 29곳에서 1곳이 된다. **위험:** 낮지만 0은 아니다 — 43개 파일을 한 번에 건드리므로 **이 단계 뒤의 모든 리팩터가 이미 정리된 픽스처 위에서 돌아간다는 이득**과, 이 단계 자체가 뒤로 밀릴수록 리베이스 비용이 커진다는 손해가 맞물린다. 그래서 지우기 다음, 리팩터 앞에 둔다. 스위트 2,281건이 전부 초록이어야 하고, 하나라도 빨간불이면 그것은 (1)의 두 모양을 통일해 버린 자리다.

**되돌리기** — 되돌릴 수 있지만 **뒤 단계가 이 위에 쌓이면 비싸진다.** 그래서 이 단계는 한 PR로 열고 머지한 다음 4단계를 시작한다 — 43개 파일을 건드리는 커밋이 리뷰 대기 중에 다른 단계와 겹치면 충돌이 사람 손으로 감당이 안 된다. dead-19의 조건부 항목들은 확인 못 하면 그냥 안 하는 것이 정답이고, 그것이 이 단계에서 되돌릴 일을 가장 많이 줄인다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 4단계 — 감사로그·권한 구멍 메우기 (덧셈만 한다)

**+104줄 · 8건**

지금 기록 밖에 있는 경로 다섯과 판정 표 밖에 있는 경로 하나를 닫는다. **전부 덧셈이고 각자 자기 테스트를 함께 들고 온다.** (a) sec-05 — `sign-out`이 2xx면 `auth:logout`을 남긴다. `getSessionUser()`는 **반드시 핸들러 호출 전에** 부른다(쿠키가 지워지면 누구였는지 알 수 없다). 라벨 문구를 「완전한 세션 종료 기록」인 척하지 않게 좁힌다 — 만료로 죽는 세션과 비밀번호 변경이 쓸어 없애는 세션은 여전히 안 남는다. (b) sec-06 — 가입 직후 `signInSilently` 성공 갈래에 `auth:login`을 남긴다. 행위자 id는 `signInEmail` 응답에서 받고(서비스 시그니처를 건드리지 않는다), metadata는 `/login/submit`이 쓰는 마스킹 규칙에 맞춘다. (c) sec-03 — `getMyStudentQr`에 `assertCan(actor, "pass:request")`를 넣고, 거부 기록의 targetType을 **`"User"`로** 한다(assertCan을 앞에 세우면 그 아래에 닿는 것은 「STUDENT인데 프로필 행이 없는」 경우뿐이라 가리킬 StudentProfile이 존재하지 않는다). request.service.test.ts:486 describe에 「학생 아닌 역할은 프로필 조회 전에 막힌다」를 새로 넣는다 — 지금 테스트는 프로필이 null이라는 이유로만 통과해서 검사를 넣어도 안 넣어도 초록이다. (d) sec-04 — 미결 첨부의 소유권 거부에 `denyOwnership` 헬퍼를 두어 `authz:denied`를 남기고, 「남의 미결 첨부」와 「uploaderUserId가 null인 첨부」 두 케이스를 함께 단언한다. (e) sec-07 = cx-comm-roster-12(같은 일이다) — `previewRoster`에 `roster:preview`를 남긴다. **metadata에 이름·생년월일·학생코드를 절대 싣지 않는다.** 「아무것도 저장하지 않는다」와 「유일한 경로」 두 주석을 함께 고쳐 적는다. (f) cx-comm-roster-11 + dead-22(3) — 학부모 코드의 죽은 `expiresInDays`를 지우고 고정 90일 만료를 준다. (g) Phase A에서 넘어온 잔여 한 줄 — 고아 첨부 청소 감사로그의 metadata에 남의 고아(orphaned)를 구분한다. (h) sec-02(x-forwarded-for 마지막 항목)는 **사람이 승인하면** 여기서 다섯 조건을 한 커밋에 담아 한다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `cx-comm-roster-11` | 학생이 만드는 학부모 초대코드가 무조건 무기한인 것을 고친다 | +2 | 동작변화 |
| `sec-02` | 감사로그의 접속 IP를 x-forwarded-for의 **마지막** 항목에서 읽어, 덧붙임 모드 프록시에서의 위조를 닫는다 | +8 | 동작변화 |
| `sec-03` | `getMyStudentQr`에 `assertCan(actor, "pass:request")`를 넣어, pass 모듈에서 유일하게 권한 표 밖에 있는 발급 경로를 닫는다 | +10 | 테스트필요 |
| `sec-06` | 가입 직후 자동 로그인(`signInSilently`)이 만드는 세션도 감사로그에 남긴다 | +14 | 테스트필요 |
| `sec-04` | 미결 첨부의 소유권 거부에도 `authz:denied`를 남긴다 — 첨부 경로의 유일한 IDOR 시도가 기록 밖이다 | +20 | 안전 |
| `sec-07` | 명단 미리보기가 전교생 개인정보를 브라우저로 보내면서 기록을 안 남긴다 — `roster:preview`를 추가한다 | +20 | 안전 |
| `cx-comm-roster-12` | 명단 미리보기에도 내보내기와 같은 감사로그를 남긴다 | +20 | 안전 |
| `sec-05` | 로그아웃에 감사로그를 남긴다 — 세션이 사라지는 순간만 기록이 없다 | +30 | 테스트필요 |

**얻는 것** — **줄:** 약 +104. 이 프로그램에서 유일하게 늘어나는 단계이고, 늘어나는 것이 목적이다. **위험이 줄어드는 것이 이 단계의 전부다** — 첨부 경로의 유일한 IDOR 시도, 세션이 사라지는 순간, 계정의 첫 세션, 전교생 개인정보가 브라우저로 나가는 순간이 전부 기록 밖에 있다가 안으로 들어온다. 학생증 발급은 pass 모듈에서 유일하게 권한 표 밖에 있던 경로였다. **개념:** 「감사로그 예외는 bootstrap·verification 둘뿐」이라는 CLAUDE.md의 규칙이 실제로 참이 된다. **여기서 필연적으로 닫히는 재발 하나** — `auth:logout`·`roster:preview`를 등록하면 액션 수가 42에서 44가 되므로 `audit-log.labels.test.ts:67`의 하한 39를 실제 개수 바로 아래로 올리게 되고, 그것이 감사 §6.2의 나머지 한 건(adminops-2-R03)이다.

**되돌리기** — 덧셈이라 코드는 쉽게 되돌아간다. **다만 되돌리기가 완전하지 않은 자리가 하나 있다** — 새 액션(`auth:logout`·`roster:preview`)으로 감사로그 행이 쌓인 뒤에 액션을 없애면 라벨 없는 행이 화면에 영문 키로 남는다. 그래서 이 단계는 액션을 새로 만드는 두 건을 각각 독립 커밋으로 두고, 되돌릴 일이 생기면 코드만 되돌리고 라벨 표는 남긴다. (h) sec-02는 테스트가 못 박은 규약을 뒤집으므로 반드시 단독 커밋이다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 5단계 — DB 접기 — 되돌리기 어려운 유일한 단계

**-86줄 · 7건**

싼 것부터 네 커밋. (a) db-02 — 「다음 migrate dev가 AcademicYear_single_current를 DROP한다」는 경고를 다섯 곳에서 걷고, 남길 사실 한 줄로 줄인다(Prisma 7.9.1에서 재현되지 않음을 확인했고, **메이저 업그레이드 때 다시 확인한다**를 함께 적는다). `setCurrent`의 잠금 순서 근거와 `FOR UPDATE` 설명은 그대로 둔다 — DROP 여부와 무관한 논거다. `plans/**`·`specs/**`의 같은 문구는 그때의 기록이므로 건드리지 않는다. (b) db-07 — 질의가 한 번도 닿지 않는 인덱스 넷을 지운다(앞의 둘은 접두사 중복, 뒤의 둘은 그 컬럼 하나로 좁히는 질의가 없다). (c) db-05 = cx-comm-roster-06 ⊃ dead-14 — 커뮤니티 삭제 표시 넷과 `Invite.usedAt`을 지운다. **기존 마이그레이션을 고쳐 「접지」 않는다** — 20개가 쌓여 있고 테스트 서버에 적용된 DB가 있어 체크섬이 깨지면 `prisma migrate deploy`가 그 자리에서 멈춘다. DROP COLUMN 마이그레이션을 새로 만들고 생성된 SQL을 눈으로 확인한다. 제안 목록에 없는 `roster.repo.apply-roster.integration.test.ts:125`의 `usedAt` 픽스처와 `registration.atomicity...:142`의 단언을 함께 고친다. (d) db-04 — `Invite.createdBy`를 Restrict에서 SetNull + `createdByName` 스냅샷으로 바꾼다. 백필 순서를 지킨다: ADD COLUMN → UPDATE로 이름 채우기 → 남은 행에 '(알 수 없음)' → SET NOT NULL. `usedById` deleteMany는 **남긴다**(metadata의 PII를 지우는 별개 근거다). (e) db-03 — **사람이 승인해야 시작한다.** `SchoolClass`를 없애고 grade·classNo를 Enrollment 컬럼으로 인라인한다. 백필 마이그레이션을 함께 쓰고(UPDATE로 값을 옮긴 뒤 classId를 떨어뜨리고 새 유니크를 건다), 변경 **전에** merit.removed-student·pass.list-window·roster 계열 통합 테스트로 기준선을 잡는다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `db-03` | SchoolClass 테이블을 없애고 grade·classNo를 Enrollment 컬럼으로 인라인한다 | -35 | 테스트필요 |
| `db-02` | 「다음 migrate dev가 AcademicYear_single_current를 DROP한다」는 경고를 다섯 곳에서 걷는다 — Prisma 7.9.1에서 재현되지 않는다 | -24 | 안전 |
| `cx-comm-roster-06` | 글·댓글의 deletedByUserId·deletedReason 네 열을 지운다 — 쓰기만 하고 읽는 곳이 없다 | -20 | 테스트필요 |
| `db-05` | 쓰기만 하고 아무도 읽지 않는 컬럼 5개를 지운다 — 커뮤니티 삭제 표시 4개와 Invite.usedAt | -17 | 테스트필요 |
| `db-04` | Invite.createdBy를 Restrict에서 SetNull + createdByName 스냅샷으로 바꿔 스키마의 나머지 스무 곳과 규약을 맞춘다 | -6 | 동작변화 |
| `db-07` | 질의가 한 번도 닿지 않는 인덱스 4개를 지운다 | -4 | 안전 |
| `dead-14` | 쓰기만 하고 읽는 곳이 없는 커뮤니티 삭제 메타 컬럼(deletedByUserId·deletedReason)을 스키마에서 지운다 | -4 | 테스트필요 |

**얻는 것** — **줄:** 약 -86. **개념:** 지금 스키마가 스스로 세운 규약(「과거의 사실이 살아 있는 외래키에 기대면 안 된다 — 이름 스냅샷을 남긴다」)을 혼자 어기는 자리 둘이 없어진다 — Invite.createdBy의 Restrict와 커뮤니티 삭제 메타 넷. (e)까지 가면 `schoolClass.upsert` 블록 넷과 조인 select 15곳이 사라지고 테이블이 하나 준다. **위험:** 이 프로그램에서 가장 크다. (c)(d)(e)가 전부 이미 데이터가 있는 DB(로컬 dev·gbsw_test·운영 중인 테스트 서버)에 적용된다. 대신 얻는 것도 크다 — (d)는 교사 계정을 지워도 그가 발급한 PENDING 초대가 살아남게 만들고, 그것이 Phase A Task 2가 스크립트로 우회했던 `data-R01`의 뿌리다.

**되돌리기** — **되돌리기 어려운 유일한 단계다.** (a)는 문서·주석이라 자유롭고 (b)는 인덱스라 다시 만들면 그만이지만, (c)의 DROP COLUMN과 (e)의 테이블 삭제는 **적용된 순간 그 컬럼의 데이터가 사라진다**(커뮤니티 삭제 사유·삭제자, Invite.usedAt 시각). revert는 컬럼을 되살릴 뿐 값을 되살리지 못한다. 그래서 (c)(e)는 각각 사람의 승인 뒤에 시작하고, 시작 전에 테스트 서버 DB 덤프를 뜬다(첨부 볼륨은 별도다 — docs/deploy.md). (d)는 백필이 끝난 뒤라면 되돌려도 데이터가 안 사라진다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 6단계 — 모듈 리팩터링 — 상벌점 통계·커뮤니티 첨부·명단 조회

**-139줄 · 10건**

Phase A가 친 그물 위에서만 한다. **순서가 강제된다.** (a) cx-merit-pass-02 — `classSummaries`(77줄)를 지우고 `listClassRoster` 결과를 반별로 접는 순수 함수로 바꾼다. 조건 둘이 조용한 회귀를 가른다: `getRankingStats`는 scope가 있어도 roster를 **무범위로** 부르고 학생만 걸러야 하며(범위를 준 roster를 접으면 반 순위가 한 줄로 무너져 rank가 늘 1이 된다), `avgNet` 반올림을 그대로 옮겨야 한다(rankClasses가 avgNet 동점으로 등수를 가른다). 제안이 빠뜨린 테스트 다섯 파일을 함께 고치고, **Phase A가 classSummaries에 새로 붙인 단언들을 `foldClasses`로 옮긴다 — 함수와 함께 죽게 두지 않는다.** (b) cx-merit-pass-03 — topRules와 ruleStats를 `awardsByRule` 하나로 합치고 currentRuleNames를 지운다. 두 호출부의 모집단은 지금 그대로 둔다. (c) cx-merit-pass-01 — **사람이 「모집단을 통일한다」를 고른 경우에만** 한다(§4 결정 1 참조). `trackTotalsBetween`과 `unusedRules`는 조건대로 제외한다. (d) cx-merit-pass-08 — `LIVE_STATUSES`를 pass-type.ts로 모으되 **decision.service의 CANCELLABLE은 제 이름·제 주석으로 남긴다**(「아직 안 끝난 상태」와 「취소할 수 있는 상태」는 오늘 값이 같을 뿐 다른 개념이고, 묶으면 취소 정책을 바꾸는 날 findOverlapping의 겹침 검사가 함께 흔들린다). (e) cx-merit-pass-09 — 통계 페이지의 네 갈래를 갈래표로 접는다. **포기 조건:** 제네릭이 `any`·캐스트 없이 갈래별 prop 타입을 이어 주지 못하면 지금의 명시 분기가 낫다. (f) cx-comm-roster-07 — 첨부 대조 산수를 attachToPost 조건 하나로 접는다. **먼저 다섯 갈래 테스트를 채운다**(그대로 둔 첨부만·새로 추가·일부 제거·고아 정리가 지운 id 섞임·남의 첨부 id). `attachmentsAdded`의 뜻이 바뀌는지 명시적으로 정한다. Postgres에서 updateMany가 같은 값 갱신도 count에 넣는지 통합 테스트로 확인한다 — 개수 비교가 그 성질에 통째로 기댄다. (g) cx-comm-roster-05 ⊃ dead-17 — `listForExport`를 새로 두어 내보내기 전용 전교 스캔을 명단 조회에서 빼고, 늘 false인 `deleted` 필드를 지운다. `createRosterFingerprint`의 출력이 변하지 않음을 확인한다 — 미리보기 토큰이 깨지면 진행 중이던 모든 확정이 실패한다. (h) dead-20 = cx-comm-roster-13 — 2000줄 상한을 roster.schema.ts에 두고 roster.parse.ts가 import한다(반대 방향은 순환 import다). `confirmedDeletionIdsSchema`는 다른 수량이므로 묶지 않는다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `cx-merit-pass-02` | classSummaries를 지우고 listClassRoster 결과를 반별로 접는 순수 함수로 바꾼다 | -45 | 테스트필요 |
| `cx-merit-pass-03` | topRules와 ruleStats를 규정별 집계 하나로 합치고 currentRuleNames를 지운다 | -35 | 테스트필요 |
| `cx-merit-pass-09` | 통계 페이지의 네 갈래 분기를 갈래표 하나로 접는다 | -35 | 테스트필요 |
| `dead-17` | 조회 단계에서 이미 걸러져 늘 false인 ExistingStudent.deleted와 그것으로 아무도 못 거르는 내보내기 필터를 지운다 | -14 | 안전 |
| `cx-merit-pass-01` | 통계 집계 9개가 각자 조립하는 where를 activeAwardWhere(scope) 하나로 모은다 | -10 | 테스트필요 |
| `cx-comm-roster-07` | 글 수정의 첨부 대조(kept·existingIds 산수)를 attachToPost 조건 하나로 접는다 | -8 | 테스트필요 |
| `cx-comm-roster-05` | 명단 조회(listExisting)에서 내보내기 전용 전교 스캔과 늘 false인 deleted 필드를 뺀다 | 0 | 테스트필요 |
| `cx-comm-roster-13` | 명단 2000줄 상한이 두 파일에 따로 박힌 것을 한 곳으로 모은다 | 0 | 안전 |
| `dead-20` | 두 파일에 따로 박힌 명단 2000줄 상한을 상수 하나로 모은다 | +2 | 안전 |
| `cx-merit-pass-08` | 출입증 상태 집합을 pass-type.ts 한 곳으로 모은다 | +4 | 안전 |

**얻는 것** — **줄:** 약 -139. **개념:** merit.repo에서 where를 각자 조립하던 자리가 줄고, 같은 집계를 두 함수가 각각 하던 짝(topRules/ruleStats)이 하나가 되며, 통계 화면의 질의가 네 개에서 두 개로 준다. 출입증 상태 집합이 네 군데 리터럴에서 한 곳으로 모인다. **부수로 닫히는 결함 둘:** `merit-3-C05`(getRankingStats의 classesPromise가 앞 조회 실패 시 처리되지 않은 거부로 남는다)는 classSummaries가 사라지면서 함께 사라지고, `roster-2-R08`(내보내기 전용 참고 열 조회가 학년도 잠금 안에서 돈다)은 (g)가 그 조회를 잠금 밖으로 옮기면서 닫힌다. **위험:** 조용한 회귀가 가장 잘 나는 단계다 — (a)의 반올림·무범위 호출, (f)의 updateMany count 성질이 그렇다. 그래서 셋 다 제안의 조건이 검사할 자리를 이름으로 적어 두었다.

**되돌리기** — `git revert`로 되돌아간다(스키마를 안 건드린다). 다만 (a)와 (b)가 여섯 테스트 파일을 함께 고치므로 충돌 비용이 있다 — 항목마다 커밋을 하나로 두고, (a)→(b)→(c)의 순서를 지킨다. (c)와 (e)는 **하지 않는 것이 정당한 결말인 항목이다** — (c)는 사람이 모집단 통일을 거절하면 하지 않고, (e)는 타입이 안 이어지면 명시 분기를 남기는 것이 제안 자신의 판단이다. 포기가 실패가 아니라는 것을 커밋 메시지에 적는다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

### 7단계 — 화면·공용 계층 합치기 — 가장 큰 감소, 가장 얇은 그물

**-238줄 · 4건**

네 항목이고 **전부 자기 그물을 스스로 쳐야 한다.** (a) cx-core-app-02 — sidebar와 mobile-nav가 따로 그리는 메뉴 나무를 nav-tree.tsx 하나로 합친다. 실제로 다른 것은 둘뿐이므로 그 둘만 prop으로 받는다(density, expand). **합치기 전에 렌더 테스트 셋을 넣는다** — 「서랍은 펼친 채로 뜬다」·「사이드바는 묶음 밖에서 접힌 채 뜨고 들어가면 펴진다」·「서랍은 pathname이 바뀌면 다시 편다」. 지금 두 파일에 렌더 테스트가 하나도 없고(nav.test.ts는 순수 함수만 본다), drawer 주석이 적어 둔 사고(사이드바를 베껴 useState(inGroup)으로 시작해 폰에서 접힌 채 떴다)가 정확히 검사 없는 병합이 되살릴 것이다. ChevronDown을 세 번째 사본으로 만들지 말고 icons.tsx의 것을 size={14}로 쓴다. 로고·계정 블록은 이번 범위 밖이다. (b) cx-core-app-03 — pass/error.tsx와 merit/error.tsx를 지우고 (app)/error.tsx 하나로 만들며 `console.error`를 그리로 올린다. **문구를 사람이 정한 뒤에** 한다. 지우고 나서 /pass와 /merit에서 실제로 오류를 내 앱 셸이 남는지 눈으로 확인한다 — 지금 근거는 Next 문서뿐이고, 이 저장소는 next.config.ts 주석에 「실제로 확인했다」를 적는 기준을 갖고 있다. (c) cx-core-app-01 — 액션 여섯 개가 복사해 둔 `toMessage`·`text`·`firstIssue`를 src/lib/action-message.ts로 모은다. **MESSAGES 사전은 지금 자리에 그대로 둔다**(문구는 모듈마다 다르고 그것이 액션의 일이다 — CLAUDE.md 오류 규약이 그대로 지켜진다). pass·merit의 `toState`는 갈래가 더 있어 옮기지 않는다. `firstIssue`는 pass의 「한글이 아니면 폴백」 판으로 올리거나 아예 추출하지 않는다 — 약한 판을 표준으로 만들지 않는다. (d) cx-core-app-08 — SkeletonTable에 titleWidth·controls를 주고, **rowHeight prop을 만들지 말고 기본 행 높이를 table.tsx의 실제 규격(py-2.5 + text-sm ≈ 41px)에 맞춰 한 번만 고친다.** admin/logs는 한 줄로 접히지 않는다(rows는 10이고 머리글에 SkeletonTabs·SkeletonField가 들어간다) — controls로 옮기되 「동작 필터는 두 줄까지 간다」 주석을 함께 옮긴다. merit/rules/loading.tsx의 손으로 적은 카드 클래스를 `cardClass("panel")`로 바꾼다.

| 항목 | 무엇 | 줄 | 위험 |
|---|---|---:|---|
| `cx-core-app-03` | pass/error.tsx와 merit/error.tsx는 서로의 복사본이자 (app)/error.tsx가 이미 덮는 자리다 — 둘을 지우고 앱 오류 화면을 하나로 만든다 | -96 | 동작변화 |
| `cx-core-app-02` | sidebar.tsx와 mobile-nav.tsx가 따로 그리는 메뉴 나무(Rail·ChevronDown·잎 링크·펼침 묶음)를 인자 둘 받는 공용 컴포넌트 하나로 합친다 | -95 | 테스트필요 |
| `cx-core-app-01` | 서버 액션 열 개가 저마다 복사해 둔 「오류→화면 문구」 껍데기(toMessage·messageFor·text·firstIssue)를 공용 파일 하나로 모은다 | -35 | 동작변화 |
| `cx-core-app-08` | SkeletonTable에 제목 폭·행 높이·머리글 조작부 인자를 주고, loading.tsx 네 곳이 손으로 다시 그린 「머리글 띠 + 표」 뼈대를 그것으로 접는다 | -12 | 테스트필요 |

**얻는 것** — **줄:** 약 -238(단일 단계로는 tests-01 다음으로 크다). **개념:** 메뉴 나무를 고칠 자리가 둘에서 하나가 되고, 앱 오류 화면이 셋에서 하나가 되며(클라이언트 오류 콘솔 기록이 상벌점·출입증뿐 아니라 앱 전체에 걸린다), 「오류→화면 문구」 껍데기가 여섯 벌에서 한 벌이 된다. 뼈대 숫자를 화면마다 어림잡던 자리가 컴포넌트로 들어간다. **위험:** 그물이 가장 얇은 단계다 — (a)와 (b)에는 지금 테스트가 없고 (b)는 브라우저 확인이 필요하다. 그래서 마지막에 두고, 각 항목의 첫 커밋이 테스트나 눈 확인이다. **함께 처리되는 미처리 지적 둘:** shell-R03((app)/error.tsx가 교사에게도 「선생님께 알려 주세요」라고 말한다)은 (b)가 앱 전체의 유일한 오류 화면을 만드는 순간 「나중」이 없어지므로 그 자리에서 함께 고치고, ui-2-R07(SkeletonTable에는 「불러오는 중」 알림이 없고 SkeletonRows에는 있다)은 (d)로 접기 전에 어느 쪽이 알릴지 정한다 — 나중에 고치면 접힌 세 화면을 다시 열어야 한다.

**되돌리기** — 전부 `git revert`로 되돌아간다. **되돌아가지 않는 것은 (b)의 문구다** — 「출입증을 불러오지 못했습니다」·「상벌점을 불러오지 못했습니다」가 「화면을 열지 못했습니다」로 바뀌는 것이 사용자에게 보이는 유일한 변화이고, 코드를 되돌려도 그 판단은 다시 해야 한다. 그래서 문구를 먼저 정하고 시작한다. (a)는 넣은 렌더 테스트를 남긴 채로 병합만 되돌릴 수 있고, 그러면 테스트가 두 파일을 계속 지킨다 — 되돌리더라도 이득이 남는 유일한 항목이다.

- [ ] 단계 완료 · `npm run verify` 통과 · PR 머지

---

---

## 7. 흡수·제외

조사가 낸 54건이 단계에 그대로 다 들어가지는 않는다. 조용히 떨어뜨리지 않기 위해 적어 둔다.

- **`sec-01`**(sign-in/email 화이트리스트) — **수정 배치의 `auth-1-R02`와 같은 일이다.** Phase A Task 3에서 처리되므로 이 프로그램에서는 다시 하지 않는다.
- **`cx-comm-roster-10`**(고아 첨부 청소 감사로그) — **수정 배치 「결정 3」이 이미 정한 일이다.** Phase A에서 처리된다. 다만 metadata에 남의 고아 첨부를 구분하는 한 줄(`orphaned`)만 남으므로 그것을 4단계로 넘긴다.
- **`cx-comm-roster-02`**(가입 인증 발송 켜기, +120줄) — **Phase B 밖이다.** 정리가 아니라 운영자 승인이 필요한 기능 작업이라 결정 5에서 따로 다룬다.

**직전 감사의 낮음 353건 중 이 프로그램이 흡수하는 것:** 죽은코드 계열(1·2단계)과 일부 정합성·디자인 항목이다. 흡수되지 않은 낮음은 감사 문서 §5에 그대로 남는다 — 두 문서가 어긋나지 않도록, 이 프로그램을 끝낸 뒤 감사 문서의 낮음 목록에서 처리된 것을 처리 기록에 적는다.

---

## 8. 마무리

### 단계마다
- [ ] `npm run verify` 통과 (Postgres 필요 — `npm run db:up`)
- [ ] 커밋은 논리 단위마다. Conventional Commits + 한글 제목. **Claude/AI/Codex 귀속 트레일러를 넣지 않는다**
- [ ] PR 하나. 브랜치는 `fix/<날짜>-<이름>`. 코드 수정은 브랜치→PR이고, 문서만 main에 직접 올라간다
- [ ] **Phase B 3단계(43개 파일)와 7단계(충돌 큼)는 머지한 다음 다음 단계를 시작한다**

### Phase A가 끝나면
- [ ] 처리 기록 — `docs/reviews/<날짜>-vertical-fix-batch.md`. 지난 배치의 [`2026-09-01-fix-batch.md`](../../reviews/2026-09-01-fix-batch.md)가 본보기다. **감사 문서가 아니라 처리 기록이다** — 무엇을 고쳤나 · 고치면서 드러난 것 · 남긴 것과 그 이유
- [ ] **테스트를 조이다 빨간불이 난 자리**가 있으면 그것이 이 배치의 가장 큰 소득이므로 따로 절을 둔다

### Phase B가 끝나면
- [ ] 처리 기록 — `docs/reviews/<날짜>-simplification-batch.md`
- [ ] **줄 수 실측을 적는다** — -879는 구현 전 추정치이고 6·7단계에 포기 조건이 달려 있어 실현되는 수는 더 작을 수 있다
- [ ] 감사 문서 §5의 낮음 목록 중 이 프로그램이 흡수해 처리된 것을 처리 기록에 적는다 (두 문서가 어긋나지 않게)

### 둘 다
- [ ] **근거 문서(`docs/reviews/`의 감사·조사)는 고치지 않는다.** 스냅샷이다 — 「이후 코드가 바뀌어도 고쳐 쓰지 않는다」(`docs/reviews/README.md`)
- [ ] `docs/reviews/README.md` 표에서 해당 줄의 「지금 상태」 칸을 갱신한다

---

## 9. 포기 조건

두 단계는 시작해 보고 아니면 접는다. 미리 적어 두지 않으면 「이미 반쯤 했으니」로 밀고 나가게 된다.

- **7단계 (a) 메뉴 나무 합치기** — 렌더 테스트 셋(서랍은 펼친 채로 뜬다 · 최장일치로 하나만 켜진다 · 역할별 항목)이 **먼저 초록이 되지 않으면 시작하지 않는다.**
- **7단계 통계 페이지 갈래표** — 제네릭이 `any` 없이 이어지지 않으면 **지금의 명시 분기가 낫다.** 접는다.
- **6단계 (a)(b)** — Phase A의 테스트 강화 20건이 머지되지 않았으면 시작하지 않는다.

---

## 10. 이 계획이 다루지 않는 것

- **낮음 353건**(감사 문서 §5). 그중 **테스트 97건은 성격이 다르다** — 결함이 아니라 「지금 초록불이 아무것도 안 지킨다」는 것이라, 고치면 그 자리에서 회귀가 잡히기 시작한다. 낮음 중에서는 이쪽이 값이 크다.
- **`shell-C03`의 보류를 재심할 것인가**(감사 문서 §6.1). 2026-08-25 감사가 「그 상태에 도달할 경로가 없다」로 기각했는데 그 근거가 이후 무너졌다. 낮음이라 이번 배치 밖이다.
- **`--text-display` 토큰**(§6.2). 문서 두 곳이 삭제됐다고 적는데 `globals.css:75`에 살아 있고 쓰는 곳은 0곳이다.
- **학부모 대시보드에만 「새 글」 카드가 없는 것**(`shell-R05`, 낮음)이 의도인지.
