# 행 삭제 = 계정 삭제 구현 계획 (5단계)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 명단 파일에서 지운 줄의 학생은 계정까지 지운다. 감사로그는 남긴다.

**Architecture:** 감사로그가 행위자를 살아 있는 외래키로 물고 있어 기록이 있는 계정은 지워지지 않는다. `actorUserId`를 nullable로 풀고 **행위자 이름을 기록 시점에 스냅샷**으로 박는다 — 과거의 사실이 현재의 계정에 기대면 안 되므로 이 편이 감사로그의 정석이기도 하다. 삭제는 되돌릴 수 없는 유일한 동작이라 미리보기에서 가장 크게 보여주고 별도 확인을 받는다.

**Tech Stack:** Prisma 7.9 + `@prisma/adapter-pg`, PostgreSQL 18, Next.js 16, zod 4, vitest 4.

## Global Constraints

- 설계 근거: `docs/superpowers/specs/2026-08-13-academic-year-and-roster-design.md`의 "개정 (2026-08-13, 4·5단계)" 절
- 계층: `Route/Server Action → Service → Repo`. **repo에는 Prisma 호출만.**
- `can()`은 service 안에서도 호출한다. 명단 반영은 `student:manage` + `invite:create`.
- 감사로그에는 값이 아니라 항목 이름/건수만. **단 `actorName`은 예외** — 계정이 사라져도 누가 했는지 남아야 하므로 이름을 스냅샷으로 박는다.
- zod 검증은 경계에서 한 번만.
- **스키마를 바꿨으면 `next dev`를 재시작한다** (`.next`도 지운다). 돌던 서버는 옛 Prisma 클라이언트를 물고 있어 새 필드를 쓰는 화면만 조용히 실패한다.
- 각 태스크 끝에 `npm run verify` 통과. 마지막은 `npm run build`도. **lint 경고 0.**
- 주석·커밋 메시지는 한국어로, "왜"를 적는다.

## File Structure

**수정**

| 파일 | 무엇을 |
|---|---|
| `prisma/schema.prisma` | `AuditLog.actorUserId` nullable + `onDelete: SetNull`, `actorName` 추가 |
| `src/core/audit/audit.ts` | `actorName` 기록 |
| `src/modules/admin-users/admin-user.repo.ts` | 이력 조회가 null 행위자를 견디게 |
| `src/app/(app)/admin/logs/page.tsx` | 행위자 표시가 null을 견디게 |
| `src/app/(app)/admin/users/[userId]/page.tsx` | 같은 이유 |
| `src/modules/enrollment/roster.plan.ts` | `missingFromFile`을 전체 학생으로 넓히고 삭제로 분류 |
| `src/modules/enrollment/roster.repo.ts` | 계정 삭제 |
| `src/modules/enrollment/roster.service.ts` | 삭제 확인·감사로그 |
| `src/app/(app)/admin/students/import/{import-form.tsx,actions.ts,action-state.ts}` | 삭제 강조 + 별도 확인 |

---

### Task 1: 감사로그가 계정을 놓아주게 한다

**Files:**
- Modify: `prisma/schema.prisma`, 새 마이그레이션, `src/core/audit/audit.ts`
- Modify: `src/modules/admin-users/admin-user.repo.ts`, `src/app/(app)/admin/logs/page.tsx`, `src/app/(app)/admin/users/[userId]/page.tsx`
- Test: `tests/core/audit/audit.test.ts`

**Interfaces:**
- `AuditLog.actorUserId String?` (`onDelete: SetNull`), `AuditLog.actorName String`
- `recordAudit(input)`는 그대로 `actorUserId`를 받되, **이름을 조회해 함께 저장한다**

- [ ] **Step 1: 스키마를 고친다**

```prisma
model AuditLog {
  id String @id @default(cuid())

  /// 계정이 지워지면 null이 된다. 기록 자체는 남아야 하므로 Restrict를 쓰지 않는다.
  actorUserId String?
  actor       User?  @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  /// 기록 시점의 행위자 이름. 계정이 사라져도 "누가 했는지"가 남아야 한다.
  /// 과거의 사실이 살아 있는 외래키에 기대면 안 된다.
  actorName String
```

나머지 필드는 그대로 둔다.

- [ ] **Step 2: 마이그레이션을 만들고 백필한다**

Run: `npx prisma migrate dev --create-only --name audit_actor_snapshot`

생성된 SQL을 아래로 **통째로 바꾼다**. 기존 기록에도 이름이 있어야 NOT NULL을 걸 수 있다.

