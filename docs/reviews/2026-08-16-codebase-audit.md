# 코드베이스 전면 감사 — 2026-08-16

> **이 문서는 감사 시점의 기록이다. 아래 항목은 `52f63ad..` 에서 대부분 처리됐다.**
> 처리 내역은 그 구간의 커밋 메시지에 있고, 무엇이 남았는지는 이 절에만 적는다.
>
> **일부러 남긴 것** — 지금 실제로 어긋난 동작을 만들지 않고, 손대면 화면 6~10개를
> 동시에 건드려야 해서 다음 화면을 추가할 때 함께 뽑는 편이 낫다고 판단한 것들이다.
> - **D-11 (`track`/`year` searchParams 파서 6곳·4곳)** — 모든 폴백이 `"SCHOOL"`로 같고
>   `/^\d{4}$/`도 네 곳이 동일해 지금은 어긋나지 않는다. 스키마 쪽 `year` 규칙은
>   `MIN_YEAR`/`MAX_YEAR`로 통일해 세 갈래 → 두 갈래가 됐다.
> - **D-12 (학년·반·번호 표기, 미배정 3종)** — 같은 이유.
> - **`auth.ts`의 `session.cookieCache`** — `getSessionUser`를 React `cache()`로 감싸
>   요청당 1회로 줄였다. 그 위의 쿠키 캐시는 세션 무효화 지연이라는 별개의 트레이드오프라
>   따로 판단할 일이다.
> - **그래프 실데이터 경로 테스트** — 대신 쓰기 쪽에 발생일 범위 검사 10건을 붙여 애초에
>   축 밖 기록이 생기지 않게 막았다. 읽기 쪽 구간은 여전히 목으로 덮여 있다.
> - **`/merit/recent`의 묶음 카운트 로직** — 서비스는 테스트가 생겼지만 화면의
>   `batchSizes`/`seenBatches` 계산은 미검증.
> - **터치 타깃 44px** — 칩은 모바일에서 ~31px, `Button size="sm"`은 ~29px. 시안 규격을
>   통째로 키우는 일이라 디자인 결정이 먼저다.
> - **소프트 삭제 학생의 집계 3곳**(반 명단·반별 요약·기준 초과 명단)과 학부모 자녀 목록 —
>   기본 결과가 조용히 늘어나면 그 필터를 넣은 이유가 되살아난다. 상세·검색만 열었다.
>
> **결정이 필요한 것 (코드로 못 정한다)**
> - `DEMERIT_THRESHOLDS`의 20/30은 여전히 임시값이다.
> - 대량 삭제 임계 비율 10% — 분모에서 졸업생을 뺐지만, 재학 300명이면 임계가 30이라
>   **한 반(25명)이 통째로 빠진 파일은 여전히 안 걸린다.**
> - `/merit/students`(명단에서 빠진 학생 찾기)는 상벌점 검색과 사용자 상세 두 곳에서만
>   잇고 좌측 메뉴에는 넣지 않았다 — `titleForPath`가 가장 긴 접두사를 고르므로 넣는 순간
>   학생 상세 화면의 상단바 제목이 함께 바뀐다.

Opus 에이전트 3개(기능·정확성 / 일관성·가독성 / 컴포넌트화·UI)가 `src/**` 전체를 읽고
보고한 것을, 주장마다 원본 코드를 다시 열어 대조한 결과다. **대조에서 살아남은 것만 적었다.**

기준선: `npm run verify` 통과 (typecheck·lint·702 tests), `npm run test:integration` 통과 (12 tests).
즉 아래 항목은 **전부 기존 검사망을 통과하는 것들**이다.

---

## Critical

### C-1. 최초 관리자 생성이 100% 실패한다

`src/app/(auth)/register/actions.ts:39-44`

```ts
const parsed = bootstrapSchema.safeParse({
  name: formData.get("name"),
  email: formData.get("email"),
  password: formData.get("password"),
  confirmPassword: formData.get("confirmPassword"),
});   // ← phone이 없다
```

