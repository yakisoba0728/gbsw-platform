# 코드베이스 전수 감사 — 2026-08-31

> **이 문서는 검사 시점의 스냅샷이다.** 코드를 읽고 찾은 것이며, 제품 코드는 고치지 않았다.
> 같은 날짜의 [`2026-08-31-functional-uiux-sweep.md`](2026-08-31-functional-uiux-sweep.md)와는
> 성격이 다르다 — 그쪽은 앱을 눌러 본 기록이고, 이 문서는 **코드를 읽은 기록**이다.
> 마지막 코드 읽기 감사는 [`2026-08-26`](2026-08-26-codebase-audit.md)이었고, 그 이후 들어온
> **커뮤니티 모듈을 감사 기록 문서로 다루는 것은 이 문서가 처음이다** (개발 중의 점검은
> 커밋 `60b6eaa`가 남아 있으나 문서로 정리되지 않았다).

기준선: `main @ 0276e45`

## 1. 범위와 방법

저장소를 여덟 영역으로 갈라 병렬로 읽었다. 각 담당은 승인된 예외(bootstrap의 `can()` 없음,
verification의 감사로그 없음, 커뮤니티 게시판 판정이 `can()` 밖)와 2026-08-26 감사의
「고치지 않기로 한 것」을 재보고 금지 목록으로 받았다.

| 영역 | 대상 |
|---|---|
| 커뮤니티 | `modules/community/**` · `app/(app)/community/**` · `app/(app)/admin/community/**` · `api/community/**` · `markdown.tsx` · `plain-text.tsx` |
| 전자출입증 | `modules/pass/**` · `app/(app)/pass/**` · `app/scan/**` · `api/pass/**` · `components/pass/**` |
| 상벌점 | `modules/merit/**` · `app/(app)/merit/**` · `app/(app)/admin/merit/**` · `components/merit/**` |
| 학년도·명단 | `modules/enrollment/**` · `modules/academic-year/**` · `app/(app)/admin/students/**` · `app/(app)/students/**` |
| 인증·권한 | `core/**` · `modules/{registration,invites,verification,bootstrap,account,admin-users,audit-log}/**` · `app/(auth)/**` · `app/change-password/**` · 관리자 화면 |
| 화면 규격 | `app/**/*.tsx` 전부 · `components/**` 전부 · `lib/` 화면 보조 |
| 인프라·스키마 | `next.config.ts` · `docker-compose.yml` · `Dockerfile` · `scripts/**` · `prisma/**` · `package.json` |
| 테스트 품질 | `tests/**` 160여 파일 ↔ `src/` 대조 |

**재검증의 깊이는 항목마다 다르다.** 높음 둘과 §3.2·§3.4의 업무·인프라 항목은 보고 후 내가
파일을 다시 열어 전건 확인했고(§3.5의 수치와 §3.6의 정규식은 직접 세거나 실행해 봤다),
§3.3·§3.5·§3.6의 나머지와 §3.7의 낮음 표는 에이전트가 인용한 코드를 대조하는 수준까지
확인했다. 재검증에서 떨어진 것은 §4에 적었다. 테스트 스위트는 돌리지 않았다 — 같은 날
기능 점검이 전부 초록임을 이미 기록했다.

## 2. 결과 요약

| 구분 | 수 |
|---|---:|
| 높음 | 2 |
| 중간 | 26 (업무 6 · 권한·기록 6 · 인프라 3 · 화면 5 · 테스트 6) |
| 낮음 | 25 |
| **확정 합계** | **53** |
| 기각·격하 | 3 |

가장 무거운 사실 하나를 먼저 적는다. **`User.deletedAt`이 죽은 값이라는 것은
`schema.prisma`가 이미 인정하고 있지만, 그 위에 세워진 「명단에서 빠진 학생은 막는다」는
방어선이 지금 아무것도 막지 못한다는 사실은 어디에도 적혀 있지 않다.** 상벌점·명단·인증 세
영역의 감사가 서로 모르는 채로 같은 뿌리에 도달했다.

---

## 3. 확정 결함

### 3.1 높음

#### C-01 · 상벌점의 「명단에서 빠진 학생」 방어선이 비어 있다

**위치:** `src/modules/merit/merit.repo.ts:417`, `:724` · `src/modules/enrollment/roster.repo.ts:255-259`

```ts
// merit.repo.ts:415-419 — 주석은 이것을 "마지막 방어선"이라 부른다
export async function findAwardableStudent(id: string) {
  return prisma.studentProfile.findFirst({
    where: { id, user: { deletedAt: null } },
```
```ts
// roster.repo.ts:255-259 — 퇴학·전학은 deletedAt을 채우지 않는다
await tx.user.updateMany({
  where: { id: { in: ids } },
  data: { status: "INACTIVE", deletedAt: null, updatedAt: revisionStamp },
});
```

`src/` 전체에서 `User.deletedAt`에 non-null을 **쓰는 코드는 하나도 없다**(`schema.prisma:42`의
주석이 이 사실 자체는 적어 두었다). 명단 반영은 비재학 학생을 `status: "INACTIVE"`로 두고
`deletedAt`은 null로 되돌린다. 그래서 상벌점의 게이트를 퇴학생이 그대로 통과한다.

**실패 시나리오:** 명단 파일에 「3학년 2반 김민준 · 퇴학」으로 올려 반영한다. 그 학생의 상세를
열면 `removedAt: profile.user.deletedAt`(`merit.repo.ts:724`)이 null이라
`students/[studentId]/page.tsx:100`의 「삭제됨」 배지도, `merit-tab.tsx:127`의 「명단에서 빠진
학생입니다. 새 상벌점은 부여할 수 없습니다.」 배너도 **어떤 입력으로도 렌더되지 않는다.**
부여 폼이 그대로 서고 `findAwardableStudent`가 통과시켜 **퇴학생에게 상벌점이 부여된다.**
교사 검색 결과의 「명단 제외」 표시도 같은 이유로 나오지 않아, 동명이인 중 퇴학생을 고른 것을
알아챌 수단이 화면에서 사라진다.