```sql
-- 감사로그가 계정을 붙잡지 않게 한다.
--
-- actorUserId가 Restrict라 기록이 있는 계정은 지울 수 없었다. 명단에서 줄을 지우면
-- 계정까지 지우려면 이 제약을 풀어야 한다. 대신 행위자 이름을 기록 시점 스냅샷으로
-- 박아, 계정이 사라져도 "누가 했는지"는 남긴다.

ALTER TABLE "AuditLog" ADD COLUMN "actorName" TEXT;

UPDATE "AuditLog" a
SET "actorName" = u.name
FROM "user" u
WHERE u.id = a."actorUserId" AND a."actorName" IS NULL;

-- 행위자를 못 찾는 기록은 있을 수 없지만(지금은 Restrict라서), 방어적으로 채운다.
UPDATE "AuditLog" SET "actorName" = '(알 수 없음)' WHERE "actorName" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "actorName" SET NOT NULL;

ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorUserId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
```

**제약 이름은 반드시 실제와 대조해라:**
```bash
docker exec gbsw-db psql -U gbsw -d gbsw -c \
'select conname from pg_constraint where conrelid = '"'"'"AuditLog"'"'"'::regclass and contype = '"'"'f'"'"';'
```

- [ ] **Step 3: 적용하고 확인한다**

```bash
npm run db:migrate && npx prisma generate
docker exec gbsw-db psql -U gbsw -d gbsw -c \
'select "actorName", count(*) from "AuditLog" group by 1;'
```
Expected: 기존 24건 전부에 이름이 채워져 있고 `(알 수 없음)`이 없다.

- [ ] **Step 4: `recordAudit`이 이름을 남기게 한다**

`src/core/audit/audit.ts`가 `actorUserId`로 이름을 조회해 함께 저장한다. 조회를 한 번 더 하는 비용이 붙지만, 이름을 인자로 받게 하면 **호출부가 빠뜨릴 수 있고** 그러면 기록이 조용히 비어버린다 — `ip`·`userAgent`를 여기서 직접 읽기로 한 것과 같은 이유다.

이름을 못 찾으면 `(알 수 없음)`으로 남기고 **던지지 않는다.** 감사로그를 못 남겨서 본 동작이 실패하면 안 된다.

- [ ] **Step 5: 표시 경로가 null을 견디게 한다**

`actor`가 이제 nullable이다. 세 곳을 고친다.
- `admin-user.repo.ts`의 이력 조회 select에서 `actor: { select: { name } }` → `actorName: true`로 바꾼다 (조인이 필요 없어진다)
- `admin/logs/page.tsx` — 행위자 이름을 `actorName`에서 읽는다
- `admin/users/[userId]/page.tsx` — 같은 방식. `entry.actorUserId === user.id`로 "본인이 실행"을 판단하던 부분은 그대로 두되 null 비교가 되도록 확인한다

- [ ] **Step 6: 테스트**

`tests/core/audit/audit.test.ts`에 추가한다: `recordAudit`이 `actorName`을 함께 저장하는지, 이름을 못 찾아도 던지지 않는지.

- [ ] **Step 7: 검증하고 커밋**

```bash
npm run verify
git add prisma src/core/audit src/modules/admin-users "src/app/(app)/admin" tests/core/audit
git commit -m "feat(audit): 행위자 이름을 기록 시점 스냅샷으로 남긴다

actorUserId가 Restrict라 기록이 있는 계정은 지울 수 없었다. 명단에서 줄을 지우면
계정까지 지우려면 이 제약을 풀어야 한다.

대신 이름을 기록 시점에 박는다. 과거의 사실이 살아 있는 외래키에 기대면 안 된다 —
계정이 사라져도 '누가 했는지'는 남아야 하고, 이 편이 감사로그의 정석이기도 하다.

이름은 recordAudit이 직접 조회한다. 인자로 받으면 호출부가 빠뜨릴 수 있고 그러면
기록이 조용히 비어버린다. ip·userAgent를 여기서 직접 읽기로 한 것과 같은 이유다."
```

---

### Task 2: 삭제 분류와 실행

**Files:**
- Modify: `src/modules/enrollment/roster.plan.ts`, `roster.repo.ts`, `roster.service.ts`
- Modify: `tests/modules/enrollment/roster.{plan,service}.test.ts`

**Interfaces:**
- `RosterPlan.missingFromFile`의 뜻이 바뀐다 — **그 학년도 재학생만이 아니라 명단에 없는 모든 학생**
- `applyRosterPlan(actor, expectedYear, rows, confirmDeletion: boolean)`
- repo: `applyRoster`가 `deleteStudentProfileIds`를 받는다

- [ ] **Step 1: `missingFromFile`을 전체 학생으로 넓힌다**