`bootstrap.schema.ts:8`의 `phone: phoneField`는 필수(`user-fields.ts:20-27`, optional 아님)이고,
폼은 `bootstrap-form.tsx:53`에서 `name="phone"`으로 값을 **보내고 있다**. 액션만 안 읽는다.

실제로 돌려서 확인했다:

```
success: false
첫 메시지: Invalid input: expected string, received undefined
```

**결과:** 새로 배포한 서버에서 콘솔에 찍힌 부트스트랩 링크를 열어 폼을 채우면, 어떤 값을
넣어도 영문 zod 기본 메시지가 뜨고 관리자가 만들어지지 않는다. `createInitialAdmin`은
호출조차 안 된다. **시스템에 처음 들어가는 유일한 문이 막혀 있다.**

원인: 마이그레이션 `20260812235208_user_phone_required`에서 phone이 필수가 됐는데 이 액션만
따라가지 않았다. 테스트가 통과하는 이유는 `bootstrap.service.test.ts:26`이 서비스에 phone을
직접 넣어 부르고, **액션 경계를 검증하는 테스트가 없기 때문**이다.

수정: `phone: formData.get("phone")` 한 줄 추가 + 액션 경계 테스트.

---

## Major — 기능

### M-1. `rounded-input`은 존재하지 않는 클래스다 (조용히 깨져 있음)

`merit/admin-view.tsx:127,131` · `admin/merit/rules/page.tsx:94,98`

`globals.css`의 `@theme`에 있는 반경 토큰은 `--radius-btn` / `--radius-btn-lg` /
`--radius-field` / `--radius-card` 넷뿐. `--radius-input`은 없다. Tailwind는 모르는
유틸리티를 조용히 버리므로 두 화면의 검색창·검색 버튼만 직각으로 뜨는데,
타입검사·lint·빌드 어디서도 안 잡힌다.

같은 종류: `merit/students/[studentId]/page.tsx:160`의 `border-amber`
(토큰은 `amber-soft`/`amber-ink`뿐). 테두리 색이 `currentColor`로 떨어져 글자와 같은
진한 갈색 선이 나온다.

### M-2. 소프트 삭제된 학생의 상벌점에 닿는 경로가 하나도 없다

`merit.repo.ts`의 학생 조회 함수 **10곳 전부** `deletedAt: null`로 거른다
(`:273 :280 :333 :386 :428 :456 :504 :660 :678 :830`).

3학년 2학기에 명단에서 빠진 학생의 벌점 내역을 선도위원회 자료로 다시 뽑아야 할 때:
`/merit/students/<id>`는 `notFound()`, 검색·반 명단·통계 어디에도 안 나온다. MeritAward
행은 DB에 그대로 있는데 조회 경로가 없다. 남은 방법은 `/admin/logs?action=merit:award`를
50건씩 넘기며 metadata의 이름을 눈으로 찾는 것뿐(학생 필터가 없다).

### M-3. 소프트 삭제가 그 학년도 Enrollment를 실제로 지운다 — 화면 문구 3곳과 어긋난다

`roster.repo.ts:195-197`이 `enrollment.deleteMany`를 돌리고, 삭제 대상 학생은
`assignments`에 없어 다시 만들어지지 않는다.

그런데 관리자에게는 이렇게 보인다 — `admin/users/[userId]/page.tsx:182`:
> "학적·소속·기록은 그대로 남아 있으며"

같은 취지의 문구가 `import-form.tsx:293` · `roster.repo.ts:122` · `schema.prisma:43`에도 있다.
반대로 통합 테스트(`roster.repo.apply-roster.integration.test.ts:136-139`)는 현재 동작을
`expect(enrollment).toBeNull()`로 못 박아 두어, 어긋남을 어떤 테스트도 드러내지 않는다.

**동작이 버그인지 문구가 버그인지는 코드만으로 못 가른다.** 어느 쪽이든 셋 중 둘은 고쳐야 한다.
자퇴생의 "2026학년도에 몇 학년 몇 반이었나"에 답할 데이터가 사라지는 건 사실이다.

### M-4. 일괄 취소 감사로그에 학생 이름이 빠진다