같은 뿌리의 파생 둘을 함께 적는다 — `demeritTotalsByStudent`(`:1149`)가 재적을 보지 않아
졸업생이 기숙사 누적 기준 초과 명단에 매년 계속 오르고(§3.2 C-04), 로그인 페이지의 세션
게이트가 `requireAuth`와 어긋나 있어(§3.3 L-14) 값을 채우는 날 리다이렉트 루프가 된다.

**막고 있는 것:** 부여 화면에 도달하려면 교사 권한이 필요하고, 퇴학생은 목록 기본 필터에서
빠진다. 즉 실수로 밟기는 어렵지만 **막는 장치라고 적혀 있는 것이 막지 않는다.**

**권장:** `deletedAt: null`을 앱이 실제로 쓰는 술어(`status: "ACTIVE"` 또는 그 학년도
`Enrollment.status === "ENROLLED"`)로 바꾸고, `removedAt`이 무엇에서 나오는지 다시 정한다.
`tests/integration/merit.removed-student.integration.test.ts`는 픽스처가 스스로 `deletedAt`을
세우므로 이 회귀를 잡지 못한다 — 픽스처를 운영 경로(`applyRoster`)로 바꿔야 다시 붙든다.

#### C-02 · 감사로그 액션 커버리지 테스트가 3단 액션 12개를 한 번도 안 본다

**위치:** `tests/modules/audit-log/audit-log.labels.test.ts:41`, `:48`, `:63`

```ts
const matches = window.match(/"[a-zA-Z][\w-]*:[\w-]+"/g) ?? [];
```

`[\w-]+`에 `:`가 없어 두 번째 콜론에서 매칭이 끊긴다. 직접 돌려 확인했다 —

```
"community:post:update"  => null
"merit:rule:create"      => null
"invite:create:parent"   => null
"pass:approve"           => ["pass:approve"]
```

운영이 실제로 남기는 3단 액션 12개(`community:post:{create,update,delete}` ·
`community:comment:{create,delete}` · `community:attachment:{create,delete}` ·
`merit:rule:{create,update,delete}` · `merit:threshold:update` · `invite:revoke:roster`)가
검사 대상에서 통째로 빠진다. 두 번째 구멍: 스캐너가 `content.indexOf("recordAudit(")`로 찾는데
`recordAuditMany(`는 그 문자열을 포함하지 않아 `roster.service.ts:316,327,345`의 네 액션도
스캔 밖이다. 하한 `expect(recorded.size).toBeGreaterThanOrEqual(13)`은 실제로 잡히는 27보다
한참 낮아 이 축소를 알리지도 못한다.

**무엇을 못 잡는가:** `post.service.ts:275`의 `"community:post:update"`를 `"community:post:updaet"`로
오타 내도 `npm run verify`가 끝까지 초록이다. 감사로그 화면은 `auditActionLabel`이 원본 문자열로
떨어져(`audit-log.labels.ts:80-83`의 문서화된 폴백) 「글 수정」 대신 코드가 표에 찍힌다.
지금 39개 액션은 전부 `AUDIT_ACTIONS`에 있어 운영 결함은 없다 — **테스트 자체가 오늘 고장 나 있다.**

**권장:** 정규식을 `/"[a-zA-Z][\w-]*(?::[\w-]+)+"/g`로, 탐색을 `indexOf("recordAudit")`로 넓히고
하한을 실제 개수(39) 근처로 올린다.

---

### 3.2 중간 — 업무 로직·데이터

#### C-03 · 전교 통계의 모집단이 한 화면 안에서 갈린다

**위치:** `src/modules/merit/merit.repo.ts:1084-1096`(trackTotals) ↔ `:868-874`(classSummaries) ↔ `:524-530`(listClassRoster)

```ts
// trackTotals — studentProfileIds가 undefined면 학생 조건이 하나도 없다
where: { track, status: "ACTIVE", ...(totalsYear === null ? {} : { year: totalsYear }),
         ...(params.studentProfileIds ? { studentProfileId: { in: … } } : {}) },
// classSummaries — 재학 + 반 배정된 학생만
where: { year, status: "ENROLLED", studentProfile: { user: { deletedAt: null } }, classId: { not: null } },
```

`stats.service.ts:298`에서 `studentProfileIds`는 **반을 골랐을 때만** 채워진다. 전교를 볼 때
머리글 합계·많이 나온 항목·규정별·교사별·월별 그래프 다섯 질의는 학생을 전혀 거르지 않는다.

**실패 시나리오:** 5월에 벌점 12점을 받은 학생이 9월에 퇴학 처리된다. `/merit/stats` 전교 화면에서
머리글 합계와 네 집계는 그 12점을 계속 세지만 반별 요약 표에서는 그 학생이 통째로 빠진다.
반 미배정(재학인데 `classId = null`) 학생은 반대로 반별 표에서만 빠진다. 결과적으로
**머리글 합계 ≠ 반별 합계 합**, **순위표 인원 ≠ 반별 인원 합**이 되고 어느 화면도 그 차이를 설명하지 않는다.

#### C-04 · 기준 초과 명단이 재적을 보지 않아 졸업·퇴학생이 계속 오른다

**위치:** `src/modules/merit/merit.repo.ts:1135-1157`, `:1160-1179` · `src/modules/merit/stats.service.ts:83-131`

기숙사(DORM) 트랙은 `totalsYear === null`이라 누적이다. 프로필이 살아 있는 졸업생은
`deletedAt: null`(C-01)이라 필터를 통과하고, `findStudentsWithClass`는 재적을 **붙이는 값**으로만
쓸 뿐 거르지 않는다. `stats.service.ts:113`은 신원을 못 찾을 때만 줄을 버린다.

**실패 시나리오:** 2025년에 벌점 25점을 받고 2026년 2월에 졸업한 학생이 2026학년도
기준 초과 명단에 「반 미배정」으로 계속 오른다. 교사가 조치 대상으로 읽는 목록에 학교에 없는
사람이 섞이고, 해마다 쌓인다.

#### C-05 · 외출을 이어 붙이면 보호자 확인을 건너뛴다

**위치:** `src/modules/pass/pass.window.ts:74` · `src/modules/pass/pass.repo.ts:296-297`

```ts
function assertNotTooLong(type, { startAt, endAt }): void {
  if (type !== "OVERNIGHT") return;          // 외출은 길이 제한이 없다
```
```ts
startAt: { lt: endAt },   // 맞닿은 구간은 겹치지 않는다 (엄격 부등호)
endAt:   { gt: startAt },
```

