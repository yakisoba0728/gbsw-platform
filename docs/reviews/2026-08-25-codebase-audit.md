# 코드베이스 전수 감사 — 2026-08-25

> **이 문서는 감사 시점의 기록이다.** 아래 확정 41건은 **같은 세션에서 전부 수정했다.**
> 무엇을 어떻게 고쳤는지는 그 변경분에 있고, 이 문서는 **무엇이 왜 결함이었는지**와
> **고치면서 새로 드러난 것**을 남긴다.
>
> **사람이 해야 할 일이 하나 있다 — §5를 먼저 읽어라.** 새 마이그레이션이 하나 늘었다.

기준선: `main @ 36bcc5d`. 감사 시작 시점에 `npm run typecheck` · `npm run lint`(경고 0) ·
단위 테스트 **1400건** · `npm run build`가 전부 통과했다. **즉 아래 항목은 전부 기존
검사망을 통과하는 것들이다.** 통합 테스트 15개 파일은 감사 환경에 Docker도 Postgres도
없어 돌리지 못했고, `.github/workflows/ci.yml`의 `integration` 잡이 실 Postgres 18로 덮는다.

---

## 1. 어떻게 읽었나

아홉 관점이 저장소를 나눠 읽고, **관점마다 별도의 검증자가 그 발견을 반증하려 시도했다.**
검증자에게 준 기준은 「의심스러우면 기각하라 — 그럴듯하지만 틀린 지적이 통과하는 것이
빠뜨리는 것보다 나쁘다」였다. 그 결과 **13건이 기각**됐고, 살아남은 것 중에서도 심각도가
내려간 것이 여럿이다. 마지막으로 완전성 비평자가 아무도 읽지 않은 파일을 `find`로 찾아냈다 —
`src/lib/greeting.ts` 하나였고, 그마저 직접 읽어 확인했다.

| 관점 | 무엇을 봤나 |
|---|---|
| architecture | 3계층·감사로그·오류 규약(서비스 코드 ↔ 액션 MESSAGES 문자열 대조) |
| authz | IDOR·소유권·세션 경계·역할 상승 |
| data-integrity | 트랜잭션·경쟁 조건·마이그레이션 SQL 전수·onDelete·인덱스 |
| merit-logic | 상벌점 도메인 정확성(OFFSET 부호·트랙 범위·occurredOn) |
| identity-flows | 가입·인증코드·초대·명단·학년도 |
| nextjs | App Router·React 19·서버액션·캐시 무효화 |
| ui-design | 디자인 토큰·접근성·문구 규칙 |
| tests | 거짓 안심 테스트·커버리지 구멍 |
| ops-docs | 배포·설정·문서 정합성 |

**확정 41건** (높음 1 · 중간 12 · 낮음 28), **기각 13건**.

---

## 2. 높음 — 하나

### 가입 마지막 단계에서 한 번 실패하면 이메일·전화 칸이 비워진 채 잠긴다

`src/app/(auth)/register/register-flow.tsx` · `verified-field.tsx`

React 19는 `<form action={함수}>`의 액션이 끝나면 **성공·실패를 가리지 않고** 폼을 자동
`reset()` 한다. `VerifiedField`의 이메일·전화 입력은 `value`도 `defaultValue`도 없는 비제어
입력이라 **빈 문자열이 된다.** 그런데 `readOnly={verified}`의 근거인 `verified`는 React state에서
오고 네이티브 리셋은 change 이벤트를 내지 않으므로 state는 그대로다 — **칸은 비었는데 여전히
읽기 전용이고 「확인됨」 배지도 남는다.** readOnly 입력은 HTML 명세상 제약 검증에서 빠지므로
`required`도 빈 값 제출을 못 막아 같은 실패가 반복된다.

도달 경로는 흔하다: 비밀번호 확인 불일치 `refine`이 걸리면 액션이 `{ error }`를 **return**한다
(throw도 redirect도 아니다). 탈출로는 「가입코드 다시 입력」으로 전체 재시작뿐인데, 그 재시작이
**대상별 5회/시간 발송 한도를 갉아먹고** 이름·생년월일이 어긋났다면 초대코드 자동 폐기
카운터까지 올린다.