`merit.repo.ts:786-798`의 `findBatch`가 `studentProfile.user.name`을 안 가져온다.
단건 경로(`merit.repo.ts:174-176`)는 정확히 이 목적으로 가져오고, 주석까지 달려 있다.

사감이 28명에게 일괄 부여 후 묶음 취소하면 감사로그 28줄이 전부
`기숙사 · 벌점 3점 · 점호 지각 · 사유: …`로 **완전히 동일**해 누구 기록이 뒤집혔는지
구분할 수 없다. 같은 28건을 단건으로 취소했다면 전부 이름이 붙는다.
"관리자면 누구나 취소할 수 있다"는 결정의 근거가 감사로그인데, 일괄 경로에서만 근거가 빈다.

곁들여: `award.service.ts:237-266`은 `findBatch`가 센 건수(30)로 감사로그를 남기고
`cancelBatch`가 실제 고친 건수(28)를 따로 받는다. 그 사이 누가 2건을 단건 취소하면
감사로그 2줄이 거짓이 된다. 단건 경로는 `cancelled === 0` 검사로 정확히 이걸 막고
테스트도 있다(`award.service.test.ts:392`). 묶음에는 짝이 없다.

### M-5. `listAwardYears`만 `assertCan`이 없다

`award.service.ts:477-479`. 주석은 안전한 호출 경로를 **둘** 열거하는데 실제 호출부는 **셋**이다 —
`merit/students/[studentId]/page.tsx:86`이 URL 파라미터를 그대로 넘긴다.

나머지 호출부(`merit/page.tsx:63`, 학부모 경로)는 확인 결과 안전하다 — `getChildMerit`이
성공한 **뒤에만** 부르고 그 사실이 주석으로도 적혀 있다. 문제의 호출부는
`students/[studentId]/page.tsx:86` 하나이고, 그 페이지는 `requirePermission`으로 먼저
막으므로 **지금 실제로 뚫리지는 않는다.** 하지만 CLAUDE.md의
"페이지에서 이미 막았어도 다시 검사한다"를 어긴 유일한 서비스 함수고, 형제 함수
`getStudentHeader`·`getStudentMerit`는 전부 `assertCan`을 부른다. **주석이 실제 호출부를
담지 못한다는 게 더 큰 문제** — 다음 사람이 이 주석을 믿는다.

### M-6. 상쇄점 받은 학생을 375px에서 열면 합계 카드가 겹친다

`components/merit/merit-totals.tsx:15` — `grid-cols-4`에 브레이크포인트가 없다.

375px → `main`의 `p-4`로 343px, `gap-3` 3개(36px)를 빼면 칸당 77px, `Card`의 `px-4`(32px)를
또 빼면 내용 폭 **45px**. 거기에 `text-[24px] font-extrabold`로 `+120` 같은 값이 들어간다.
Tailwind grid 트랙은 `minmax(0,1fr)`이라 잘리지 않고 옆 카드 위로 흘러나온다.

상쇄점은 선도관리위원회 의결로만 나가는 드문 항목이라 개발 중엔 잘 안 밟히는데,
**정작 눈으로 확인해야 하는 상황이 그때다.** 3칸일 때(내용 폭 74px)는 문제없다.
같은 패턴이 `print/page.tsx:112`에도 있다(20px 폰트라 아슬아슬).

### M-7. `error.tsx`가 앱 전체에 0개다

`find src/app -name error.tsx` → 0건. `loading.tsx`는 4개인데 **바이트 단위로 동일**하고
실제 화면과 안 맞는다(`/merit/stats`는 통계 칸 5개인데 스켈레톤 3개, `/merit/recent`는
통계 칸이 없는데 3개를 그린다).

서비스가 던지면 Next 기본 500이 뜨고 **앱 셸까지 사라진다** — 사용자가 돌아갈 길이 없다.
`loading.tsx`가 없는 화면: 대시보드(집계 4개 병렬 await), `/admin/logs`, `/admin/students`,
`/admin/users`, `/admin/invites`, `/merit/students/[studentId]`.