**실패 시나리오:** 외출 두 건 — ① 9/1 `00:00~23:59` ② 9/2 `00:00~23:59`. 각각 날짜 하나 안이라
`OUTING`으로 통과하고, 길이 제한이 없어 23시간 59분이 그대로 허용되며, `findOverlapping`이
`23:59`와 다음 날 `00:00`을 겹침으로 보지 않아 둘 다 살아남는다. **연속 48시간 부재이고 밤을 두 번
넘기는데 `requiresConsent`가 한 번도 참이 되지 않는다.** 설계 문서 위협표의 「외박의 APPROVED
전이는 보호자 확인이 있을 때만」이 이 구성으로 우회되고, 교사 결재 화면의 「보호자 확인되지 않음」
경고도 뜨지 않는다.

**권장:** 외출에도 최대 시간을 걸거나, 같은 학생의 살아 있는 출입증과 **맞닿는**(gap ≤ N분) 신청을
겹침으로 취급한다.

#### C-06 · 8/31에 고친 승인 메모 유실이 한 갈래 남았다

**위치:** `src/app/(app)/pass/decision-panel.tsx:74` · `src/modules/pass/decision.service.ts:46-49`, `:100`

```tsx
// 화면이 그려질 때의 상태로 칸 이름이 굳는다
reasonName={needsProxyConsent ? "consentNote" : "decisionNote"}
```
```ts
// 서비스는 제출 시점에 다시 읽는다
const consented = pass.consentedAt !== null || pass.consentByProxy;
const requestedProxy = needsConsent && input.byProxy === "on";
…
} else {  // requestedProxy가 false면 input.decisionNote만 본다
```

**실패 시나리오:** 교사가 결재 화면을 연 시점에 그 외박은 `REQUESTED`·미확인이라 칸 이름이
`consentNote`(「확인 방법」)로 굳는다. 교사가 「어머니와 통화」를 적는 사이 보호자가 앱에서 확인해
`CONSENTED`가 된다. 승인을 누르면 서비스가 다시 읽어 `consented = true` → `requestedProxy = false`
→ else 분기로 가는데 그 분기는 `input.decisionNote`만 본다. 폼은 `consentNote`로 보냈으므로
**교사가 적은 문장이 Pass 행에도 감사로그 metadata에도 남지 않고 화면은 성공만 알린다.**

2026-08-31 F-02 수정은 정상 경로에서는 맞다. 대행 폼으로 시작해 보호자 확인이 끼어드는 경로에서
같은 종류의 값 유실이 그대로 남았다.

**권장:** 대행 폼이 보낸 글을 버리지 말고 `decisionNote`로 옮겨 저장한다.

#### C-07 · 첨부가 조용히 사라진 채 글이 저장된다

**위치:** `src/modules/community/attachment.service.ts:32`, `:61` · `src/modules/community/post.service.ts:206-209`, `:261-266`

```ts
const PENDING_TTL_MS = 60 * 60 * 1000;
…
await sweepMyOrphans(actor.id);   // 미결 수를 세기 전에 먼저 돈다 — 행과 디스크 파일을 지운다
```
```ts
// 하나도 안 붙었을 때만 막는다
if (input.attachmentIds.length > 0 && attached === 0) throw new CommunityError("ATTACHMENT_NOT_FOUND");
```

**실패 시나리오:** 10:00에 사진 A를 올리고 긴 공지를 쓰다가 11:10에 사진 B를 올린다. B의 업로드가
`sweepMyOrphans`를 먼저 돌려 **A의 DB 행과 디스크 파일을 지운다.** 화면은 여전히 A·B를 들고 있고
hidden input도 둘 다 보낸다. 제출하면 `attached === 1`이라 위 조건에 안 걸리고 **글은 성공으로
저장된 뒤 A만 없다.** 오류도 안내도 없다. `updatePost`에는 이 검사조차 없다.

**권장:** `createPost`는 `attached !== input.attachmentIds.length`로 올린다. `updatePost`는 이미 붙어
있던 id를 세어 뺀 나머지에 같은 검사를 건다.

#### C-08 · 명단의 중복 계정 안전망이 면제 **후** 목록을 본다

**위치:** `src/modules/enrollment/roster.plan.ts:185-186`, `:220`

```ts
plan.missingFromFile = missing.filter((s) => !s.hasGraduatedEnrollment);   // 졸업생 면제
…
const match = plan.missingFromFile.find(                                   // 면제 후 목록을 본다
  (s) => s.name === r.name && s.birthDate === r.birthDate,
);
```

**실패 시나리오 둘, 둘 다 확정을 막지 못한다.**
1. 재입학 — 졸업 기록이 있고 올해 배정이 없는 학생의 줄에서 교사가 학생코드를 비운다.
   `missingFromFile`에서 면제되고, `:196`의 needsAttention 승격도 `s.status === null`이라 건너뛴다.
   그 줄은 `newStudents`로 남아 **초대코드가 나가고 가입 시 두 번째 `StudentProfile`이 생긴다** —
   옛 프로필의 상벌점·출입증 이력과 끊긴다.
2. 같은 학생이 파일에 두 줄(코드 있음 + 코드 비움) — 코드 있는 줄이 `matchedIds`에 들어가
   `missing`에서 빠지므로 대조 대상이 아예 없다. 빈 코드끼리의 중복 검사는 `:84` 주석대로 일부러
   건너뛴다. 같은 사람에게 초대코드가 하나 더 나간다.

`tests/modules/enrollment/roster.plan.test.ts:378-420`은 `missingFromFile`에 있는 학생만 검증한다.

**권장:** `:220`의 대조 대상을 `existing` 전체(최소한 면제 전 `missing`)로 바꾼다. 「물리 삭제 대상」과
「이 이름·생년월일이 이미 있는가」는 서로 다른 질문이다.

---

### 3.3 중간 — 권한·기록

#### C-09 · 로그인 성공·실패가 감사로그에 한 줄도 안 남는다

**위치:** `src/app/(auth)/login/submit/route.ts` 전체 · `src/core/auth/auth.ts:58-83` · `src/modules/audit-log/audit-log.labels.ts`