지금은 `roster.plan.ts`가 `status === "ENROLLED"`인 학생만 센다. 파일이 이제 **전교생 완성본**(배정 없는 학생도 빈 줄로 나간다)이므로, 명단에 없는 학생은 학적과 무관하게 전부 삭제 대상이다. 졸업생 줄을 지웠는데 아무 일도 안 일어나면 "지우면 삭제"라는 규칙이 깨진다.

필터를 없애고 주석으로 이유를 남겨라.

- [ ] **Step 2: 삭제 확인을 서비스가 요구하게 한다**

`applyRosterPlan`에 `confirmDeletion: boolean`을 추가한다. `missingFromFile`이 하나라도 있는데 `confirmDeletion`이 false면 `RosterError("DELETION_NOT_CONFIRMED")`로 거부한다.

**되돌릴 수 없는 유일한 동작이라 서버가 확인을 강제한다.** 화면의 체크박스만으로는 부족하다 — 서버 액션을 직접 부르면 건너뛸 수 있다.

- [ ] **Step 3: repo가 계정을 지운다**

`applyRoster`의 트랜잭션 안에서, 배정을 다시 넣기 **전에** 삭제 대상을 지운다.

지우는 순서가 중요하다. `Invite.createdById`가 Restrict라 학생이 만든 학부모 코드가 삭제를 막는다 — 계정을 지우기 전에 그 코드를 먼저 지운다. 나머지(`session`·`account`·`StudentProfile`→`Enrollment`·`ParentStudent`)는 Cascade가 알아서 정리한다.

```ts
// 학생이 만든 학부모 코드가 createdById(Restrict)로 삭제를 막는다. 먼저 치운다.
await tx.invite.deleteMany({ where: { createdById: { in: userIds } } });
// user를 지우면 session·account·StudentProfile이 Cascade로 함께 사라지고,
// StudentProfile에 딸린 Enrollment·ParentStudent도 이어서 정리된다.
await tx.user.deleteMany({ where: { id: { in: userIds } } });
```

**연결된 학부모 계정은 지우지 않는다.** `ParentStudent` 연결만 끊기고 계정은 남는다 — 관리자가 요청한 것은 학생 삭제이지 학부모 삭제가 아니다.

- [ ] **Step 4: 감사로그**

삭제된 학생마다 `user:delete`를 남긴다 (`targetType: "User"`, `targetId: userId`). 배치 요약(`enrollment:import`)의 metadata에도 `deleted` 건수를 넣는다.

**이름은 남기지 않는다** — 계정이 사라진 뒤라 `targetId`만으로 충분하고, 이름을 넣으면 감사로그가 삭제된 개인정보의 사본이 된다. 누가 지웠는지는 `actorName`이 남긴다.

- [ ] **Step 5: 자기 자신·관리자 보호**

삭제 대상에 `actor.id`가 들어 있으면 거부한다 (`CANNOT_DELETE_SELF`). `listExisting`이 `role: "STUDENT"`로 걸러지므로 도달하기 어렵지만, 2단계·3단계에서 같은 자리를 두 번 짚였으니 명시적으로 막는다.

- [ ] **Step 6: 테스트**

- 명단에 없는 학생이 `missingFromFile`에 들어가는지 (재학·졸업 **둘 다**)
- `confirmDeletion`이 false면 아무것도 쓰지 않고 거부하는지
- true면 repo에 삭제 대상이 전달되는지
- 학생마다 `user:delete` 감사로그가 남는지, **이름이 로그에 없는지**
- 자기 자신이 대상이면 거부하는지

- [ ] **Step 7: 검증하고 커밋**

```bash
npm run verify
git add src/modules/enrollment tests/modules/enrollment
git commit -m "feat(enrollment): 명단에서 지운 줄의 학생 계정을 삭제한다

파일이 전교생 완성본이므로 명단에 없는 학생은 학적과 무관하게 삭제 대상이다.
졸업생 줄을 지웠는데 아무 일도 안 일어나면 '지우면 삭제'라는 규칙이 깨진다.

되돌릴 수 없는 유일한 동작이라 서버가 확인을 강제한다. 화면 체크박스만으로는
서버 액션을 직접 부르는 경로를 막지 못한다.

학생이 만든 학부모 코드를 먼저 치운다 — createdById가 Restrict라 삭제를 막는다.
연결된 학부모 계정은 지우지 않는다. 관리자가 요청한 건 학생 삭제다."
```

---

### Task 3: 미리보기에서 삭제를 크게 보여준다

**Files:**
- Modify: `src/app/(app)/admin/students/import/{import-form.tsx,actions.ts,action-state.ts}`

- [ ] **Step 1: 삭제 섹션을 가장 위에 둔다**