### M-8. `import-form.tsx:5`만 xlsx를 정적 import 한다

```tsx
"use client";
import writeXlsxFile from "write-excel-file/browser";
```

`merit/export-button.tsx:31`은 같은 라이브러리를 동적 import 하면서 이유까지 주석으로 적어 뒀다.
`/admin/students/import`를 **열기만 해도** zip/xlsx writer 전체가 내려온다. 실제 사용 시점
셋(서식 내려받기·명단 내려받기·초대코드 목록)은 전부 사용자가 눌러야 하는 경로이고,
세 함수 모두 이미 `async`다.

### M-9. `merit.chart.ts`의 머리 주석이 코드와 정반대다

```
 * 집계는 전부 meritKindDelta를 거친다. 종류가 또 늘어도 이 파일은 안 고쳐도 된다.
```

실제 `monthlyTotals`(`:119-121`)는 `if/else if/else if` 3분기를 손으로 쓴다.
`meritKindDelta`는 `categoryDistribution`의 **정렬**에만 쓰인다. 종류가 하나 더 생기면
`monthlyTotals`가 그 값을 **말없이 버린다** — `merit-track.ts:70-71`이
"합계가 조용히 틀어지는 것보다…"라며 경계한 바로 그 실패다.

---

## Major — 중복·일관성

이 저장소에는 이미 선례가 있다. `kind-badge.tsx:8-14` —
"예전엔 `kind === "MERIT" ? 파랑 : 빨강` 꼴이 화면마다 흩어져 있었다 … 종류가 또 늘어도
여기만 고치면 되도록 모은다." **색은 모았는데 나머지는 안 모았다.**

| # | 중복 | 발생 수 | 제안 |
|---|---|---|---|
| D-1 | 종류→상점/벌점/상쇄 버킷 접기 | **4곳** `award.service.ts:78-83` · `merit.repo.ts:360-367` · `:534-536` · `merit.chart.ts:119-121` | `merit-track.ts`에 모은다 |
| D-2 | `net = merit + offset − demerit` | **5곳** 위 4곳 + `merit-totals.tsx:23` | 같이 모은다 |
| D-3 | 순점수 부호 `>= 0 ? "+" : ""` | **13곳** (charts 7 · stats 3 · 나머지 3) | `signedNet(n)` — `kind-badge.tsx:49`의 `signedPoints`가 kind 버전 |
| D-4 | 트랙 탭 pill JSX | **6곳** | `<TrackTabs current hrefFor>` |
| D-5 | 필터 칩(작은 pill) | **11곳** | `<ChipLink href active size>` + `aria-current` |
| D-6 | `hrefWith` 쿼리 조립 | **8곳** (stats·rules는 경로만 다른 완전 동일 구현) | `lib/search-params.ts` |
| D-7 | 에러·성공 배너 | **22곳** (17+5), 그중 `import-form.tsx:381,387,393` 3곳은 `role="alert"` 누락 | `<Note tone>` — `user-forms.tsx:41-54`의 `Note`가 이미 그것 |
| D-8 | 카드 섹션 헤더 | **18곳** | `<SectionCard>` — `charts.tsx:25-43`의 `ChartCard`가 이미 그것 |
| D-9 | 표 껍데기(overflow+colgroup+thead) | **13곳** | `<TableFrame minWidth cols headers>` |
| D-10 | 빈 상태 카드 | **9곳** + 표 안쪽 4곳(다른 규격) | `<EmptyState variant>` |
| D-11 | `track`/`year` searchParams 파싱 | 6곳 / 4곳 | 공용 파서. `year` 규칙이 **세 갈래**다(`/^\d{4}$/` · `z.coerce.min(2000)` · `MIN_YEAR` 상수) |
| D-12 | 학년·반·번호 표기 | 지역 헬퍼 3개 + 인라인 8곳. 미배정 표기가 `"소속 미배정"`/`"미배정"`/`"—"` **세 가지** | 하나로 |
| D-13 | 취소 확인 모달 | 2가지 구현 — `cancel-batch-button.tsx`는 `<dialog>`, `cancel-button.tsx:49`는 손수 만든 오버레이 | `<ConfirmDialog>` |