`src/app/(auth)/`와 `src/core/auth/` 전체에 `recordAudit` 호출이 **0건**이고, `AUDIT_ACTIONS`에
`auth:*`·`session:*` 계열 항목 자체가 없다. `databaseHooks.session.create.before`가 비활성 계정을
막을 때도 기록이 없다.

**실패 시나리오:** 교사 계정 비밀번호가 새어 밤새 로그인해도 감사로그에는 그 뒤에 한 **업무**만 남고
「누가 언제 어디서 들어왔나」는 어디에도 없다. IP·UA를 성실히 모으고(`request-context.ts`)
`authz:denied`까지 남기는 시스템에서 **세션이 생긴 순간만 비어 있다.**

**권장:** `auth:login` / `auth:login-failed`(대상 이메일은 마스킹) / `auth:logout`을 `AUDIT_ACTIONS`에
넣고 `login/submit/route.ts`가 남긴다. 아래 C-10의 무차별 대입 탐지도 이 기록이 있어야 성립한다.

#### C-10 · 로그인 속도제한이 IP 해석에 통째로 걸려 있고 계정별 잠금이 없다

**위치:** `src/core/auth/auth.ts:47-56` (그리고 `advanced.ipAddress` 설정의 부재)

```ts
rateLimit: { enabled: true, window: 60, max: 100,
  customRules: { "/sign-in/email": { window: 60, max: 10 } } },
```

better-auth 1.6.26의 키 계산을 원본에서 확인했다 —
`@better-auth/core/src/utils/ip.ts:330`이 `trustedProxies` 없이 홉이 2개 이상인 XFF를 통째로
포기하고(`if (forwardedIps.length !== 1) return null`),
`better-auth/dist/api/rate-limiter/index.mjs:275`가 그 null을 `NO_TRUSTED_IP_KEY = "no-trusted-ip"`
고정 문자열로 대체한다. `auth.ts`에는 `trustedProxies`도 `ipAddressHeaders`도 없다.

**실패 시나리오 둘:**
1. **가용성** — 프록시 앞에 한 겹이 더 붙는 날(CDN·사내 L7·`$proxy_add_x_forwarded_for`로 되돌림)
   XFF가 2홉이 되고, 그 순간 모든 접속자가 **버킷 하나**를 공유한다. 아무나 1분에 실패 로그인 10번을
   보내면 **전교가 로그인을 못 한다.** 신호는 프로세스당 한 번 찍히는 `logger.warn`뿐이다.
   지금 배치(`docs/deploy.md:196` `X-Forwarded-For $remote_addr`)는 단일 값이라 정상 동작한다 —
   그래서 더 조용히 무너진다.
2. **무차별 대입** — 정상 동작할 때조차 버킷은 출발 IP별이고 **계정별 잠금이 없다.**
   프록시를 갈아 가며 한 교사 계정에 사전 공격을 거는 것을 막는 장치가 없고, C-09 때문에
   시도 흔적도 남지 않는다.

#### C-11 · 로그인 이전 서버액션에 속도제한도 기록도 없다

**위치:** `src/app/(auth)/register/actions.ts:93-108` · `src/modules/registration/registration.service.ts:41-49`

better-auth의 `rateLimit`은 `/api/auth/*` 핸들러에만 걸린다 — 서버 액션은 그 파이프라인 밖이다.
`checkInvite`는 `failedAttempts`를 올리지 않고(1단계 설계상 맞다) 감사로그도 없고 호출 횟수 제한도
없다. `requestVerificationAction`·`confirmVerificationAction`·`completeRegistrationAction`도 같다 —
뒤 둘은 **자원별** 한도(대상 5회/시간, 코드 5회)만 있고 **호출자별** 한도가 없다.

**실패 시나리오:** 코드 공간 31⁸ ≈ 8.5×10¹¹에 살아 있는 코드가 수백 장이라 즉시 뚫리지는 않는다.
문제는 **막지도 기록하지도 않는다**는 점이다 — 초당 수백 번 두드리는 스크립트를 앱이 인지하지
못하고, 사후에 「가입 화면이 공격받았나」를 물을 자료가 없다. 매 호출이 인덱스 조회 한 번이라
DB 부하 증폭 경로이기도 하다.

#### C-12 · 전교생 개인정보 내보내기에 감사로그가 없다

**위치:** `src/modules/enrollment/roster.service.ts:102-113`

```ts
/** 전체 명단 내보내기. 읽기만 하므로 감사로그를 남기지 않는다. */
export async function exportRoster(actor: SessionUser) {
```

`buildExportRows`가 `studentCode · name · birthDate · 학년 · 반 · 번호 · 학적`을 전 학생분 그대로
싣는다. 쓰기가 아니므로 규칙 위반은 아니지만, **대량 개인정보 반출에 흔적이 없다** — 교사 계정
하나가 탈취돼도 「누가 언제 명단을 통째로 받았나」에 답할 자료가 없고 호출 횟수 제한도 없다.

**권장:** `roster:export`(대상 건수·학년도만) 감사로그를 남긴다.

#### C-13 · 자녀 연결이 끊기는 학부모가 미리보기에 안 나오고 기록도 없다

**위치:** `prisma/schema.prisma:202`(ParentStudent onDelete: Cascade) · `src/modules/enrollment/roster.service.ts:312-320` · `src/app/(app)/admin/students/import/import-form.tsx:297-336`

`RosterPlan`에 학부모 관련 필드가 없고 미리보기 카드도 삭제 대상 학생만 나열한다. 화면 문구는
「학부모 연결 … 함께 사라지고」라고만 하고 대상을 열거하지 않는다.

**실패 시나리오:** 자녀가 한 명뿐인 학부모의 자녀가 명단에서 빠지면 `ParentStudent` 행이 cascade로
사라진다. 학부모 계정은 `ACTIVE`로 남아 로그인은 되지만 화면에 아무것도 없다. 교사는 확정 전에
그 학부모가 누구인지 알 수 없고, 확정 뒤에도 `ParentStudent` 삭제가 감사로그에 안 남아 왜 끊겼는지
되짚을 수 없다.

설계 문서(`2026-08-13-academic-year-and-roster-design.md:298-299`)가 이것을 명시적으로 요구한다 —
「미리보기에서 "자녀가 없어지는 학부모"로 따로 보여준다」.

