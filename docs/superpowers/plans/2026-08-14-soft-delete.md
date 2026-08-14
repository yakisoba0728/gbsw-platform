# 소프트 삭제 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 명단 파일에서 줄이 빠져도 학적·상벌점 기록이 사라지지 않게 한다. 진짜 삭제는 사용자 상세에서 한 명씩만.

**Architecture:** `User.deletedAt`을 두고 명단 반영은 그것만 찍는다(소프트 삭제). 계정은 비활성·로그인 차단이지만 학적·소속·감사로그는 그대로 남아 조회된다. 되돌릴 수 없는 하드 삭제는 명단 경로에서 떼어내 사용자 상세의 명시적 버튼으로 옮긴다.

**Tech Stack:** Prisma 7.9 + `@prisma/adapter-pg`, PostgreSQL 18, Next.js 16, zod 4, vitest 4.

## 결정 사항 (이미 확정됨 — 바꾸지 마라)

- **명단에서 줄이 빠지면 → 소프트 삭제.** 기록은 남는다.
- **하드 삭제는 오등록 정리용**으로만 남기고, 그때는 상벌점도 함께 지운다(`onDelete: Cascade`).
  상벌점 모듈은 나중에 `StudentProfile.id`를 `Cascade`로 참조한다 — 소프트 삭제가 기본 경로이므로
  Cascade는 명시적 하드 삭제에서만 발동한다.

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`
- 계층: `Route/Server Action → Service → Repo`. **repo에는 Prisma 호출만.**
- 권한 검사는 `core/authz/errors.ts`의 `assertCan(actor, action)`을 쓴다 (거부 감사로그를 함께 남긴다).
- 감사로그에는 값이 아니라 항목 이름/건수만.
- 오류 규약: 서비스는 **코드**를 `message`에 담고 액션의 `MESSAGES` 사전이 문구로 옮긴다 (CLAUDE.md "오류 규약").
- **스키마를 바꿨으면 `next dev`를 재시작한다** (`.next`도 지운다).
- 각 태스크 끝에 `npm run verify` 통과. 마지막은 `npm run build`도. **lint 경고 0.**
- 주석·커밋 메시지는 한국어로, "왜"를 적는다.

---

### Task 1: 소프트 삭제 모델과 조회 제외

**Files:**
- Modify: `prisma/schema.prisma`, 새 마이그레이션
- Modify: `src/core/auth/auth.ts`, `src/core/auth/session.ts`
- Modify: `src/modules/admin-users/admin-user.repo.ts`, `src/modules/enrollment/enrollment.repo.ts`, `src/modules/enrollment/roster.repo.ts`, `src/modules/invites/invite.repo.ts`

**Interfaces:**
- `User.deletedAt DateTime?` — null이면 살아 있는 계정

- [x] **Step 1: 스키마**

`User`에 추가한다. `status`와 **직교**한다 — `status`는 활성/비활성, `deletedAt`은 명단에서 빠졌는지다. 한 컬럼에 섞지 않는 이유: 비활성 계정을 다시 활성화하는 것과, 삭제된 계정을 되살리는 것은 다른 일이다.

```prisma
  /// 명단에서 빠진 계정. null이면 살아 있다.
  /// 소프트 삭제 — 학적·소속·감사로그는 그대로 두고 목록·로그인에서만 제외한다.
  /// 진짜 삭제(오등록 정리)는 사용자 상세에서 한 명씩 하며 그때는 행이 사라진다.
  deletedAt DateTime?