### M-10. `admin/users/actions.ts`만 `MESSAGES` 사전 없이 if 체인이다 (15곳)

`:42 :45 :46 :70 :73 :74 :96 :99 :100 :103 :150 :153 :156 :159 :165`

다른 액션 4곳은 전부 사전을 쓴다(`merit/actions.ts:23`, `admin/students/actions.ts:18`,
`import/actions.ts:20`, `rules/actions.ts:14`). 부작용으로 같은 문구가 3번씩 복붙돼 있다.

### M-11. 사용자 상세가 감사로그 액션을 영문 원본으로 노출한다

`admin/users/[userId]/page.tsx:151` — `{entry.action}`을 그대로 그린다.
`user:reset-password`, `authz:denied` 같은 문자열이 관리자 화면에 보인다.
`audit-log.labels.ts`의 `auditActionLabel()`·`auditActionTone()`·`formatAuditMetadata()`가
이미 있고 `/admin/logs`(`:97-111`)는 셋 다 쓴다. 이 화면만 라벨 계층을 건너뛴다.

### M-12. `NumberTakenError`가 두 번 정의돼 있다

`core/db/unique-violation.ts:41`(정본)과 `registration/registration.repo.ts:20`(별개 클래스).
정본 주석이 정확히 이걸 경고한다 — "모듈마다 같은 이름의 별개 클래스를 두면 `instanceof`가
모듈을 건너 통하지 않아 조용히 새는 자리가 된다." `enrollment.repo.ts:2`·`admin-user.repo.ts:2`는
core에서 import해 re-export하는데 registration만 새로 만든다.

### M-13. 접근성 — 색·마우스에만 의존하는 곳

- `aria-pressed` / `aria-sort` **전체 0건.** 필터 칩 8덩어리는 선택 상태가 색으로만 전달된다.
  `button.tsx`에 한 줄(`{...(isChip ? { "aria-pressed": active } : {})}`)이면 8곳이 해결된다.
- **표 정렬을 키보드로 못 한다** — `class-roster.tsx:143-148,158-163`의 `<th>`에 `onClick`만
  있고 `tabIndex`도 `role`도 없다. "순점수 낮은 순"에 도달할 대체 경로가 없다.
- **검색 입력 6곳에 라벨이 없다** — `admin-view.tsx:123` · `rules/page.tsx:90` ·
  `invite-table.tsx:121` · `user-table.tsx:102` · `student-table.tsx:186` · `log-filters.tsx:91`.
  같은 파일의 다른 입력은 `aria-label`이 제대로 붙어 있다(`student-table.tsx:258`).
- **단건 취소 모달에 포커스 트랩·Esc가 없다** (`cancel-button.tsx:49`). `mobile-nav.tsx:32-33`이
  `<dialog>`를 쓰는 이유로 정확히 그 셋을 든다. 게다가 `!open`일 때 트리거를 반환하지 않아
  모달이 열리는 순간 포커스가 `<body>`로 떨어진다.
- **`id="batch-cancel-reason"`가 묶음마다 중복 렌더된다** (`cancel-batch-button.tsx:69,75`).
  `<dialog>`가 조건부가 아니라 항상 렌더되므로, 묶음이 N개면 같은 id가 N개다.
  `award-form.tsx:24`·`class-roster.tsx:51`이 이미 `useId()`를 쓴다.
- `<a href>` 3곳(`charts.tsx:262,316` · `class-roster.tsx:180`)이 `<Link>` 대신이라
  통계 막대를 누를 때마다 문서 전체가 다시 로드된다.

### M-14. `getSessionUser`가 `cache()`로 감싸이지 않았다

`core/auth/session.ts:23`. `(app)/layout.tsx:12`가 `requireAuth()`를 부르고 그 아래 모든
페이지가 다시 부르므로 페이지당 최소 2회 세션 조회가 돈다. `auth.ts`에 `cookieCache`도 없다.