**고친 방식:** 이메일·전화를 제어 입력으로 바꿨다. `react-dom` 19.2.8의 `updateInput`은 `value`가
주어지면 매 갱신마다 `element.defaultValue`를 같은 값으로 맞추므로(1670-1673행) 자동 리셋이
무해해진다.

---

## 3. 이 결함은 저장소 전체에 퍼져 있었다 — React 19 자동 폼 리셋

높음 1건은 **같은 뿌리를 가진 여덟 곳 중 가장 나쁜 하나**였다. 감사가 확정한 것만 적는다:

| 화면 | 잃는 것 |
|---|---|
| 가입 정보 입력 | 이메일·전화(잠김) · 이름 · 생년월일 |
| 최초 관리자 생성 | 이름 · 이메일 · 전화 |
| 계정 정보 수정 | 일곱 칸 전부가 **서버 값으로 되감김** |
| 규정 추가 / 인라인 수정 | 항목명·점수·분류·설명 |
| 초대코드 발급 | 이름·생년월일·학년·반·번호·유효기간·학생 선택 |
| 벌점 기준 설정 | 경고·위험 두 숫자 |
| 상벌점 부여 / 반 명단 | 메모, 그리고 **체크박스만 풀려 「N명 선택됨」과 어긋남** |

**패턴을 둘로 갈라 고쳤다.** 근거는 `react-dom` 19.2.8 소스에서 직접 확인했다.

1. **값이 이미 React state에 있으면 제어 입력.** `updateInput`이 `value`를 받으면
   `element.defaultValue`를 함께 세팅하므로 리셋이 무해하다.
2. **서버 값으로 seed되는 여러 칸짜리 폼이면 실패 상태에 제출값을 싣고 `defaultValue`로 내린다.**
   `recursivelyResetForms`는 `commitMutationEffectsOnFiber`의 HostRoot 분기(14900행)에서
   **그 커밋의 모든 host 갱신이 끝난 뒤** 돌기 때문에, 리셋 시점에는 새 `defaultValue`가 이미
   DOM에 반영돼 있다. 성공하면 revalidate가 가져온 새 서버 값이 보여야 하므로 **실패했을 때만** 싣는다.

**체크박스는 다르다.** `updateInput`은 `defaultChecked`만 `element.defaultChecked`로 동기화하고
(1677-1678행), `checked`와 `defaultChecked`를 **둘 다 주면 dev 경고**가 난다(`validateInputProps`).
그래서 반 명단은 제어 `checked`를 유지하고 액션이 끝날 때 체크박스 목록을 remount 시킨다.

**`type="number"`도 다르다.** `setDefaultValue`(1737-1741행)는
`"number" === type && getActiveElement(...) === node`이면 defaultValue 갱신을 **통째로 건너뛴다**
(커서 튐 방지 장치다). 그 칸에 커서를 둔 채 Enter로 제출해 실패하면 위 두 방식 어느 쪽으로도
값이 복원되지 않는다. 그래서 해당 칸을 전부 `inputMode="numeric"`으로 옮겼다 —
`threshold-form.tsx`가 이미 쓰던 방식이다. **브라우저 `min`/`max` 가드를 잃는 만큼 zod가 같은
범위를 한국어 문구로 막는지 하나씩 확인했고**, 문구가 없던 `invite.schema.ts`의 `expiresInDays`에는
새로 달았다(없으면 zod 영문 기본 문구가 한글 화면에 그대로 나간다).

---

## 4. 중간 — 열둘

### 목록 두 곳의 페이지 넘김이 동점 정렬키를 쓴다

`merit.repo.findRecentAwardPage` · `audit-log.repo.findPage` (그리고 `admin-user.repo.findRelatedAudit`)

셋 다 `orderBy: { createdAt: "desc" }` **하나만** 두고 `skip`/`take`로 자른다. 그런데 `createdAt`은
유일하지 않다 — 마이그레이션 DDL이 `DEFAULT CURRENT_TIMESTAMP`이고 **Postgres에서 이 값은
트랜잭션 시작 시각**이라, 한 트랜잭션이 넣는 모든 행이 완전히 같은 타임스탬프를 갖는다.
일괄 부여 한 번이 반 전체를, 명단 반영 한 번이 감사로그 수백 줄을 그렇게 만든다.