```

`@@index([deletedAt])`도 함께 둔다 — 거의 모든 목록 조회가 이 조건으로 거른다.

- [x] **Step 2: 마이그레이션**

`npx prisma migrate dev --create-only --name user_soft_delete` 후 SQL을 확인한다. 컬럼 추가뿐이라 손볼 게 없으면 그대로 적용한다. 적용 후 `npx prisma generate`.

- [x] **Step 3: 로그인을 막는다**

`src/core/auth/auth.ts`의 `databaseHooks.session.create.before`가 이미 `status`를 검사한다. **`deletedAt`도 함께 검사해라.** 여기를 빠뜨리면 삭제된 계정이 비밀번호로 돌아온다 — C1에서 고친 것과 정확히 같은 구멍이다.

`src/core/auth/session.ts`의 `requireAuth()`도 같이 막는다 (defense-in-depth).

- [x] **Step 4: 목록에서 제외한다**

아래 조회에 `deletedAt: null` 조건을 넣어라. **각각 왜 제외하는지 주석 한 줄씩 남겨라.**

| 파일 | 함수 | 이유 |
|---|---|---|
| `admin-users/admin-user.repo.ts` | `listUsers` | 사용자 관리 목록 |
| `enrollment/enrollment.repo.ts` | `listByYear` | 학생 표 |
| `enrollment/roster.repo.ts` | `listExisting` | 명단 내보내기·매칭 — **삭제된 학생이 다시 나오면 안 된다** |
| `invites/invite.repo.ts` | `listStudents` | 학부모 코드 발급 시 학생 선택 |

> **구현 시 이 표에서 벗어난 지점 (2026-08-14 실행):** `roster.repo.listExisting`의
> WHERE 절에는 `deletedAt: null`을 넣지 않았다. 그 필터를 그대로 넣으면 명단
> 반영의 매칭(byCode)도 함께 걸러져, 소프트 삭제된 학생이 원래 studentCode를
> 그대로 들고 명단에 돌아와도 "명단에 없는 학생코드"로 막힌다 — Step 5가 상세
> 화면의 활성화 버튼을 없애기로 했으므로 명단 재삽입이 되살리는 유일한 경로인데,
> 그 경로 자체가 막히는 셈이다("다시 넣으면 돌아온다"가 Task 2의 존재 이유임과
> 정면으로 충돌). 대신 select에 `deletedAt`을 추가해 `ExistingStudent.deleted`
> 플래그로 노출하고, `planRoster()`가 `missingFromFile`·`totalStudents` 계산에서만
> 이미 삭제된 학생을 뺀다(매칭은 그대로 통과). `exportRoster()`는 이 플래그로
> 별도로 걸러 삭제된 학생이 내려받는 파일에 나오지 않게 한다. 표의 "이유" 칸이
> 말하는 목표(삭제된 학생이 다시 나오면 안 된다)는 그대로 달성하되, WHERE 절
> 대신 다른 층에서 구현한 것이다.

**제외하지 않는 곳 (그대로 둬라):**
- `admin-user.repo.findDetail`·`findById` — 상세는 보여야 한다(아래 Step 5). 조회 자체는 막지 않는다.
- `audit.ts`의 `actorName` 조회 — 삭제된 사람의 과거 기록에도 이름이 나와야 한다.
- `bootstrap.repo.countUsers` — **절대 건드리지 마라.** 전원이 소프트 삭제되면 부트스트랩이 다시 열려 아무나 관리자를 만들 수 있게 된다.
- `registration.repo.emailExists` — 아래 Step 6 참고.

- [x] **Step 5: 상세 화면에 "삭제됨"을 표시한다**

`src/app/(app)/admin/users/[userId]/page.tsx`가 `deletedAt`이 있으면 배지로 알린다 (`Badge tone="rejected"`, 문구 "삭제됨"). 삭제된 계정에는 정보 수정·비밀번호 초기화·활성화 폼을 **감춰라** — 이미 명단에서 빠진 계정을 고치는 건 의미가 없다.

- [x] **Step 6: 이메일 재사용 문제를 문서로 남긴다**

`User.email`이 `@unique`라 **소프트 삭제된 계정이 그 이메일을 계속 점유한다.** 전출했다 돌아온 학생이 같은 이메일로 재가입하려면 하드 삭제하거나 다른 이메일을 써야 한다.

`registration.repo.emailExists`에 `deletedAt: null`을 넣으면 안 된다 — 그러면 가입은 통과하고 DB 유일 제약에서 터진다. **그대로 두고**, 이 제약을 `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`에 한 줄 적어라.

- [x] **Step 7: 테스트와 커밋**

세션 훅이 `deletedAt`을 막는지, 네 조회가 삭제된 계정을 빼는지 회귀 테스트를 붙여라.

```bash
npm run verify
git add prisma src/core src/modules "src/app/(app)/admin/users" docs
git commit -m "feat(user): 소프트 삭제 표시와 조회 제외

명단에서 줄이 빠졌을 때 계정을 지우는 대신 표시만 남기기 위한 바탕이다.
학적·소속·감사로그를 그대로 두면서 목록과 로그인에서만 뺀다.

status와 직교하는 별도 컬럼을 쓴다 — 비활성 계정을 다시 켜는 것과 삭제된 계정을
되살리는 것은 다른 일이라 한 컬럼에 섞으면 구분이 사라진다.