같은 저장소가 정답을 갖고 있다 — `academic-year.service.ts:21`의
`export const getCurrentYear = cache(async () => …)`에 "한 요청 안에서는 한 번만 조회한다"는
주석까지 달려 있다. 세션만 그 규약에서 빠졌다. (`requireAuth`/`requirePermission`은 리다이렉트를
하므로 감싸면 안 된다.)

---

## 테스트 구멍

1. **`cancelBatch` 계열 0건.** `cancelBatch`·`findBatch`·`BATCH_NOT_FOUND`를 언급하는 테스트가
   `tests/` 전체에 없다(grep 0). 위 M-4의 두 결함이 정확히 이 공백에서 나왔다 — 단건 취소는
   두 규칙 모두 테스트가 있다.
2. **`listRecentAwards` 0건.** `/merit/recent`의 묶음 카운트 로직(`page.tsx:39-45`)도 미검증.
3. **repo 집계 복제본 2개가 어떤 테스트도 통과시키지 않는다.** 순점수 계산이 세 곳에 복제돼
   있는데(D-1/D-2), `merit.offset.test.ts`·`merit.watch-list.test.ts`는 repo를 목으로 둔다.
   셋 중 하나만 잘못 고치면 학생 상세·반 명단·통계에 서로 다른 순점수가 뜬다.
4. **액션 경계가 통째로 미검증.** C-1이 여기서 샜다. 서비스 테스트는 두꺼운데 `actions.ts`의
   `formData` → `safeParse` 구간을 검증하는 테스트가 없다.
5. **그래프가 실데이터로 채워지는 경로 미검증.** `merit.chart.test.ts`는 순수 함수만,
   `merit.stats-scope.test.ts`는 `listAwardsForChart`를 빈 배열로 목킹한다.
   축 밖 기록을 말없이 버리는 지점이 서비스 레벨에서 한 번도 실행되지 않는다.

---

## Minor

- **죽은 코드** — `admin-user.repo.ts:194 setStatus`(호출부 0, `setActive`가 대체),
  `merit.schema.ts:145 ClassRosterQuery`(참조 0),
  `verification.service.ts:133`의 도달 불가 분기(`:113-117`에서 이미 반환),
  `merit/recent/page.tsx:30-35`의 `AcademicYearError` 처리(`listRecentAwards`는
  `getCurrentYear()`를 안 탄다),
  `rule-table.tsx:115,136`의 `${"text-ink"}`.
- **어조 혼용** — `~하세요` vs `~해 주세요`가 섞인다. `verification.service.ts`는 같은 파일
  안에서도 갈린다(`:83,:95` vs `:129`).
- **`merit.schema.ts`만 zod 메시지에 마침표가 없다** (7곳). 이 문구는 그대로 화면에 나간다.
- **시각 컬럼 이름이 셋** — `시각`(logs·recent) / `입력`(award-history·print) / `입력일`(엑셀).
  `occurredOn`도 `발생일` vs `발생`으로 갈린다. 확인서·엑셀은 화면 밖으로 나가는 문서다.
- **"비활성" 용어가 두 대상에 섞임** — 규정은 "삭제"로 통일했는데(`deleteRule`·감사 라벨·확인
  문구) `merit/actions.ts:25`의 오류 문구만 "비활성된 규정입니다."로 남았다.
- **상수를 손으로 다시 적은 곳** — `merit/actions.ts:31`의 `"100명까지"`(스키마는
  `BULK_AWARD_LIMIT`), `year-switcher.tsx:73-74`의 `min={2000} max={2100}`(스키마는
  `MIN_YEAR`/`MAX_YEAR`).
- **명단 반영이 초대코드를 폐기하면서 감사로그를 안 남긴다** (`roster.repo.ts:171-180`).
  `registration.service.ts:100-114`가 정확히 같은 이유로 `invite:auto-revoke`를 추가한 전례가 있다.
- **대량 삭제 임계의 분모가 졸업생을 포함한다** (`roster.plan.ts:113` + `roster.repo.ts:21`의
  `listExisting`이 학년도 조건 없이 전체 STUDENT를 가져옴). 개교 4년 차 600명이면 임계 60이라
  한 반(25명)이 통째로 빠져도 안전장치가 안 걸린다. 주석이 막으려던 부풀림이 졸업생 쪽으로 남았다.