#### C-14 · 명단 반영이 만든 초대코드에 건별 감사로그가 없다

**위치:** `src/modules/enrollment/roster.service.ts:284-351` · `src/modules/enrollment/roster.repo.ts:182-190`

같은 트랜잭션에서 **폐기**된 코드는 건별로 남고(`invite:revoke:roster`) **삭제**된 학생도 건별로
남는데, `applyRoster`가 `tx.invite.create`로 만드는 초대는 `targetId`가 붙은 줄이 하나도 없다.
단건 발급 경로는 `invite:create` + `targetId`를 남긴다. 부수로, `roster.repo.ts:182-190`의
`invite.deleteMany`는 `status` 조건이 없어 `USED` 초대도 함께 지우지만 `revokedInvites`는
`PENDING`만 모은다 — **소진된 초대 행이 기록 없이 사라진다.**

---

### 3.4 중간 — 인프라

#### C-15 · `npm run start:standalone`이 0.0.0.0에 묶인다

**위치:** `scripts/start-standalone.mjs`(9줄 전부) · `package.json:9`

Next 16.3 standalone 진입점 템플릿은 `node_modules/next/dist/build/utils.js:1125`에서
`const hostname = process.env.HOSTNAME || '0.0.0.0'`이다(직접 확인). Docker 경로는 `Dockerfile:60`이
명시적으로 주고 compose가 `127.0.0.1:3000:3000`으로만 게시해 안전하며, Playwright도
`HOSTNAME: "127.0.0.1"`을 준다. **호스트에서 이 스크립트를 직접 부르는 갈래에만 기본값이 없다.**

**실패 시나리오:** 교내망에 붙은 서버에서 운영 빌드를 확인하려고 이 명령을 돌리면 리버스 프록시 없이
평문 HTTP로 전 인터페이스에 열린다. CLAUDE.md가 적어 둔 그대로 — 세션 쿠키가 평문으로 흐르고
`x-forwarded-for`를 누구나 위조해 감사로그에 임의 IP를 심을 수 있다. `docs/deploy.md` §5의 확인
절차는 compose 경로만 검사해 이것을 잡지 못한다.

**권장:** 스크립트 첫 줄에 `process.env.HOSTNAME ??= "127.0.0.1"`.

#### C-16 · 통합 테스트의 개발 DB 가드가 문자열 완전일치뿐

**위치:** `scripts/setup-test-db.sh:21-24` · `vitest.config.mts`(검사 부재)

```bash
if [ "$TEST_DATABASE_URL" = "${DATABASE_URL:-}" ]; then
```

같은 저장소의 Playwright 경로는 이미 **정규화 비교**를 한다(`playwright.env.ts`가
`localhost`/`127.0.0.1`/`::1`을 접고 포트·DB 이름만 비교하며 전용 테스트까지 있다).
vitest의 integration 프로젝트에는 그 검사가 **아예 없다.**

**실패 시나리오:** `DATABASE_URL=…@localhost:5433/gbsw` / `TEST_DATABASE_URL=…@127.0.0.1:5433/gbsw`
(또는 한쪽에만 `?schema=public`)이면 두 문자열이 달라 가드를 통과하고 같은 DB에 통합 테스트가 돈다.
그 스위트는 파괴적이다 — `academic-year.single-current.integration.test.ts`는 `isCurrent`를 끄고
`afterAll`에서 2026을 다시 현재로 되돌린다. 학교가 2027로 넘어간 DB라면 **전교 집계 범위가 통째로
어긋난 채 아무 오류 없이 남는다.** 2026-08-28 감사에 검사가 개발 DB를 건드린 사고가 기록돼 있다.

**권장:** `playwright.env.ts`의 정규화 판정을 공유 모듈로 올려 셸 스크립트와 vitest가 같이 쓴다.

#### C-17 · `overrides`가 정확 고정된 전이 의존성을 메이저 하나 올려 덮는데 근거가 없다

**위치:** `package.json:66-68`

```json
"overrides": { "deepmerge-ts": "^8.0.2" }
```

`@prisma/config`는 `deepmerge-ts: 7.1.5`로 **정확 고정**인데 설치 실물은 8.0.2다. 저장소 어디에도
이유가 없다 — 다른 모든 고정·다이제스트에는 근거 주석이 달려 있는 것과 대비된다.
`@prisma/config`는 `prisma.config.ts`를 읽는 주체이고 그것이 compose의 `migrate` 서비스가 도는
유일한 경로다. 그 컨테이너가 죽으면 `app`은 `service_completed_successfully` 조건이라 **함께 안 뜬다.**

---

### 3.5 중간 — 화면 규격

#### C-18 · 링크 규격을 24개 파일이 손으로 베꼈고 이미 갈라졌다

**위치:** 대표 — `app/(app)/pass/history/page.tsx:210` · `app/(app)/admin/users/user-table.tsx:65` · `app/(app)/community/[slug]/post-list.tsx:20` (전체 24파일)

직접 세었다 — `decoration-line-strong`을 쓰는 파일 24개, `underline-offset-2` 29곳 대
`underline-offset-4` 1곳, 터치 타깃(`min-h-9 … lg:min-h-0`) 유무가 같은 성격의 자리에서 제각각.
`buttonClass()`·`cardClass()`·`segmentClass()`가 있는 저장소에서 **링크만 소유자가 없다.**
`ChipLink`의 주석이 경고한 「규격을 베껴 적어 두었는데 둘이 조용히 갈라졌다」가 이미 일어났다.

**권장:** `components/ui/link.tsx`에 `linkClass({ size?, touch? })`를 두고 24곳을 옮긴다.

#### C-19 · 제목과 필터를 카드에 담은 화면 둘

**위치:** `app/(app)/merit/recent/page.tsx:77-121` · `app/(app)/pass/history/page.tsx:89-140`

`2026-08-30-ui-refresh.md` §1이 두 가지를 함께 금지한다 — 「제목을 카드에 담지 않는다」와
「필터는 상자에 담지 않는다… 조건 넷을 담은 칸이 화면에서 가장 큰 상자가 된다」. 이 두 화면은
제목·트랙 탭·칩 두 줄·검색칸·내보내기를 한 카드에 넣어 둘을 동시에 어긴다. 같은 기능의 형제
화면(`merit/admin-view.tsx:95`, `merit/stats/stats-shell.tsx:72`)은 `PageHeader`를 쓴다.