SQL은 정렬키가 같은 행 사이의 순서를 보장하지 않고 OFFSET이 달라지면 플래너 경로도 달라지므로,
쪽을 넘길 때 **어느 쪽에도 안 나오는 줄**이 생긴다. 감사로그는 append-only 근거 자료라
「안 보인다」가 곧 「없다」로 읽힌다.

**`tests/modules/merit/merit.repo.recent.test.ts:62`가 지금의 orderBy를 문자 그대로 단언하고
있었다 — 회귀 방지망이 결함 쪽에 고정돼 있었다.** 그 단언도 함께 고쳤다.

**고친 방식:** 보조 정렬키 `{ id: "desc" }`. cuid라 시간순은 아니지만 **유일하고 결정적**이며,
쪽 경계 안정에 필요한 것은 유일성이지 시간순이 아니다.

### `User.deletedAt`은 아무도 쓰지 않는데 스키마는 소프트 삭제를 약속했다

`prisma/schema.prisma` vs `roster.repo.ts:189`

스키마 주석은 「명단에서 빠진 계정 → 소프트 삭제, 계정·프로필·**상벌점**·감사로그는 그대로 둔다」,
「진짜 삭제는 사용자 상세에서 한 명씩」이라고 적었다. 실제 코드는 정반대다 — 명단에서 빠진 학생은
`tx.user.deleteMany`로 **계정을 물리 삭제**하고 cascade로 상벌점까지 사라진다. 저장소 전체에서
`deletedAt`에 값을 쓰는 코드는 **한 군데도 없다**(전부 `null`로 지우기만 한다). 코드 주석 스스로
"legacy deletedAt 표시"라 부른다.

화면 문구는 물리 삭제를 정확히 경고하므로 쓰는 사람은 속지 않는다. **속는 것은 스키마를 근거로
판단하는 사람이다** — 「명단에서 줄을 지우는 건 되돌릴 수 있나?」의 답이 정반대로 나온다.

**고친 방식:** 문서만 고치고 동작은 그대로 뒀다. 스키마 주석을 실제 동작으로 다시 쓰고,
`docs/superpowers/plans/2026-08-14-soft-delete.md` 머리에 그 계획이 유효하지 않다는 경고를 붙였다.
열과 인덱스는 남긴다 — **읽기 경로(로그인 차단·목록 필터)가 살아 있어** 지우면 그쪽이 깨진다.
즉 값을 채우는 날 소프트 삭제는 그대로 동작한다.

### 명단 반영 — 두 건

- **졸업 이력이 있는 재학생은 명단에서 줄을 지워도 삭제·표시 어느 쪽에도 안 잡힌다.**
  `hasGraduatedEnrollment`가 연도를 가리지 않아, 재입학·오등록으로 「2026 졸업 + 2027 재학」이 된
  학생은 삭제 대상에서 빠지고 미리보기 다섯 집합 어디에도 안 들어간다 — **화면에서 완전히
  사라진다.** 그런데 `untouched` 경로가 그를 다시 담아 **배정이 되살아나고** 감사로그도 안 남는다.
- **명단 밖 배정이 (반, 번호) 자리를 붙들어 반영이 원인 없는 실패로 막힌다.**
  `isUniqueViolation(error, "code")`만 보는 catch가 `Enrollment_classId_number_key` 위반을 못 옮겨
  날것의 P2002가 올라가고, 화면에는 「반영하지 못했습니다.」만 뜬다 — `console.error`조차 없어
  원인이 어디에도 안 남았다.

### 나머지

「순위 · 현황」 집계 전체 무테스트 · `status: "ACTIVE"`(취소분 제외) 무단언 · 관리자 전용 조회 둘의
권한 테스트 부재 · 초대 관리 로딩 뼈대의 분기점 불일치(`@2xl` vs `@6xl`) · 미리보기 접힘 그룹에
펼침 표시 없음(확정 버튼이 **계정 생성과 물리 삭제**를 일으키는 화면이다).

---

## 5. **사람이 해야 할 일**