- **만료된 PENDING 코드가 학부모 코드 3개 한도를 계속 차지한다** (`invite.repo.ts:62-66`의
  `countActiveByStudent`가 `expiresAt`를 안 본다). 손으로 3개를 폐기해야 풀린다.
- **완전 삭제가 그 사람이 발급한 USED 초대코드까지 하드 삭제한다** (`admin-user.repo.ts:250-254`).
  이미 가입한 학생들의 "어떤 코드로 언제 가입했나" 기록이 통째로 사라진다.
- **비재학 신규 줄이 흔적 없이 버려진다** (`roster.service.ts:194`). 미리보기는 "신규 N"으로
  세는데 확정 후 아무것도 안 생기고 오류도 없다.
- **권한 거부가 다른 원인으로 안내된다** — `admin/invites/actions.ts:144`의 catch-all이
  `ForbiddenError`를 "이미 사용되었거나 폐기된 코드입니다"로 덮는다. 감사로그에는
  `authz:denied`가 정확히 남는데 화면이 거짓말을 한다.
- **부여가 학생의 학적을 안 본다** (`award.service.ts:123-141`). 졸업생에게 준 벌점은 학생
  상세에서만 보이고 반 명단·통계 어디에도 안 나온다. (기준 초과 명단이 "학적 변동 중"을 일부러
  포함하는 설계이므로 의도일 수 있다.)
- `admin/users/actions.ts:35,62,89-90,125`가 zod 없이 `String(formData.get(...))`을 쓴다.
  실제 피해는 없지만 규약 이탈.
- `api/health/route.ts:8`이 라우트에서 Prisma를 직접 부른다. 인프라 헬스체크라 실질 위험은
  없지만 유일한 예외이므로 주석 한 줄이 낫다.
- `enrollment.service.ts:108-110`의 불필요한 `as unknown as string[]`.
  형제 코드 `rule.service.ts:57`은 단언 없이 같은 일을 한다.
- `audit-log.schema.ts:21-26`이 KST 자정 계산을 손으로 구현한다. `lib/datetime.ts:1-7`이
  "여기 한 곳에서만 만든다"고 적어 뒀고, `parseDateInputKst(formatDateInput(now))` 한 줄이면 된다.
- `audit-log.labels.ts:22-23`의 주석이 "13종 + 2"라고 하는데 실제 배열은 24개다.
- `verification.schema.ts:29`만 익명 `Error`를 던져, 정제된 한글 문구가 일반 폴백에 덮인다.
- `admin/invites`·`parent-invite`·`change-password`·`(auth)/register` 4개 모듈이
  `action-state.ts` 관례를 안 따른다(5개 모듈은 따른다).
- 내보내기 계층 위치가 모듈마다 다르다 — 명단은 서비스(`roster.service.ts:45`),
  상벌점은 액션(`merit/actions.ts:194,248`).
- 터치 타깃 — 작은 pill 29px, `Button size="sm"` 27px, `cancel-button` 트리거 19px.
  야간 점호 중 휴대폰으로 쓰는 화면이다.
- `<h1>`이 화면당 둘인 곳 5개(상단바가 이미 `<h1>`을 그린다).
- 장식 문자(`→`, `✕`, `←`)에 `aria-hidden`이 없다.
- `sidebar.tsx:71-72`가 네비게이션 링크에 `aria-expanded`를 달았고,
  그룹 부모와 하위 항목에 `aria-current="page"`가 동시에 붙는다.
- `charts.tsx:452-457`의 `barColor`가 kind→색 매핑을 `kind-badge.tsx` 밖에 새로 만들었다
  (같은 파일이 `kindColorClass`는 가져다 쓴다).
- `charts.tsx:229,339`의 `<span aria-label="벌점 기준 초과">!</span>` — role 없는 span의
  `aria-label`은 대부분의 AT가 무시하고 "느낌표"만 읽는다.