#### C-20 · 합계 다섯 칸을 낱개 `boxed` 타일로 세웠다

**위치:** `app/(app)/merit/stats/views/teachers.tsx:76-82` · `app/(app)/merit/stats/views/rules.tsx:58-66`

ui-refresh §3이 이름 붙인 결함 그대로다 — 「칸마다 테두리를 그리면 다섯 칸에 세로선이 열 줄
그어져, 한 값을 나눈 조각이 아니라 서로 다른 상자 다섯으로 읽힌다.」 같은 탭 묶음의 형제
`overview.tsx:84`는 `StatStrip` + `variant="plain"`으로 옳게 그리므로, **탭을 옮기면 띠 하나가
상자 다섯으로 흩어진다.**

#### C-21 · 끌 수 없는 것을 칩으로 그린 곳 둘

**위치:** `app/(app)/students/[studentId]/page.tsx:128-138` · `app/(app)/admin/invites/invite-form.tsx:30-52`

학생 상세의 갈래(상벌점·출입증·정보)는 늘 하나가 켜져 있고 끌 수 없다(`student-tab.ts:33`이 모르는
값을 `"merit"`으로 떨어뜨린다) → ui-refresh §2 기준 `Segmented`다. `student-tab.ts:9`가 스스로
「통계 네 갈래의 `?view=`와 같은 규칙」이라 적어 두었는데 그 통계와 계정 관리는 `Segmented`다.
게다가 이 화면은 갈래 칩(검은 알약) 바로 아래에 상태 필터 칩(흰 알약)이 서서 문서가 경고한 배치가
그대로 재현된다. 초대 폼의 대상 고르기도 같은 문제이며, 바로 위에 `AdminTabs`(`Segmented`)가 선다.

#### C-22 · `PageHeader`를 손으로 다시 그렸다 / 오류 경계 셋이 세 모양

**위치:** `app/(app)/merit/own-view.tsx:55-75` · `app/(app)/merit/error.tsx:24-49` · `app/(app)/pass/error.tsx:24-49` · `app/(app)/error.tsx:17-42`

`/merit`의 교사 화면(`admin-view.tsx:95`)은 `PageHeader`를 쓰는데 학생·학부모 화면은 같은 구조를
손으로 그린다 — **같은 주소가 역할에 따라 머리글 여백이 다르게 선다.**
오류 경계는 `merit`/`pass`가 명사 하나 빼고 완전 복사본이고, 부모 `(app)/error.tsx`는 카드도 아니고
정렬·색·순서가 전부 다르다. 한 이벤트에 대해 어느 하위 트리에서 터졌느냐로 화면이 셋으로 갈리고
문구도 「다시 시도해도 같으면」↔「계속 같은 화면이 나오면」으로 갈린다.

---

### 3.6 중간 — 테스트

#### C-23 · 「교사만 본다」는 이름의 테스트가 학생 거부를 단언하지 않는다

**위치:** `tests/modules/pass/decision.service.test.ts:513-517`

```ts
it("지금 유효한 목록도 교사만 본다", async () => {
  await service.listActivePasses(admin, NOW);
  expect(listActiveNow).toHaveBeenCalledWith(NOW, 2026);
});
```

바로 위 형제(`:507-511`)는 `rejects.toThrow(ForbiddenError)`를 제대로 한다. 이 테스트에는 그 줄이 없다.
`decision.service.ts:328`의 `assertCan(actor, "pass:read:any")`를 지워도 초록이다.
`listActivePasses`는 「지금 나가 있는 학생 전원」의 이름·학번·행선지를 돌려준다.
**이름이 커버리지가 있다고 거짓 기록을 남기고 있어 다음 사람이 여기를 다시 안 본다.**

#### C-24 · `getPassDetail`의 소유권 분기가 어느 테스트에서도 실행되지 않는다

**위치:** `src/modules/pass/request.service.ts:265-281`

이 함수를 부르는 테스트는 `tests/integration/pass.flow.integration.test.ts`의 세 곳뿐이고
**셋 다 교사 액터**라 전부 `can(actor, "pass:read:any")`에서 반환된다. 소유권 분기 5~9행을 통째로
지우고 `return pass;`만 남겨도 전 스위트가 초록이다. 그러면 `/pass/[passId]`가 로그인한 아무에게나
열리고(그 페이지의 유일한 인가가 이 서비스다) `findPassForVerify`는 `select` 없이 행 전체를 주므로
**사유·행선지·결재 메모까지** 나간다.

#### C-25 · 대시보드의 게시판 횡단 목록에 테스트가 0건

**위치:** `src/modules/community/post.service.ts:159-190` · 호출부 `app/(app)/page.tsx:151, 356`

`grep -rn "listRecentPosts" tests/` → 0건. 목 팩토리에 `listRecentPostsAcross` 키 자체가 없다.
`byId.get(row.communityId)!`를 `communities[0]!`로 바꿔도 초록이다 — 익명 게시판 글에 실명 게시판의
`anonymous:false`가 적용되어 **대시보드에서만 익명 글의 작성자 이름이 노출된다.**
`community.view.ts` 자체는 잘 테스트돼 있지만 **그것을 올바른 `community` 인자와 함께 부르는지**를
보는 테스트가 이 경로에 없다.

#### C-26 · 첨부 라우트 두 개에 단위 테스트가 0건

**위치:** `src/app/api/community/attachments/route.ts` · `.../[...attachment]/route.ts`

e2e는 교사 계정의 성공 경로 한 줄만 탄다. 미커버 분기: `readCappedBody`의 413 상한(컨테이너가
400MB 본문에 죽는 것을 막는 유일한 장치라고 파일 주석이 스스로 밝힌다), `gate()`의
`!actor.mustChangePassword`, 다운로드의 `ForbiddenError → 404` 마스킹(주석이 명시한 「첨부 id를 훑어
존재하는 id를 알아내는」 오라클 방어), 응답 헤더 넷 중 둘.

#### C-27 · 서버액션 커버리지 구멍 16개