1. **마이그레이션을 적용해라.** `prisma/migrations/20260825000000_audit_log_target_id_index/`가
   새로 생겼다 (`AuditLog.targetId` 인덱스 — 계정 상세가 이 열로 OR 조회하는데 인덱스가 없어
   관련 줄이 적은 계정일수록 감사로그 전체를 훑었다).
   ```bash
   npm run db:up && npm run db:migrate     # 개발
   # 운영: docker compose run --rm migrate
   ```
   **SQL은 손으로 썼다** — 이 세션에 DB가 없어 `prisma migrate dev`를 돌릴 수 없었다.
   기존 파일의 인덱스 이름 규칙(`<테이블>_<컬럼>_idx`)과 대조만 했으니 적용 시 확인해라.
   부분 유니크 인덱스 `AcademicYear_single_current`를 건드리는 줄은 넣지 않았다.

2. **통합 테스트를 돌려라.** `npm run verify`의 통합 단계는 이 세션에서 한 번도 못 돌렸다
   (Docker·Postgres 없음). repo 계층을 여러 곳 고쳤으므로 — `orderBy` 보조키, `topRules`의
   `groupBy`, roster 삭제 판정 — **실제 SQL 실행은 아직 검증되지 않았다.**

3. **화면을 눈으로 봐라.** 폼 리셋 수정과 벌점 칸 폭 조정은 브라우저 실측 없이 했다.
   특히 확인할 것: 가입 → 인증 후 비밀번호를 서로 다르게 넣고 제출 → **이메일·전화가 남아 있는지**.

---

## 6. 고치면서 새로 드러난 것

감사 목록에 없었지만 수정 과정에서 나와 **함께 고친 것들**:

- `admin-user.repo.findRelatedAudit`도 같은 동점 정렬키 결함이었다 (자르기 판).
- 「많이 나온 항목」(`topRules`)도 규정 이름을 바꾸면 두 줄이 됐다 — `groupBy`에 `ruleId`가 없어
  서비스에서 접을 수가 없었다. `by`에 넣고 접었다.
- `getRuleStats`는 이름을 「가장 많이 나간 스냅샷」에서 고르고 있었다 — 규정의 **현재 이름**을
  쓰도록 바꿨다.
- `isSerializationConflict`가 세 서비스에 글자 그대로 복제돼 있었다. `core/db/transaction-conflict.ts`
  하나로 모았다. 목적이 다른 두 판정(`isSerializationConflict` = 재시도 가능한가 /
  `isTransactionFatal` = 삼키면 안 되는가)은 **억지로 합치지 않고** 같은 파일에 나란히 뒀다.
- 규격 문서(`docs/design/2026-08-17-redesign-spec.md`) §3-2의 「✓」 예시가 코드에서 지운 문구를
  인용하고 있었다.

## 7. 남긴 것 — 지금 고치지 않은 이유

- **`isSerializationConflict`의 잠재 TypeError.** `"meta" in error`는 통과하는데 `meta`가 null이면
  `meta.driverAdapterError`에서 터진다. `meta?.`로 고치면 throw가 false로 바뀌어 **동작이 바뀐다** —
  옮기는 작업에서 동작을 함께 바꾸지 않았다. Prisma 오류에 meta가 null인 경우는 관측된 바 없다.
- **`stats/page.tsx`의 규정 행 `rowKey`.** 지금은 서비스의 접기 열쇠를 화면이 쓰는 (kind·label)로
  맞춰 중복 key를 막았다. **더 옳은 모양은 화면이 `ruleId`를 행 key로 쓰는 것이다** — 그러면
  이름이 같은 별개 규정 둘이 각자 한 줄을 갖는다. 화면과 서비스를 함께 옮겨야 한다.
- **반 명단 카드 모드의 라벨 중복.** 좁은 화면에서 `<dt>벌점</dt><dd>53 (벌점 기준 초과)</dd>`로
  「벌점」이 두 번 읽힌다. 문구를 「기준 초과」로 줄이면 표(라벨 없음) 쪽이 무엇의 기준인지 잃는다.
- **DOM 렌더 테스트.** 폼 리셋·접근성 수정은 단위 테스트로 덮을 수단이 없다 — vitest가
  `environment: "node"`이고 jsdom·testing-library가 없다. 새 의존성 추가는 별도 결정이다.
- **`AuditLog`에 `@@index([createdAt, id])`.** 새 정렬을 인덱스 하나로 다 덮지는 못한다.
  전교 200~300명 규모에서는 Postgres의 incremental sort로 충분하다. 감사로그가 커져 목록이
  느려지면 그때 넣는다.