- 불필요하게 넓은 export — `rule-filter.ts:30,40,48`, `user-fields.ts:13`,
  `roster.plan.ts:72,74`.

---

## 파일 크기

- **`award.service.ts` (781줄) — 쪼갤 경계가 명확하다.** CLAUDE.md가 "서비스는 책임별로
  나눈다"고 이미 정했고 **통계가 세 번째 책임**이다. `stats.service.ts`로 뽑을 덩어리:
  `MeritStats`(`:533-563`) · `WatchListRow`(`:569-578`) · `MeritSummary`(`:642-647`) ·
  `readWatchList`(`:591-640`) · `getMeritSummary`(`:658-675`) · `getMeritStats`(`:680-764`) ·
  `monthStart`(`:767-770`) · `TOP_RULE_LIMIT`(`:678`) — 약 230줄. 화면 경계
  (`app/(app)/merit/stats/`)와 정확히 일치한다. 공유가 필요한 건 `MeritTotals`·`sumTotals`·
  `scopeYear` 셋뿐이라 순환 참조도 없다.
- **`merit.repo.ts` (837줄) — 쪼개라고 권하지 않는다.** CLAUDE.md가 `merit/`을 설명하며
  "**repo는 하나**, 서비스는 책임별로 나눈다"고 명시한다. 지금 쪼개면 규약 위반이다.
  쪼개려면 CLAUDE.md를 먼저 고쳐야 한다. 다만 섹션 순서는 고칠 만하다 —
  "일괄 취소"(`:783-820`)가 "일괄 부여"(`:289-310`)에서 500줄 떨어져 있다.

---

## 확인했으나 문제 없었던 영역

- **권한.** 모든 `"use server"` 액션이 `requireAuth()`로 시작한다(가입·부트스트랩 5개는 의도된
  예외). 서비스마다 `assertCan()`이 다시 걸려 페이지 가드를 건너뛰어도 안 뚫린다.
  세션에서 유도 가능한 식별자를 클라이언트에서 받는 곳이 없다 — 학부모의 자녀 접근은
  `isChildOf` 소유권 검사를 거친다. **권한 우회 경로는 찾지 못했다** (M-5는 규약 이탈이지
  실제 우회가 아니다).
- **상쇄점 3종 처리.** 순점수 = 상점 + 상쇄 − 벌점이 6곳에서 모두 일치한다. 상쇄점이
  상점·벌점 칸에 접히는 곳은 없다. (복제 자체는 D-1/D-2로 지적했다.)
- **KST·학년도 스코프.** 날짜 입력이 `parseDateInputKst` 하나만 거치고, 월 구분은
  `Intl.DateTimeFormat(timeZone: "Asia/Seoul")`로 자른다. 교내=학년도 / 기숙사=누적 분기는
  `scopeYear` 한 곳에 모여 있다.
- **트랜잭션·제약.** 명단 반영·표 저장·사용자 수정·일괄 부여·가입이 전부 단일 `$transaction`이고
  감사로그는 커밋 뒤에만 남긴다. `AcademicYear.isCurrent` 부분 유니크 인덱스는 마이그레이션
  SQL에 실제로 존재하고, 초대코드 소진은 조건부 `updateMany`로 경쟁을 막는다.
- **오류 코드 → `MESSAGES` 커버리지.** 서비스가 던지는 코드 45종을 사전과 하나씩 대조했고
  화면에 영문 코드가 뜰 구멍은 없다 (C-1의 zod 기본 메시지는 별개 경로다).
- **타입 안전성.** `any` 0건, 위험한 단언 3건뿐(2건은 globalThis 확장이라 정당).
- **계층.** 페이지·서버액션에서 Prisma를 직접 부르는 곳은 헬스체크 하나뿐.
- **`"use client"` 배치.** 26개 전부 실제로 클라이언트 기능을 쓴다. `useMemo`도 실제 비용이
  있는 곳에만 있다. 과잉 최적화 없음.
- **표의 가로 스크롤.** 13개 표 전부 `overflow-x-auto` + `min-w`로 감싸여 있어 375px에서
  페이지가 가로로 밀리지 않는다.