`app/(app)/community/[slug]/actions.ts` 5개 전부 · `app/(app)/admin/community/actions.ts` 3개 전부 ·
`app/scan/actions.ts` 1개 · `app/(app)/pass/actions.ts` 8개 중 7개(`requestAction`만 있다) —
합계 44개 export 중 16개가 미커버. `decision-panel.test.tsx`는 `approveAction`/`rejectAction`을
`vi.fn()`으로 **가려버리므로** 커버가 아니고, `community/guard.test.ts`·`admin/community/role-permissions.test.ts`는
순수 헬퍼만 보고 해당 `actions.ts`를 임포트하지 않는다.

#### C-28 · 목 반환 모양이 실제 repo와 어긋나 있고 타입 검사가 그것을 못 본다

저장소의 repo 목은 **전부** 문자열 경로 팩토리(`vi.mock("경로", () => ({...}))`)다. vitest의 그
오버로드는 제네릭이 없어 팩토리 반환 타입이 `{}`이고 **키 목록도 반환 타입도 검사되지 않는다.**

증거 둘 — `pass.repo.listForStudent`는 `{ entries, total }`을 반환하는데
`request.service.test.ts:103`은 맞게, `decision.service.test.ts:83`은 **`[]`로 틀리게** 목했다.
그리고 `award.service.test.ts:122`의 `findAwardableStudent` 목이 실제 `select`에 없는
`studentCode`·`user.id`를 준다 — 감사 metadata에 `student.studentCode`를 넣는 한 줄을 추가하면
**테스트는 값이 있고 운영은 `undefined`**가 된다.

**권장:** 팩토리를 `vi.mock(import("경로"), …)` 제네릭 오버로드나 `satisfies Partial<typeof import(…)>`로
바꾸면 둘 다 컴파일 에러가 된다.

---

### 3.7 낮음

| # | 요약 | 위치 |
|---|---|---|
| L-01 | 학생증 발급이 pass 모듈에서 유일하게 `can()`을 안 부른다 (게이트가 프로필 존재 하나) | `request.service.ts:293-299` |
| L-02 | 사유 입력칸 상한(500)이 서버 스키마(100·200)보다 커서 제출 후에야 막힌다 | `confirm-dialog.tsx:148` |
| L-03 | 비밀번호 변경 대상자가 `/scan`에 오면 판정할 코드를 잃는다 (미로그인 갈래는 보존한다) | `scan/page.tsx:31-38` |
| L-04 | `BETTER_AUTH_URL`이 없거나 모양이 틀리면 판정 화면 전체가 500 | `pass.url.ts:14-20` |
| L-05 | 주석이 코드와 반대로 적힌 곳 셋(없는 인자 설명·「저장 안 한다」인데 저장함) | `pass.repo.ts:280` 외 |
| L-06 | 거부 감사로그의 `targetId`가 출입증 id가 아니라 사용자 id | `request.service.ts:299` |
| L-07 | 삭제된 규정도 수정 가능하고 그 이름이 과거 기록의 표시 이름이 된다 | `merit.repo.ts:109` |
| L-08 | `listClassRoster` 정렬에 유일한 마지막 키가 없다 (반 미배정끼리 순서 미보장) | `merit.repo.ts:533-537` |
| L-09 | 최근 부여 내보내기에 행 수 상한도 학년도 조건도 없다 | `merit.repo.ts:844-855` |
| L-10 | 미결 첨부 소유권 거부에 `authz:denied`가 안 남는다 (형제 셋은 남긴다) | `attachment.service.ts:166-171` |
| L-11 | 첨부 정리·롤백 삭제가 감사로그 없이 일어난다 | `attachment.service.ts:116, 143` |
| L-12 | 파일 이름 길이 상한이 어디에도 없다 (DB·`Content-Disposition`에 그대로) | `route.ts:139`, `community.storage.ts:81` |
| L-13 | `updateCommunity`가 제거된 게시판인지 안 본다 (`deleteCommunity`엔 있다) | `board.service.ts:99-107` |
| L-14 | 로그인·가입 페이지의 세션 게이트가 `requireAuth`와 어긋난다 (`deletedAt`) → C-01의 날 루프 | `login/page.tsx:24` |
| L-15 | 남의 글 수정 화면 접근이 감사로그에 안 남는다 | `[postId]/edit/page.tsx:28-30` |
| L-16 | 제출 **성공** 중 한 글자를 더 치면 올라간 글의 초안이 되살아난다 | `post-form.tsx:82-98, 172-179` |
| L-17 | 목록 조회와 개수 조회가 같은 스냅샷이 아니다 | `post.service.ts:118-121` |
| L-18 | 커밋 뒤 디스크 삭제 실패가 「저장 실패」로 보이는데 DB는 이미 바뀌었다 | `post.service.ts:311-316` |
| L-19 | 미리보기 봉인 토큰에 만료·행위자·1회용 표시가 없다 → 신규 줄만 있는 파일은 재제출로 초대코드 재발급 | `roster.preview-token.ts:23-28` |
| L-20 | `ENROLLMENT_CONFLICT`·`CODE_GENERATION_FAILED`가 `MESSAGES` 사전에 없다 (지금은 `detail` 폴백이 가린다) | `admin/students/actions.ts:19-27` |
| L-21 | 성공 문구의 「N건 반영」이 실제 변경 건수가 아니다 (안 바뀐 줄까지 센다) | `roster.service.ts:378` |
| L-22 | `changeOwnPassword`의 현재 비밀번호 대조가 무제한이고 실패가 기록되지 않는다 | `account.service.ts:40-50` |
| L-23 | 전역 `Referrer-Policy: no-referrer`가 로그인 CSRF의 referer 폴백을 죽은 코드로 만든다 (fail-closed) | `next.config.ts:49` |
| L-24 | 초대코드 기본값이 무기한이고 학부모 코드 폼에는 유효기간 칸이 아예 없다 | `parent-invite/actions.ts:32-34` |
| L-25 | `PASS_NOT_ACTIVE`가 아무도 던지지 않는 死 `MESSAGES` 키 — 두 목록이 이미 갈라졌다 | `pass/actions.ts:46` |