지금 `명단에 없는 재학생`은 여러 묶음 중 하나다. **삭제로 뜻이 바뀌었으므로 미리보기 맨 위로 올리고** 이름을 "삭제될 학생"으로 바꾼다. 색은 경고(`amber`)가 아니라 위험(`rose`·`rose-soft`)을 쓴다 — 되돌릴 수 없다.

각 학생의 이름·학생코드·현재 소속을 전부 보여준다. 접지 말고 펼친 채로 둔다.

- [ ] **Step 2: 확인 체크박스**

삭제가 하나라도 있으면 확정 버튼 위에 체크박스를 둔다.

> ☐ 위 N명의 계정을 삭제합니다. 되돌릴 수 없습니다.

체크하기 전에는 확정 버튼을 `disabled`로 둔다. 체크 상태를 hidden input으로 실어 서버에 보낸다(서버가 다시 강제하지만, 화면에서도 막아야 실수로 누르지 않는다).

- [ ] **Step 3: 확정 버튼 문구에 건수를 넣는다**

삭제가 있으면 `확정 (3명 삭제)`처럼 건수를 버튼에 박는다. 배너를 안 읽고 누르는 걸 막는 마지막 방어선이다.

- [ ] **Step 4: `DELETION_NOT_CONFIRMED` 문구**

`"삭제 확인에 동의해야 반영할 수 있습니다."`

- [ ] **Step 5: 검증**

`npm run verify && npm run build` 통과, lint 경고 0.

- [ ] **Step 6: 화면에서 직접 확인한다**

**스키마를 바꿨으므로 `next dev`를 재시작하고 `.next`를 지운 뒤에 확인해라.** 안 그러면 옛 Prisma 클라이언트를 물고 조용히 실패한다.

확인용으로 **임시 학생 계정을 하나 만들어라** (김동혁은 사용자의 실제 계정이라 지우면 안 된다). 초대코드를 발급해 가입시키거나 SQL로 직접 만들어도 된다.

| 확인 | 기대 |
|---|---|
| 전체 명단 내려받기 → 임시 학생 줄만 지우고 올리기 | 삭제 섹션에 그 학생이 뜨고, 붉은 색, 펼쳐진 상태 |
| 체크 전 확정 버튼 | 비활성 |
| 체크 후 확정 | "N명 삭제" 문구가 버튼에 보이고 반영됨 |
| 반영 후 DB | 그 학생의 user·StudentProfile·Enrollment가 사라짐 |
| 반영 후 감사로그 | 그 학생의 과거 기록이 **남아 있고** `actorName`이 채워져 있음 |
| `/admin/logs` | 삭제된 학생이 행위자인 옛 기록이 이름으로 보임 (깨지지 않음) |

**확인이 끝나면 임시 학생의 흔적(초대코드 등)을 정리하고, 김동혁을 1학년 3반 3번·재학·활성으로 되돌려라.** 사용자의 실제 계정 2개(`admin@gbsw.hs.kr`, `yakihyuk0728@gmail.com`)는 **절대 지우지 마라.**

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(app)/admin/students/import"
git commit -m "feat(admin): 삭제될 학생을 미리보기 맨 위에 크게 보여준다

되돌릴 수 없는 유일한 동작이라 경고색이 아니라 위험색을 쓰고, 접지 않고, 확정 버튼에
건수를 박는다. 엑셀에서 행은 실수로도 쉽게 지워진다."
```

---

## Self-Review

**스펙 대조**

| 스펙(개정 절) | 태스크 |
|---|---|
| 행 삭제 = 계정 삭제, 감사로그 보존 | Task 1·2 |
| `AuditLog.actorUserId` nullable + 이름 스냅샷 | Task 1 |
| `Invite.createdById` 정리 후 삭제 | Task 2 Step 3 |
| 미리보기에서 가장 눈에 띄게 + 별도 확인 | Task 2 Step 2(서버) · Task 3(화면) |
| 학부모 계정은 자동 삭제하지 않음 | Task 2 Step 3 |

**의도적으로 넣지 않은 것**

- **학부모 고아 계정을 미리보기에 따로 보여주는 것은 넣지 않는다.** 스펙에 있지만, 자녀 연결이 끊긴 학부모는 로그인해도 볼 게 없고 관리자가 사용자 관리에서 정리하면 된다. 삭제 화면에 정보를 더 얹으면 정작 봐야 할 "삭제될 학생"이 묻힌다. 필요해지면 그때 넣는다.
- **되돌리기는 없다.** 확정 전에 막는 쪽을 택했다.

**앞 단계에서 두 번 짚인 자리** — 자기 계정을 잠그거나 지우는 경로는 2·3단계에서 각각 지적을 받았다. 이번에는 `CANNOT_DELETE_SELF`를 처음부터 넣는다(Task 2 Step 5).