세션 생성 훅에서도 막는다. 여기를 빠뜨리면 삭제된 계정이 비밀번호로 돌아온다."
```

---

### Task 2: 명단 반영을 소프트 삭제로

**Files:**
- Modify: `src/modules/enrollment/roster.repo.ts`, `roster.service.ts`
- Modify: `src/app/(app)/admin/students/import/import-form.tsx`
- Modify: `tests/modules/enrollment/roster.{repo,service}.test.ts`, `tests/integration/roster.repo.apply-roster.integration.test.ts`

- [x] **Step 1: repo가 지우지 말고 표시하게 한다**

`roster.repo.ts`의 삭제 블록(지금 `tx.invite.deleteMany` → `tx.user.deleteMany`)을 아래로 바꾼다.

```ts
// 명단에서 빠진 학생은 지우지 않고 표시만 한다. 학적·소속·상벌점 기록이
// 스프레드시트 행 하나로 사라지면 안 된다 — 학교생활기록부의 기재 근거다.
// 진짜 삭제는 사용자 상세에서 한 명씩만 한다.
await tx.user.updateMany({
  where: { id: { in: deleteUserIds } },
  data: { deletedAt: new Date(), status: "INACTIVE" },
});
await tx.session.deleteMany({ where: { userId: { in: deleteUserIds } } });
```

**초대코드는 어떻게 하나:** 아직 안 쓴 초대코드는 폐기해야 한다(그 학생은 더 이상 학교 소속이 아니다). 지우지 말고 `status: "REVOKED"`로 바꿔라 — 기록이 남아야 "왜 이 코드가 죽었지"에 답할 수 있다.

**Enrollment는 건드리지 마라.** 그 학년도 배정은 `deleteMany({ where: { year, ... } })`가 이미 지우고 새로 넣는 구조인데, 삭제된 학생은 명단에 없으므로 재삽입 대상이 아니라 자연히 그 학년도 배정이 없어진다. **지난 학년도 배정은 그대로 남아야 한다** — 그게 이번 변경의 핵심이다.

- [x] **Step 2: 감사 액션을 바꾼다**

`user:delete` → **`user:soft-delete`** 로 바꾸고 `src/modules/audit-log/audit-log.labels.ts`에 라벨을 추가한다 (`명단에서 제외`, tone `cancelled`). `user:delete`는 Task 3의 하드 삭제가 쓰므로 **라벨을 지우지 마라.**

배치 요약(`enrollment:import`)의 `deleted` 건수 키 이름도 뜻에 맞게 정리해라.

- [x] **Step 3: 화면 문구를 사실에 맞게 고친다**

`import-form.tsx`의 삭제 섹션이 지금 "계정을 삭제합니다. 되돌릴 수 없습니다"라고 한다. **이제 사실이 아니다.**

- 섹션 제목: "삭제될 학생" → **"명단에서 빠지는 학생"**
- 설명: 계정이 비활성되고 목록에서 사라지지만 **기록은 남고, 다음 명단에 다시 넣으면 돌아온다**는 것을 적어라.
- 색을 위험(`rose`)에서 경고(`amber`)로 낮춰라 — 되돌릴 수 있는 동작이다.
- **건수 직접 입력 확인은 그대로 둬라.** 되돌릴 수 있어도 전교생이 목록에서 사라지는 건 여전히 큰 사고다.
- 확인 체크박스 문구도 "삭제합니다" → "명단에서 뺍니다"로.

- [x] **Step 4: 되돌아오는지 확인하는 테스트**

**이번 변경의 핵심 성질이다.** 학생을 명단에서 빼고 → 다시 넣으면 → `deletedAt`이 `null`로 돌아오고 계정이 활성화되는지 테스트해라. 그러려면 **재삽입 경로가 `deletedAt`을 지워야 한다** — `applyRoster`가 배정을 만드는 학생에 대해 `deletedAt: null, status: "ACTIVE"`로 되돌리게 하고, 그것도 테스트해라.

통합 테스트(`tests/integration/roster.repo.apply-roster.integration.test.ts`)도 고쳐야 한다 — 지금은 학부모 계정이 살아남는지를 하드 삭제 기준으로 본다. 소프트 삭제 기준으로 바꾸고, **`ParentStudent` 연결이 유지되는지**를 확인해라(계정이 안 지워지므로 연결도 안 끊긴다).

- [x] **Step 5: 검증하고 커밋**

```bash
npm run verify && npm run build
```

---

### Task 3: 하드 삭제를 사용자 상세로 옮긴다

**Files:**
- Modify: `src/modules/admin-users/admin-user.{repo,service}.ts`
- Modify: `src/app/(app)/admin/users/[userId]/{page.tsx,user-forms.tsx}`, `../actions.ts`, `../action-state.ts`
- Test: `tests/modules/admin-users/admin-user.service.test.ts`

- [x] **Step 1: 서비스에 하드 삭제를 만든다**

`deleteUserPermanently(actor, userId)`:
- `assertCan(actor, "user:manage")`
- **자기 자신이면 거부** (`CANNOT_DELETE_SELF`)
- **`deletedAt`이 없으면 거부** (`NOT_SOFT_DELETED`) — 살아 있는 계정을 상세 화면에서 바로 지우는 경로를 만들지 않는다. 먼저 명단에서 빼고(소프트 삭제) 나서만 완전 삭제할 수 있다. **오등록 정리라는 용도에 정확히 맞고, 실수로 누를 여지를 없앤다.**
- repo가 트랜잭션으로: 그 사용자가 만든 초대코드 삭제 → 그 사용자를 쓴 초대코드 삭제(metadata에 이름·생년월일이 있다) → `user.delete`
- `recordAudit({ action: "user:delete", targetType: "User", targetId: userId })` — **이름은 남기지 마라.**

- [x] **Step 2: 상세 화면에 버튼**

`deletedAt`이 있는 계정에만 보인다. `variant="danger"`, 문구 "완전 삭제". 누르면 **확인 입력**을 요구해라 — 체크박스로는 부족하다. 학생 이름을 그대로 입력해야 열리게 한다(되돌릴 수 없는 유일한 동작이다).

경고 문구에 무엇이 함께 사라지는지 적어라: 소속 이력·상벌점(추후)·초대코드. 감사로그는 남는다는 것도.

- [x] **Step 3: 서버가 강제한다**

화면의 이름 입력은 실수 방지일 뿐이다. **서버 액션도 이름을 받아 대조해라** — 서버 액션을 직접 부르면 화면 확인을 건너뛴다. 어긋나면 `NAME_MISMATCH`.

- [x] **Step 4: 테스트**

권한 거부 / 자기 자신 거부 / 소프트 삭제 안 된 계정 거부 / 이름 불일치 거부 / 정상 삭제 시 초대코드도 지워지는지 / 감사로그에 이름이 안 남는지.

- [x] **Step 5: 검증**

`npm run verify && npm run build`.

**화면에서 직접 확인해라.** 임시 학생 계정을 만들어:
1. 명단에서 빼기 → 목록에서 사라지고 상세에 "삭제됨" 배지
2. 그 학생의 과거 감사로그가 `/admin/logs`에 그대로 있는지
3. 다시 명단에 넣기 → 되돌아오는지
4. 다시 빼고 → 상세에서 "완전 삭제" → 이름 입력 → 행이 사라지는지
5. 삭제 후에도 그 사람이 행위자였던 감사로그가 이름과 함께 남는지

**사용자의 실제 계정 2개(`admin@gbsw.hs.kr`, `yakihyuk0728@gmail.com` = 김동혁)는 절대 지우거나 명단에서 빼지 마라.** 확인이 끝나면 임시 계정과 흔적을 정리하고 김동혁을 1학년 3반 3번·재학·활성으로 되돌려라.

- [x] **Step 6: 커밋**

---

## Self-Review

**설계 결정 기록**

| 결정 | 근거 |
|---|---|
| `deletedAt`을 `status`와 별도 컬럼으로 | 비활성 해제와 삭제 복구는 다른 일이다. 한 컬럼이면 구분이 사라진다 |
| 하드 삭제는 소프트 삭제된 계정에만 | 오등록 정리라는 용도에 맞고, 살아 있는 계정을 실수로 지울 경로가 없어진다 |
| 하드 삭제에 이름 입력 요구 | 되돌릴 수 없는 유일한 동작. 체크박스는 습관적으로 눌린다 |
| `bootstrap.countUsers`는 소프트 삭제를 세지 않음 | 전원이 빠지면 부트스트랩이 다시 열려 아무나 관리자가 된다 |
| 명단 재삽입이 `deletedAt`을 지움 | "다시 넣으면 돌아온다"가 소프트 삭제의 존재 이유다 |

**상벌점에 넘기는 것** — `MeritAward`는 `StudentProfile.id`를 `onDelete: Cascade`로 참조한다. 소프트 삭제가 기본 경로이므로 명단 작업으로는 상벌점이 사라지지 않고, 오등록 하드 삭제에서만 함께 지워진다. **이게 이번 결정의 목적이다.**

**남기는 제약** — 소프트 삭제된 계정이 이메일을 계속 점유한다(`@unique`). 전출 후 재전입 학생이 같은 이메일로 재가입하려면 완전 삭제하거나 다른 이메일을 써야 한다.