화면 규격의 낮음(손으로 적은 카드 껍데기 셋, 네 번째 여백 `p-4`·`py-3.5`, `FilterRow`를 두고 손으로
그린 칩 줄 다섯, `text-xl` 하나, 문구 규칙 위반 셋, `EmptyState` 대신 맨 `<p>`, `<th scope>` 부재,
필터 상수 중복)과 테스트의 낮음(커버리지 ratchet 부재, `ROLE_LABELS` 부분 단언, 인자 없는
`rejects.toThrow()` 셋, ICU 렌더 문자열 고정)은 §3.5·§3.6의 항목에 묶어 두었고 개별 위치는
에이전트 보고 원문에 남아 있다.

**테스트의 시각·순서 취약점**(실제로 언젠가 빨개질 것): `pass.flow.integration.test.ts:344`가
Node 시계로 만료 시각을 잡고 판정은 DB 시계가 한다(스위트 유일의 실제 벽시계 경합) ·
`isCurrent`를 전 행에서 밀고 `afterAll`에서만 되돌리는 파일 다섯과 시드 상태를 전제하는 파일 둘이
`fileParallelism: false` 하나로만 공존한다 · `process.env` 미복원 7파일(`isolate:false`로 바꾸면 샌다) ·
`cache()`를 쓰는 서비스 둘이 `--conditions=react-server`로 돌리면 첫 `it` 값에 메모이즈된다.

---

## 4. 재검증에서 떨어뜨린 것

- **판독 화면의 `EXPIRED`/`NOT_APPROVED` 우선순위** — 「끝난 승인 건이 대기 중 신청보다 먼저
  판정된다」는 보고를 받았으나, `verify.service.ts:113-124`의 주석이 그 순서를 네 단계로 **의도로
  명시**하고 있었다. 다만 그 주석이 「지금 시각을 품은 대기 건이 함께 있는 경우」를 고려하지 않은
  것은 사실이라 낮은 개선 항목으로 남긴다(정문 교사가 학생에게 할 말이 갈린다).
- **부여 한 건마다 `AcademicYear` 전 행에 `FOR UPDATE`** — 잠금 범위가 넓은 것은 맞지만 학년도
  전환과의 직렬화라는 근거가 있고 경합 안내 문구까지 준비돼 있다. 조치 불필요.
- **초기 파괴적 마이그레이션 둘** — 운영 DB는 이미 지난 지점이라 영향이 없다. 아주 오래된 덤프를
  복구할 때만 걸리므로 `docs/deploy.md` §6에 한 줄 덧붙이면 충분하다.

**정상으로 확인한 것**(다음 감사가 다시 파지 않도록 적는다):
`AcademicYear_single_current` 부분 유니크 인덱스는 마이그레이션 20개 어디에서도 드롭되지 않았고
`schema.prisma`에 선언이 없는 수동 SQL 객체는 이것 하나뿐이다 ·
커뮤니티 익명 마스킹은 `authorName`/`authorUserId`/`authorRole`이 모듈 밖으로 한 번도 안 나간다 ·
마크다운은 `rehype-raw`가 없고 프로토콜이 `http`/`https`/`mailto`로 좁혀져 있다 ·
첨부 CSP가 전역 규칙 뒤에 와서 실제로 이긴다 · `can()` 표에 고아 액션도 누락 액션도 없고
`EXPECTED`는 `RULES`의 재기술이 아니다 · 서버액션 14개 모듈 전부가 첫 줄에서 `requireAuth()`를
부른다 · `mustChangePassword` 우회 경로 없음 · `safeNext`가 open redirect 전 형태를 막는다 ·
가입 원자성(코드가 소진된 채 남지 않는다) · 임시 비밀번호 ≈81비트이고 DB·감사로그에 남지 않는다 ·
Better Auth admin mutation이 라우트 화이트리스트로 전부 404 · 엑셀 내보내기에 수식 인젝션 없음
(`write-excel-file`이 `<f>`를 만들지 않는 것을 라이브러리 원본에서 확인) ·
`text-pri`(글자용) 0곳, 카드에 `shadow-*` 0곳, 호칭 규율 완전 ·
컨테이너 비루트 + `cap_drop: ALL`, 볼륨 경로 정상, 빌드 파이프가 종료 코드를 안 가림.

---

## 5. 사람이 해야 할 일

- **로컬 `stash@{0}`에 `dev-local/test-accounts.md`(평문 테스트 비밀번호)가 들어 있다.**
  어떤 브랜치·원격 ref에서도 닿지 않아 **원격에는 올라가지 않았음을 확인했다.** 저장소 디렉터리
  통째 복사나 `push --mirror`로는 나간다. 지우는 것은 되돌릴 수 없어 손대지 않았다.
- **`.env.example:43`의 `SMS_TEST_MODE="true"`가 배포 문서·compose의 지시와 정면으로 어긋난다.**
  배포 절차가 `cp .env.example .env`이므로 기본으로 `"true"`가 들어온다 — 실제 발송을 켜는 날
  `docs/deploy.md:87`이 「가장 알아채기 힘든 실패」라 부른 그 상태가 된다.
- **`mem_limit` 기준이 둘이다** — compose는 `1g`, 문서·주석 셋은 `512m`. 첨부 상한을 올릴 때 함께
  움직여야 할 값이라 기준이 갈리면 계산이 두 배 어긋난다.
- **`docs/deploy.md` §0의 최소 사양 2GB가 §5의 빌드 요구 8GB와 모순된다.** 표를
  「빌드 8GB / 운영 2GB」로 나눠 적는다.
- **로그인 껍데기(`(auth)/auth-panel.tsx`)가 규격 밖인 것이 의도인지 확인한다.** 커밋 `92056e8`이
  일부러 되돌린 시안이고 `src` 전체에서 `font-extrabold`·임의 글자크기가 남은 유일한 파일인데,
  규격 문서는 「한 곳도 남지 않아야 한다」고 단정한다 — 다음 감사자가 위반으로 읽고 고치려 든다.
  예외를 문서에 한 줄로 적거나 화면을 토큰으로 되돌린다.
- **`/scan` 화면의 이름이 셋이다** — `EXTRA_TITLES`의 「QR 스캔」(실제로는 앱 셸 밖이라 **읽히지
  않는다**), `<h1>`의 「학생증 확인」, 버튼의 「스캔」. 하나로 정하고 죽은 항목과 그 주석을 고친다.