---

## 8. 기각된 13건 — 왜 결함이 아닌가

나중에 같은 지적이 다시 올라올 수 있어 사유를 남긴다. **대부분은 도달 경로가 없다는 이유였다.**

| 지적 | 기각 사유 |
|---|---|
| 소프트삭제 계정의 잔여 세션이 무한 리다이렉트에 갇힌다 | `status='ACTIVE'` + `deletedAt` 있는 행이 필요한데 **`deletedAt`에 값을 쓰는 코드가 없다** (§4의 문서 불일치가 이 사실의 다른 얼굴이다) |
| 권한 거부가 「파일을 읽지 못했습니다」로 나간다 | 전제한 「관리자를 학생으로 강등」 기능이 없다 — `updateUser`가 바꾸는 항목에 role이 없고 저장소 전체에 `user.role`을 쓰는 update가 없다 |
| 규정·설정·학생 관리 액션에 FORBIDDEN 문구가 없다 | 관리자 전용 페이지 안에서만 불리고 `can()`이 ADMIN을 무조건 통과시킨다 — 던질 상대가 없다 |
| `revokeInviteAction`만 zod 없이 캐스팅한다 | 관례에서 벗어났을 뿐 결함이 아니다. 어떤 값이 와도 `findById`가 null을 주고 「코드를 찾을 수 없습니다.」가 나간다 — 정확한 문구다. 소유권 검사도 그대로 산다 |
| 학년도 없을 때 학생·학부모에게 관리자 링크를 안내한다 | `isCurrent`를 내리는 코드가 없어 그 상태 자체가 앱 경로로 성립하지 않는다 |
| 인쇄 화면이 `StatTile` 대신 손으로 그린다 | `StatTile`로는 표현 못 한다 — 값 크기를 조건부로 바꿔야 하는데 값 클래스가 고정이고 이 저장소의 `cn()`은 tailwind-merge가 아니다 |
| 학생 상세 카드 제목이 `SectionCard` 크기를 덮는다 | 흘린 override가 아니라 「상세 화면 주체 이름 = 22px」이라는 앱 전체 관행이다 |
| 대시보드의 「~해 보세요」가 문구 규칙 위반 | 규격 §3의 완충어 목록은 셋으로 한정되고 이 표현은 없다 — 취향 논지다 |
| `api/health`의 Prisma 직접 호출에 예외 문서가 없다 | 그 파일 3-13행 주석이 이미 「3계층 규칙의 의도된 예외다」로 시작해 근거를 적는다 |
| `seed-demo`의 운영 차단 가드가 통과된다 | 문서화된 운영 `DATABASE_URL`의 호스트는 `db`라 로컬 판정이 false가 되어 가드가 정확히 발동한다 |
| 체크리스트가 `NAV_ITEMS`만 지목해 관리자 메뉴가 하단탭으로 샌다 | 현재 잘못 들어간 항목이 없고, 그 파일을 열면 두 배열의 구분 주석이 위아래에 붙어 있다 |
| Dockerfile builder에 `BETTER_AUTH_SECRET`이 없어 빌드가 깨진다 | 실측이 반대다 — 시크릿 없이 돌린 빌드가 오류 한 줄을 **로그로만** 남기고 종료코드 0으로 끝났다. compose는 `${BETTER_AUTH_SECRET:?}`로 런타임을 막는다 |
| `AuditLog.targetId` 인덱스 부재 | 전교 200~300명 규모에서 지금 문제가 아니라는 이유로 기각됐으나, 비평 에이전트가 다시 올려 **시한부 기각**으로 두었다가 결국 인덱스를 넣었다 (§5-1) |

---

## 9. 감사 후 상태

```
npm run typecheck   통과
npm run lint        통과, 경고 0
npm test            1531건 통과 (89파일) — 감사 전 1400건
npm run build       통과, 25개 라우트
npm run test:integration   ← 아직 안 돌렸다 (§5-2)
```

변경 규모: 80개 파일 · +2378 / −362. 새 파일 6개
(`src/app/(app)/not-found.tsx`, `src/core/db/transaction-conflict.ts`, 마이그레이션 1개, 테스트 3개).
