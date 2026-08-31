# 코드베이스 심층 감사 — 2026-08-31

> **이 문서는 검사 시점의 스냅샷이다.** 코드를 읽고 찾은 것이며, 제품 코드는 고치지 않았다.
> 같은 날 먼저 수행한 [`2026-08-31-codebase-audit.md`](2026-08-31-codebase-audit.md)의
> 뒤를 잇는 **두 번째 코드 읽기 감사**다. 앞 감사가 영역을 갈라 한 번 훑은 것이라면 이
> 문서는 같은 코드를 영역과 관심사 두 축으로 겹쳐 읽고 적대적으로 반증한 기록이다.
> 앞 감사의 확정 53건은 **아직 미처리 상태이며 이 문서가 그것을 대체하지 않는다** —
> 지난 항목과의 대조는 §4에 따로 적었다.

기준선: `main @ 7376579`

## 1. 범위와 방법

네 단계로 진행했다.

| 단계 | 방식 | 결과 |
|---|---|---:|
| 1차 | 여덟 담당이 **모듈별로** 코드를 읽는다 (커뮤니티·출입증·상벌점·명단·인증권한·화면·인프라·테스트) | 71건 |
| 2차 | 여덟 담당이 **관심사별로** 코드베이스 전체를 다시 훑는다 (권한·트랜잭션·오류·감사로그·개인정보·입력·스키마·죽은 코드) | 48건 |
| 접기 | 같은 `file:line`을 하나로 합친다 | 115건 |
| 3차 | 여덟 검증자가 각 항목을 **반증할 목적으로** 코드를 다시 연다 | 확정·격하 113 / 기각 2 |

**검증은 반증을 목표로 했다.** 각 검증자는 「이 항목이 틀렸음을 보여라」를 지시로 받았고,
주장이 인용한 파일을 직접 열어 인용문이 실재하는지, 도달 경로가 있는지, 승인된 예외
(bootstrap의 `can()` 없음, verification의 감사로그 없음, 커뮤니티 게시판 판정이 `can()`
밖, 실제 발송 안 함)에 해당하는지를 확인했다. 반증에 실패하면 확정, 사실은 맞되 서술이
과장됐으면 **격하**(원 서술을 검증자의 수정문으로 갈아 끼운다), 도달 불가능하면 기각이다.
**기각은 2건뿐이다** — 그 둘은 §5에 이유와 함께 남겼다. 심각도는 검증 후 값을 따르므로,
지난 감사와 등급이 다른 항목은 이 문서의 등급이 최신이다.

**미판정으로 남은 항목은 없다.** 확정 113건 중 같은 결함을 두 위치에서 보고한 중복 한
쌍(`audit-log.labels.ts`의 `TARGET_LABELS`와 `core/authz/errors.ts`의 `targetType: "Authz"`)만
한 항목으로 접었다 — 그래서 본문 항목은 112다.

**낮음 94건은 표로 접었다.** 뿌리가 같은 것끼리 묶고 묶음마다 대표 인용 하나를 앞에
두었다. 개별 인용과 실패 시나리오는 압축했으며, 그 대신 위치를 줄 번호까지 적어 파일을
바로 열 수 있게 했다. 낮음 중 하나(DL-07)만 지난 감사의 가장 무거운 항목과 얽혀 있어
표 대신 문장으로 적었다.

테스트 스위트는 돌리지 않았다. 인용된 명령(`docker compose config`, `npx tsc --listFilesOnly`,
정규식 재현) 몇 개는 검증 중 실제로 실행했고, 그 사실을 해당 항목에 적었다.

## 2. 결과 요약

| 구분 | 수 |
|---|---:|
| 높음 | 1 |
| 중간 | 17 |
| 낮음 | 94 |
| **본문 합계** | **112** |
| 접은 중복 | 1 |
| 기각 | 2 |

가장 무거운 사실을 먼저 적는다. **`docs/deploy.md`대로 설치한 도커 배포에서 명단 반영이
통째로 죽는다.** 앱은 뜨고 로그인도 상벌점도 정상인데, 교사가 명단 엑셀을 올리는 순간
서명 키 함수가 예외를 던지고 그 예외를 서버 액션이 로그도 없이 삼킨다. 학생을 시스템에
넣는 주 경로가 결정적으로 막히면서 화면에는 「파일을 읽지 못했습니다」만 남는다. 두 결함이
겹쳐야 이 모양이 되는데, 둘 다 이 문서에 있다 (D-01 · D-08).

---

## 3. 확정 결함

### 3.1 높음

#### D-01 · 도커 배포에서 명단 미리보기·확정이 항상 예외로 죽는다

**위치:** `docker-compose.yml:93` · `src/modules/enrollment/roster.preview-token.ts:30-36`

```yaml
# docker-compose.yml:90-93
      # 명단 미리보기 토큰(HMAC) 서명 키. 전달 경로가 없으면 코드가 늘
      # BETTER_AUTH_SECRET으로 떨어져 분리 의도가 조용히 무효가 된다.
      # 비워 두면 그 fallback을 그대로 쓴다.
      ROSTER_IMPORT_PREVIEW_SECRET: ${ROSTER_IMPORT_PREVIEW_SECRET:-}
```
```ts
// roster.preview-token.ts:30-36
const secret =
  process.env.ROSTER_IMPORT_PREVIEW_SECRET ?? process.env.BETTER_AUTH_SECRET;
if (secret?.trim()) return secret;
if (process.env.NODE_ENV === "test") return "test-only-roster-import-preview-secret";
throw new Error("ROSTER_IMPORT_PREVIEW_SECRET 또는 BETTER_AUTH_SECRET 환경변수가 없습니다.");
```

compose의 `${VAR:-}`는 변수를 **비우는 것이 아니라 빈 문자열로 설정한다.**
`docker compose config`를 직접 돌려 확인했다 — app 서비스의 렌더 결과가 `null`이 아니라
빈 문자열이다(`.env`에 그 줄이 아예 없어도 같다). 그러면 컨테이너 안에서
`process.env.ROSTER_IMPORT_PREVIEW_SECRET === ""`이고, `??`는 빈 문자열에서 fallback하지
않으므로 `secret = ""` → `"".trim()`이 falsy → `NODE_ENV`는 production → **throw**.
compose 주석이 약속한 「비워 두면 fallback을 쓴다」가 일어나지 않는다.

**실패 시나리오:** `docs/deploy.md` §1대로 `cp .env.example .env`(그 파일 34행이
`ROSTER_IMPORT_PREVIEW_SECRET=""`) 후 `docker compose up -d --build`로 띄운다. 앱·로그인·
상벌점은 정상인데 교사가 명단 엑셀을 올리는 순간 `roster.service.ts:92`의
`issuePreviewToken()`이 이 예외로 죽는다. 확정 반영도 같은 함수를 거치므로
(`roster.service.ts:145` `verifyPreviewToken` → `digest` → `previewTokenSecret`) 우회로가
없다. **학생을 시스템에 넣는 주 경로가 문서대로 설치한 서버에서 결정적으로 막힌다.**

화면에 원인이 안 나오는 것은 D-08 때문이다 — `admin/students/import/actions.ts:102`가 이
예외를 로그도 재던짐도 없이 삼켜 「파일을 읽지 못했습니다」로 바꾼다. 교사는 엑셀을 계속
고치고 서버 로그에는 아무것도 남지 않는다.

`npm run verify`가 이것을 못 잡는 이유도 같은 함수 안에 있다 — `NODE_ENV === "test"` 전용
fallback이 있어 초록으로 지나간다.

**권장:** 둘 중 하나(또는 둘 다). ① `roster.preview-token.ts:31-32`에서 `??`를 `||`로
바꾸거나 `process.env.ROSTER_IMPORT_PREVIEW_SECRET?.trim() || process.env.BETTER_AUTH_SECRET`로
빈 값을 명시적으로 걸러낸다. ② `docker-compose.yml:93`을 리스트 형식 pass-through
(`- ROSTER_IMPORT_PREVIEW_SECRET`)로 바꿔 값이 없으면 변수 자체가 컨테이너에 안 들어가게
한다. `.env.example:34`의 빈 문자열 줄도 함께 주석 처리한다.

---

### 3.2 중간 — 학적을 보지 않는 조회

두 항목의 뿌리가 같다. **집계·명단 질의가 「지금 이 학교에 있는 사람」을 서로 다른 술어로
정의하고, 어느 술어도 화면 문구와 맞지 않는다.**

#### D-02 · 통계 개요의 머리글 합계와 「반별 현황」이 다른 모집단을 센다

**위치:** `src/modules/merit/stats.service.ts:302` · `src/modules/merit/merit.repo.ts:1078-1096`(trackTotals) ↔ `:863-891`(classSummaries)

```ts
const [totalRows, classes, topRules, chartAwards, watchList] = await Promise.all([
  repo.trackTotals({ track, totalsYear: scoped, studentProfileIds }),
  repo.classSummaries({ year: rosterYear, track, totalsYear: scoped }),
```

반을 고르지 않은 전교 개요에서는 `studentProfileIds`가 undefined라 `trackTotals`의 where가
`{ track, status: "ACTIVE", year }`뿐 — 학생 조건이 하나도 없다. 같은 화면의 「반별 현황」을
만드는 `classSummaries`는 `status: "ENROLLED"` · `user.deletedAt: null` · `classId: { not: null }`로
명단을 좁힌다.

**실패 시나리오:** (a) 학년 중간에 자퇴·전출·퇴학 처리되어 그 학년도 `Enrollment`가
`ENROLLED`가 아니게 된 학생, (b) 반 미배정(`classId` null) 학생의 점수가 머리글의 상점·벌점·
부여 건수에는 들어가고 반별 현황의 어느 줄에도 없다. 교사가 반별 합계를 더해 머리글과 맞춰
보면 차이가 나는데 화면에는 그 이유가 없다. 기숙사 트랙은 `totalsYear`가 null이라 머리글이
졸업생 포함 전체 누적을 세는 반면 반별 현황은 현재 명단만 덮어, 학년도가 쌓일수록 차이가
구조적으로 커진다. 반을 고르면 같은 머리글이 그 반 명단으로 좁혀진 합계로 뜻이 바뀌어,
같은 칸이 전교일 때와 반일 때 다른 모집단을 센다.

**권장:** 전교 머리글 합계도 명단을 통과시키거나(`classSummaries`와 같은 학생 목록을
넘긴다), 두 숫자의 범위가 다르다는 것을 화면이 한 줄로 적는다. 어느 쪽이든 「전교」와
「반」에서 머리글의 뜻이 달라지는 비대칭은 없앤다.

#### D-03 · 기숙사 「기준 초과 학생」에 졸업생이 영구히 남는다

**위치:** `src/modules/merit/merit.repo.ts:1135-1156`(demeritTotalsByStudent) · `:1163-1178`(findStudentsWithClass)

```ts
where: {
  track: params.track,
  kind: "DEMERIT",
  status: "ACTIVE",
  // 지워진 계정은 명단에 올리지 않는다. groupBy도 관계 조건을 받는다.
  studentProfile: { user: { deletedAt: null } },
  ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
```

신원 조건이 `user.deletedAt: null` 하나뿐이다. 그런데 `prisma/schema.prisma`의 `User.deletedAt`
주석이 스스로 「지금 이 값을 채우는 코드는 하나도 없다」고 적고 있어 이 필터는 아무도 거르지
않는다. 기숙사는 `isYearScoped`가 false라 `scopeYear`가 null → 학년도 필터도 빠진다.

**실패 시나리오:** 3년치 기숙사 벌점 25점을 쌓고 졸업한 학생이 `/merit/stats?track=DORM`의
「기준 초과 학생」에 계속 오른다. 신원을 붙이는 `findStudentsWithClass`도 `deletedAt`만 보고
그 학년도 `ENROLLED` 재적이 없으면 학급을 비워 주므로, 화면에는 「소속 미배정」으로 떠서
반 배정을 못 받은 현재 재학생과 구분되지 않는다. 카드 문구는 「**전교에서** 벌점 20점 이상인
학생입니다」라고 말한다. 교내(SCHOOL)는 학년도 필터가 있어 이 문제가 없다 — 기숙사에서만 난다.

**권장:** `demeritTotalsByStudent`(또는 `readWatchList`)에 그 학년도 재적이 `ENROLLED`인
학생만 남기는 조건을 더한다 — `studentProfile: { enrollments: { some: { year: rosterYear, status: "ENROLLED" } } }`.
누적 점수는 그대로 세되 명단에 올릴 사람만 현재 재학생으로 좁히는 것이 화면 문구와 맞는다.

---

### 3.3 중간 — 첨부의 생명주기

첨부는 이 시스템에서 **되돌릴 수 없는 유일한 삭제**이고(모듈 주석이 그렇게 적는다), 동시에
바이트가 앱 프로세스 메모리를 지나는 유일한 경로다. 두 성질 각각에 구멍이 하나씩 있다.

#### D-04 · 게시판의 「첨부파일 허용」을 끄면 그 뒤 글을 고치는 순간 기존 첨부가 디스크까지 영구 삭제된다

**위치:** `src/modules/community/post.service.ts:244-248`, `:269` · `src/app/(app)/community/[slug]/post-form.tsx:266` · `src/modules/community/community.repo.ts:288-298`

```ts
// post.service.ts 244-248 — 첨부를 안 받는 게시판에 파일이 붙는 것은 막는다
if (input.attachmentIds.length > 0 && !community.allowAttachments) {
  throw new CommunityError("ATTACHMENT_NOT_ALLOWED");
}
// :269
detached = await repo.detachFromPost(input.postId, input.attachmentIds, tx);
```
```tsx
// post-form.tsx:266 — 첨부칸(=hidden attachmentIds) 자체가 안 그려진다
{allowAttachments && (
  <div>
    <Label htmlFor="pf-files">첨부파일</Label>
    <AttachmentPicker …
```

**실패 시나리오:** 첨부가 붙은 글이 이미 있는 게시판에서 교사가 `allowAttachments`를 끈다
(`board.service.ts`의 `EDITABLE`에 들어 있어 언제든 끌 수 있고, 이 전환을 막는 검사는 없다).
그 뒤 글쓴이가 오타 하나를 고치려고 수정 화면에 들어가면 첨부칸이 안 그려지므로 hidden
`attachmentIds`가 하나도 안 실린다. 서버에서는 `length === 0`이라 246줄의 문이 안 걸리고,
269줄의 `detachFromPost(postId, [])`가 `notIn: ["__none__"]`으로 **그 글의 첨부 전부**를 지운
뒤 커밋 후 디스크 파일까지 지운다. 글·댓글·게시판은 전부 표시만 지우는데 첨부만 되돌릴 수
없는 삭제이고, 화면은 「저장」 한 번에 아무 경고도 내지 않는다. 감사로그에는 파일별로
`community:attachment:delete`가 글쓴이 이름으로 남아, 나중에 보면 본인이 일부러 뺀 것처럼 읽힌다.

같은 `updateCommunity`가 `anonymous` 끄기만 `ANONYMOUS_IRREVERSIBLE`로 막는다 — 되돌릴 수
없는 전환을 의식한 자리인데 첨부 쪽만 비어 있다.

**권장:** 수정 화면이 첨부칸을 안 그리는 경우와 「사용자가 전부 뺐다」를 서버가 구분할 수
있어야 한다. ① `PostForm`이 `allowAttachments`가 꺼져 있어도 기존 첨부의 hidden
`attachmentIds`는 싣거나(빼기 버튼만 감춘다), ② `updatePost`에서 `!community.allowAttachments`이면
detach 자체를 건너뛴다. 둘 중 하나만 해도 막힌다.

#### D-05 · 로그인한 학생 한 명이 동시 업로드만으로 앱 컨테이너 메모리를 넘길 수 있다

**위치:** `src/app/api/community/attachments/route.ts:57-83`, `:114-118`, `:135` · `src/modules/community/attachment.service.ts:74-79`

```ts
const raw = await readCappedBody(request, MAX_REQUEST_BYTES);
…
const form = await new Response(new Uint8Array(raw), { … }).formData();
…
  bytes: Buffer.from(await file.arrayBuffer()),
```

`readCappedBody`는 요청 **하나**를 21MB로 묶을 뿐, 동시에 몇 개가 뜨는지는 아무도 안 센다.
`docker-compose.yml:71-78`이 그 수치를 이미 계산해 뒀다 — 「20MB면 한 건에 60~80MB」라
적고 `mem_limit`을 1g로 올렸다. 1g에서 Next의 200MB 남짓을 빼면 건당 60~80MB로 열 건
남짓이 한계인데, 그 「서너 명」을 강제하는 장치가 없다. 브라우저 하나가 fetch 열 개를 나란히
던지면 그만이고, `docs/deploy.md:176-199`의 예시 nginx 설정에는 `client_max_body_size`만
있고 `limit_conn`·`limit_req`가 없다. 유일하게 수를 세는 `MAX_PENDING_ATTACHMENTS`(10)는
트랜잭션 안에 있어 `Buffer.from(await file.arrayBuffer())`까지 끝난 뒤에야 판정한다 —
거절해도 메모리는 이미 잡혔고, 사람이 여럿이면 그 10도 곱해진다.

**실패 시나리오:** Node의 OOM이고 `restart: unless-stopped`가 컨테이너를 되살리지만, 그
순간 돌던 모든 요청(다른 사람의 명단 반영·상벌점 부여 포함)이 함께 끊긴다. 라우트 주석이
세운 방어는 「권한 없는 계정이 400MB를 보내는 것」이지 「권한 있는 계정이 20MB를 열 번
보내는 것」이 아니다.

**권장:** 프로세스 전역의 동시 업로드 수 세마포어(3~4)를 라우트 맨 앞, `readCappedBody`를
부르기 전에 두고 넘치면 429를 준다. 앞단 프록시에도 같은 뜻의 `limit_conn`을
`docs/deploy.md` 예시에 넣어, 앱이 죽는 대신 요청이 거절되게 한다.

---

### 3.4 중간 — 권한의 문이 갈린다

#### D-06 · 게시판의 쓰기 권한을 거둬도 이미 글을 쓴 사람은 제목·본문을 계속 갈아 끼울 수 있다

**위치:** `src/modules/community/post.service.ts:237-242` · `:56-62`(loadPost) · `src/modules/community/board.service.ts:249-267`

```ts
export async function updatePost(actor: SessionUser, input: UpdatePostInput) {
  const { post, community } = await loadPost(actor, input.postId);
```
```
loadPost(56-62)가 지나는 문은 **읽기** 문이다:
  const community = await board.getReadableBySlug(actor, post.community.slug);
새 글(184)과 새 댓글(comment.service.ts:63)은 쓰기 문을 지난다:
  const community = await board.getWritableBySlug(actor, input.slug);
```

**실패 시나리오:** 교사가 게시판 설정에서 `writeRoles`에서 STUDENT를 빼 그 게시판을 읽기
전용으로 얼린다. 학생은 새 글도 새 댓글도 못 쓰고 시도하면 `authz:denied`까지 남는다.
그러나 **얼기 전에 쓴 글이 하나라도 있으면**, `/community/<slug>/<postId>/edit`에서 제목과
본문을 통째로 새 내용으로 바꿔 저장할 수 있다 — `updatePost`는 읽기 권한과 본인 소유만
확인하고 `canWrite`를 한 번도 묻지 않는다. 감사로그에는 `community:post:update`가 정상
수정으로 남아 거부 흔적이 없다. 같은 함수의 244-248행은 첨부에 대해서만 「새로 쓸 때와 같은
문이다」라며 `allowAttachments`를 다시 검사하는데, 정작 게시판 쓰기 권한 자체에는 그 대칭이 없다.

**권장:** `updatePost`에서 `loadPost` 뒤에 `board.getWritableBySlug`를 한 번 더 지나게 하거나,
`loadPost`에 문을 고르는 인자를 준다. 삭제(`deletePost`·`deleteComment`)는 읽기 문 그대로 두어도
된다 — 얼린 게시판에서 자기 글을 거두는 것은 새 내용을 밀어 넣는 일이 아니다. 그 구분을
`loadPost` 주석에 명시해 다음 사람이 셋을 같은 문으로 되돌리지 않게 한다.

#### D-07 · 교사가 자기 계정 비밀번호를 초기화하면 임시 비밀번호를 못 본 채 잠긴다

**위치:** `src/modules/admin-users/admin-user.service.ts:204-234` · `src/modules/admin-users/admin-user.repo.ts:283-286` · `src/app/(app)/admin/users/[userId]/user-forms.tsx:200-243`

```ts
export async function resetPassword(actor: SessionUser, userId: string, reason?: string) {
  await assertCan(actor, "user:manage");
  const target = await repo.findById(userId);
  if (!target) throw new AdminUserError("NOT_FOUND");
  if (target.deletedAt) throw new AdminUserError("ACCOUNT_DELETED");
  // ← userId === actor.id 검사가 없다
```

같은 파일의 이웃한 두 파괴적 동작에는 자기 계정 가드가 있다 — `setUserActive`(178행,
`CANNOT_DEACTIVATE_SELF`), `deleteUserPermanently`(250행, `CANNOT_DELETE_SELF`).
`resetPassword`에만 없고, 화면도 막지 않는다(`ToggleActiveForm`은 `user.isSelf`로 버튼을
잠그는데 `ResetPasswordForm`은 `isSelf`를 아예 읽지 않는다).

**실패 시나리오:** `resetCredentialWithDb`가 같은 트랜잭션에서 `session.deleteMany({ where: { userId } })`로
**대상의 세션을 전부** 지운다 — 대상이 자기 자신이면 지금 쓰고 있는 세션이 그 안에 든다.
평문 임시 비밀번호는 서비스 주석대로 「저장하지도 기록하지도 않는다」 — 액션 반환값에만 있고
`SecretPanel`이 그려야 볼 수 있다. 세션이 끊긴 상태에서 액션 뒤 페이지가 다시 그려지면
`requirePermission` → `requireAuth`가 `/login`으로 보내므로, **교사는 임시 비밀번호를 손에
넣지 못한 채 로그아웃된다.** 복구는 다른 교사의 초기화뿐이고, 교사가 한 명뿐이면 복구 경로가
아예 없다 — 부트스트랩은 사용자 0명일 때만 열린다.

**권장:** `resetPassword`에도 `if (userId === actor.id) throw new AdminUserError("CANNOT_RESET_SELF")`를
넣고(본인 비밀번호는 `/change-password`가 담당한다) `actions.ts`의 `MESSAGES`에 문구를 더한다.
화면에서도 `ToggleActiveForm`과 같은 방식으로 `isSelf`일 때 버튼을 잠그고 이유를 적는다.

---

### 3.5 중간 — 실패가 어디에도 안 남는다

#### D-08 · 서버 액션 열 곳이 예상 못 한 오류를 로그도 재던짐도 없이 삼킨다

**위치:** `src/app/(app)/merit/actions.ts:85` 외 아홉

```ts
if (error instanceof MeritError) {
  return fail(MESSAGES[error.message] ?? "처리하지 못했습니다.", note);
}
return fail("처리하지 못했습니다.", note);   // ← 85행. 예상 못 한 오류가 여기로 온다
```
```ts
// 같은 파일 201-202행은 정반대로 적혀 있다:
// 예상 못 한 오류는 서버에 남긴다. 화면에는 일반 문구만 나간다.
console.error(logLabel, error);
```

같은 모양이 열 곳에 있다 — `merit/actions.ts:85`(부여·취소·일괄부여) ·
`admin/students/actions.ts:74`(표 편집 저장) · `admin/students/import/actions.ts:102`(명단
미리보기) · `community/[slug]/actions.ts:44` · `admin/community/actions.ts:40` ·
`admin/merit/rules/actions.ts:40` · `admin/settings/actions.ts:40` · `admin/users/actions.ts:49` ·
`admin/invites/actions.ts:46` · `parent-invite/actions.ts:53`.

**실패 시나리오:** CLAUDE.md 「주의점」이 적어 둔 함정이 그대로 실현된다 — 스키마를 바꾸고
`next dev`를 재시작하지 않으면 새 필드를 쓰는 화면만 `PrismaClientValidationError`로 실패하는데,
타입 검사·테스트·빌드는 전부 통과하므로 유일한 단서가 런타임 오류다. 그 오류가 이 줄에서
사라진다: 화면에는 일반 문구만, 서버 콘솔에는 아무것도, 재던지지 않으니 Next의 digest도 없다.
DB 커넥션 고갈·제약 위반·널 역참조 전부 같은 운명이고, **D-01의 확정적 throw가 바로 이
자리에서 사라진다.**

이것이 실수임을 저장소 스스로 증언한다. 삼키는 파일 셋이 몇 십 줄 옆에서 정확히 반대 주석을
달고 로그를 남긴다 — `merit/actions.ts:201`, `admin/students/import/actions.ts:124·222`
(「화면에는 일반 문구만 나가므로 여기서 안 남기면 원인이 어디에도 없다」),
`admin/students/actions.ts:99`. `pass/actions.ts:72`는 아예 `throw error`로 경계에 넘기고
`scan/actions.ts:33`·`attachments/route.ts:158`도 같다. 서버 컴포넌트 쪽은 규율이 서 있다.
**오직 서버 액션 층에서만, 그것도 절반에서만 갈라져 있다.**

특히 `admin/students/import/actions.ts`는 한 파일 안에서 갈린다 — 반영은 223행에서 로그를
남기고, 미리보기는 102행에서 그냥 삼킨다.

**권장:** 폴백으로 떨어지기 직전에 `console.error`를 넣는다(`pass/actions.ts`처럼 재던져
`error.tsx`에 맡기는 것도 같은 값을 한다 — 그쪽은 digest가 남는다). 열 곳을 손으로 맞추지
말고 「ForbiddenError → 도메인 오류 → 로그 후 폴백」 세 갈래를 만드는 공용 헬퍼 하나를
`core/` 아래 두고 각 액션이 자기 사전과 폴백 문구만 넘기게 한다.

#### D-09 · 명단 반영이 도는 동안 학생 가입이 정체불명 오류로 죽는다

**위치:** `src/modules/registration/registration.service.ts:186-190`, `:205-219` · `src/modules/enrollment/roster.service.ts:355`

```ts
if (role === "STUDENT") {
  for (let attempt = 1; attempt <= STUDENT_CODE_RETRIES; attempt += 1) {
    try {
      await withTransaction(completeWithTx, {
        isolationLevel: "Serializable",     // ← timeout이 없다 = Prisma 기본 5초
      });
```

이 트랜잭션은 `repo.findCurrentYearForUpdate(tx)`로 `AcademicYear` 전 행에 `FOR UPDATE`를
건다. 같은 잠금을 명단 일괄 반영이 `{ timeout: 120_000 }`으로 최대 120초 쥔다 — **학년 초,
교사가 명단을 반영하는 바로 그때가 새 학생들이 가입하는 때다.**

**실패 시나리오:** 가입 요청이 잠금을 기다리다 5초에 P2028로 잘린다. `:205-219`의 catch는
`InviteRaceError`·`NumberTakenError`·직렬화 충돌만 보므로 P2028이 그대로 새어
`register/actions.ts:149-157`이 「가입하지 못했습니다.」만 띄운다. 학생은 코드가 잘못된 줄
알고 계속 다시 누른다. 이 실패는 저장소가 이미 아는 것이다 — `merit/award.service.ts:163-167`이
《명단 일괄 반영이 같은 잠금을 최대 120초 쥔다 … 기본값 5초로는 … P2028로 떨어지고, 화면에는
원인을 알 수 없는 문구만 나간다》라고 적었고, `pass/decision.service.ts:266-278`은
`{ timeout: 130_000 }`과 P2028→`PASS_BUSY` 번역으로 두 쪽을 다 막았다. **가입 경로만 둘 다 없다.**

**권장:** `decision.service`의 선례대로 두 쪽을 함께 고친다 — (1) 이 `withTransaction`에
roster의 120초를 덮는 예산을 주고, (2) catch에 P2028 갈래를 더해 재시도 가능한 문구로 옮긴다.
예산만 올리면 더 긴 반영에서 여전히 정체불명으로 죽고, 번역만 더하면 정상 대기가 계속
업무 실패가 된다.

---

### 3.6 중간 — 익명과 개인정보 고지

CLAUDE.md는 익명 게시판의 추적 가능성을 감수하는 근거로 「글쓰기 화면이 학생에게 그 사실을
알린다」를 든다. 그 고지가 닿지 않는 두 경로가 있다.

#### D-10 · 익명 게시판 댓글은 아무 경고도 없이 쓰인다

**위치:** `src/app/(app)/community/[slug]/[postId]/comment-form.tsx:25` · 대조 `post-form.tsx:203-208`

```tsx
// comment-form.tsx — anonymous를 prop으로 받지도 않는다
export function CommentForm({ postId }: { postId: string }) {
```
```tsx
// post-form.tsx:203 — 글쓰기 화면에만 있는 고지
{anonymous && (
  <Note tone="warn" className="mb-4">
    이 게시판의 글은 작성자가 화면에 보이지 않습니다. 다만 학교는 감사 기록으로
    작성자를 확인할 수 있습니다.
  </Note>
)}
```

**실패 시나리오:** 댓글은 `createComment`가 글과 똑같이 `actorUserId`·`actorName`·시각이 붙은
`community:comment:create`를 남기는데, `CommentForm`은 `anonymous` 값을 받지도 않아 어떤
경우에도 경고를 못 그린다. 그 폼이 사는 글 상세 화면에도 익명 관련 안내가 한 줄도 없다 —
대시보드의 「새 글」에서 바로 들어온 학생은 게시판 목록의 안내조차 못 보고, 그 안내마저
「화면에서 아무에게도 보이지 않습니다」라고만 하고 감사 기록 단서를 뺀다. **미성년 학생이
「완전히 익명」이라고 믿고 익명 게시판에 댓글로 고발·비판을 쓴다.**

**권장:** `CommentForm`에 `anonymous` prop을 주고 `PostForm`과 같은 문구의 `Note`를 그린다
(문구는 한 곳에서 공유). 함께, 글 상세 화면에도 익명 배지나 안내를 세워 목록을 거치지 않고
들어온 사람이 같은 사실을 보게 한다.

#### D-11 · 익명 게시판에 올린 사진이 EXIF를 그대로 달고 모든 열람자에게 나간다

**위치:** `src/modules/community/community.storage.ts:90-127` · `src/app/(app)/community/[slug]/attachment-picker.tsx:64-72`

```ts
const ALLOWED: Record<string, Allowed> = {
  png: { mime: "image/png", inline: true },
  jpg: { mime: "image/jpeg", inline: true },
  jpeg: { mime: "image/jpeg", inline: true },
…
export async function writeAttachment(key: string, at: Date, bytes: Buffer): Promise<void> {
  await writeFile(target, bytes);   // 받은 바이트 그대로
}
```

업로드 사슬 어디에도 이미지 재인코딩·메타데이터 제거가 없다 — 클라이언트도 `File` 객체를
`FormData`에 그대로 싣고, 저장소 전체에 `sharp`·`exif` 계열 의존성이 없으며, 내려받기는
읽은 바이트를 그대로 응답한다.

**실패 시나리오:** 폰으로 찍은 JPEG에는 GPS 좌표·촬영 시각·기기 모델이 붙어 있다. 익명
게시판에 학생이 사진 한 장을 올리면, 그 게시판을 읽을 수 있는 모든 학생·학부모가 원본을
내려받아 좌표(대개 기숙사·집)를 읽을 수 있다. CLAUDE.md는 「화면·API 어디서도 작성자가 안
나오게 하는 일은 `community.view.ts` 한 곳이 맡는다」고 못 박지만, `view.ts`는 이름 필드만
보고 첨부 바이트는 못 본다. 감수하기로 한 유일한 익명 해제 경로는 교사의 감사로그 대조인데
**이 경로의 청중은 전교다.**

**권장:** 이미지 첨부는 저장 전에 메타데이터를 벗긴다(재인코딩하거나 EXIF/XMP 세그먼트를
제거). 최소한 익명 게시판에서는 반드시 벗기고, 벗길 수 없으면 그 게시판에서 이미지 형식을
받지 않는다.

---

### 3.7 중간 — 화면이 틀린 것을 말한다

#### D-12 · 초대코드 목록이 `status`만 보고 판정해, 만료된 코드가 「대기」로 세어지고 코드가 그대로 노출된다

**위치:** `src/app/(app)/admin/invites/panel.tsx:44-49` · `invite-table.tsx:78`, `:183-186` · `src/lib/invite-code.ts:43-49`

```tsx
// panel.tsx:46-48 — Date를 화면 문자열로 부숴 클라이언트로 보낸다
status: invite.status,
createdAt: formatDate(invite.createdAt),
expiresAt: invite.expiresAt ? formatDate(invite.expiresAt) : null,
```
```tsx
// invite-table.tsx:78 · 183-186 — 판정이 status 하나뿐이다
{row.status === "PENDING" ? row.code : maskInviteCode(row.code)}
  : rows.filter((r) => r.status === key).length;
```

**실패 시나리오:** 명단 반영은 신규 학생 전원에게 만료 90일짜리 코드를 발급한다
(`INVITE_EXPIRES_DAYS = 90`). 3월에 300명을 올리고 20명이 가입하지 않으면, 6월 이후 초대
탭의 기본 화면은 그 20건을 여전히 「대기 20」으로 세고 **코드 전문을 그대로 그린다.**
`isInviteUsable`은 `expiresAt <= now`를 못 쓰는 코드로 보고 `maskInviteCode`의 주석은
「더는 가입에 쓸 수 없는 코드를 목록에 식별 가능한 만큼만 남긴다」고 적었는데, 만료된
PENDING은 그 가림에 걸리지 않는다. 교사는 살아 있는 코드가 20개라고 믿고 재발급하지 않으며,
학생은 코드가 있는데 가입이 막힌다. 근본 원인은 `panel.tsx:48`이 `expiresAt`을 표시용
문자열로 바꿔 넘긴다는 것이다 — 클라이언트에는 비교할 값 자체가 없다.

같은 실수를 `invite.repo.ts:74-80`이 이미 겪고 고쳐 두었다(「판정 규칙은 `lib/invite-code.ts`의
`isInviteUsable`과 같아야 한다 … 여기서만 안 봤다」). 그 교훈이 목록 화면에는 안 왔다.

**권장:** `toRow`가 `usable: isInviteUsable(invite)`를 함께 실어 보내고, 상태 필터·`countFor`·
코드 표시 셋이 모두 그 값을 보게 한다. 「만료」를 상태 칩으로 하나 더 세우면 대기 건수가
실제로 쓸 수 있는 코드 수와 같아진다.

#### D-13 · 전교·학년 명단이 학년·반을 버리고 번호만으로 다시 정렬된다

**위치:** `src/app/(app)/merit/class-roster.tsx:79`, `:140-146` · 대조 `src/modules/merit/merit.repo.ts:529-541`

```ts
const sorted = useMemo(() => {
  const copy = [...rows];
  if (sortKey === "net") copy.sort((a, b) => b.net - a.net);
  else copy.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  return copy;
}, [rows, sortKey]);
```

`sortKey`의 초기값이 `"number"`라, `/merit`에 반을 고르지 않고 들어온 교사가 **처음 보는
화면이 이 정렬이다.** repo는 일부러 `[{grade}, {classNo}, {number}]` 3단으로 보내면서
「전교를 훑을 때는 학년·반이 앞에 서야 읽힌다 — 번호만으로 세우면 1학년 1번 다음에 3학년
1번이 온다」고 적어 두었는데, 클라이언트가 그 순서를 덮는다.

**실패 시나리오:** 안정 정렬이라 같은 번호끼리는 학년·반 순이 남지만 결과는 「1-1 1번,
1-2 1번, …, 3-4 1번, 1-1 2번, …」로 열두 반이 번호마다 뒤섞인다. `number ?? 0` 때문에 번호
없는 미배정 학생은 서버가 맨 뒤로 보낸 것과 반대로 맨 앞으로 올라온다. 전교 200~300명
명단에서 특정 학생 줄을 찾거나 일괄 부여 전에 체크한 줄을 눈으로 훑는 일이 사실상 불가능해진다.

**권장:** 번호 정렬에도 학급을 앞세운다 — `(a.grade ?? Infinity) - (b.grade ?? Infinity) || (a.classNo ?? Infinity) - (b.classNo ?? Infinity) || (a.number ?? Infinity) - (b.number ?? Infinity)`.
또는 범위를 좁히지 않은 화면에서는 서버가 준 순서를 그대로 둔다.

---

### 3.8 중간 — 가입 한도

#### D-14 · IP당 인증 발송 20회/시간이 가입 1건당 2개씩 확정 소모되어, 같은 공인 IP에서 시간당 10명만 가입할 수 있다

**위치:** `src/modules/verification/verification.service.ts:30`, `:83-88`, `:141-158` · `src/modules/verification/verification.repo.ts:17-25` · `src/modules/registration/registration.service.ts:60-67`, `:123-124`

```ts
/**
 * 같은 IP에서 한 시간 동안 보낼 수 있는 횟수 (I4) — 대상을 바꿔 가며 우회하는
 * 것을 막는다. 교내망에서 여러 학생이 동시에 가입할 수 있어 넉넉하게 잡는다.
 */
const MAX_SENDS_PER_HOUR_PER_IP = 20;
```

실제 발송을 하지 않는 것 자체는 승인된 예외지만, **그 우회 경로가 이 한도를 쓰는 방식이
문제다.** `requestVerification`이 `createTemporaryVerifiedProof`를 부르고, 그것이 `requestCode`와
**같은** `insertRateLimitedCode`를 지난다. 발송이 없는데도 `VerificationCode` 행이 한 건
생기고 `requestIp`가 박힌다. 가입 화면은 이메일·전화 두 칸이 각각 `VerifiedField`이고
`completeRegistration`이 두 채널을 모두 요구하므로 **성공한 가입 1건마다 정확히 2행**이 남는다.

**실패 시나리오:** `countRecentSendsByIp`는 `where: { requestIp, createdAt: { gte: since } }`뿐 —
채널도 `consumedAt`도 안 본다. 학교 전체가 NAT 뒤 하나의 공인 IP를 쓰면 시간당 최대 10명이
상한이다. 오타로 이메일을 고쳐 다시 확인한 학생이 있으면 그보다 더 준다. 11번째 학생부터는
「인증번호를 너무 많이 요청했습니다. 한 시간 뒤에 다시 요청하세요.」를 보고, 교사가 손쓸
방법이 없다. **신입생 한 학년을 컴퓨터실에서 한 번에 가입시키는 상황이 정확히 주석이 말하는
「교내망에서 여러 학생이 동시에 가입」이며, 20은 그 상황에서 넉넉하지 않다.** 발송을 다시
켜도 채널 2개가 각각 1행씩 쓰므로 상한은 그대로다.

**권장:** 한도의 분모가 「발송 횟수」가 아니라 「가입 시도 수 × 2」임을 반영해
`MAX_SENDS_PER_HOUR_PER_IP`를 올리거나, `countRecentSendsByIp`에서 이미 소진된
(`consumedAt != null`) 행을 빼서 한 번 쓴 예산이 한 시간 내내 묶이지 않게 한다. 실제 발송을
다시 켜는 날 이 값을 재검토하라는 메모를 CLAUDE.md의 「지금 인증은 실제로 발송하지 않는다」
절에 함께 남긴다.

---

### 3.9 중간 — 손수 만든 권한·게이트에 테스트가 없다

넷 다 「현재 존재하는 취약점」이 아니라 **회귀를 못 잡는 상태**다. 그럼에도 중간인 이유는
공통이다 — 넷 모두 `can()` 표 밖에서 손으로 세운 판정이거나 프레임워크가 자동으로 걸어 주지
않는 방어이고, 그 판정을 지우거나 뒤집어도 단위 2,133 / 통합 80 / e2e 5가 전부 초록이다.

#### D-15 · `getPassDetail`의 본인·보호자 분기를 어느 테스트도 실행하지 않는다

**위치:** `src/modules/pass/request.service.ts:269-281`

```ts
if (can(actor, "pass:read:any")) return pass;   // ← 테스트가 타는 유일한 줄

const profile = await repo.findStudentProfileByUserId(actor.id);
const own = profile?.id === pass.studentProfileId;
const guardian = !own && (await repo.isParentOf(actor.id, pass.studentProfileId));

if (!own && !guardian) {              // ← 이 블록을 통째로 지워도 스위트 전부 초록
  await recordDenied(actor, "pass:read:any", passId);
  throw new ForbiddenError("pass:read:any");
}
```

이 함수를 부르는 테스트는 `tests/integration/pass.flow.integration.test.ts:180·193·213`
셋뿐이고 전부 `adminActor()`라 269행의 조기 반환으로 빠져나간다.
`tests/modules/pass/request.service.test.ts`에는 `getPassDetail` describe 자체가 없다.
블록을 지우면 로그인한 아무 학생이나 `/pass/<남의 passId>`를 열어 다른 학생의 행선지·사유·
보호자 이름·동의 메모까지 읽는다 — 그 페이지의 유일한 인가가 이 함수다.

**권장:** `request.service.test.ts`에 describe를 추가한다 — (a) 본인 통과, (b) 보호자 통과,
(c) **남남인 학생은 `ForbiddenError` + `authz:denied`(targetType "Pass")**, (d) `pass:read:any`가
있으면 `repo.isParentOf`를 아예 안 부른다. (c)가 핵심 단언이다.

#### D-16 · 학생 상세 머리글의 「셋 중 하나」 권한 판정이 무테스트

**위치:** `src/modules/enrollment/enrollment.service.ts:34-59`, `:66-70`, `:92-97`

```ts
const STUDENT_VIEW_ACTIONS: Action[] = ["merit:read:any", "pass:read:any", "student:manage"];

async function assertCanViewStudent(actor: SessionUser): Promise<void> {
  if (STUDENT_VIEW_ACTIONS.some((action) => can(actor, action))) return;
```

`getStudentIdentity`·`getStudentProfile`·`assertCanViewStudent` 세 이름 모두 `tests/` 아래에
한 번도 나오지 않는다(`enrollment.service.test.ts`가 덮는 것은 `listStudents`와
`saveEnrollments` 둘이다). 이 저장소에서 `can()` 밖의 손수 만든 권한 규칙은
`community.access.ts`(테스트 있음)와 이것 둘인데 이쪽만 비어 있다.

**실패 시나리오(변조 시):** `STUDENT_VIEW_ACTIONS`에 `"merit:rule:read"`를 더하면 — 그 액션은
`RULES`에서 STUDENT·PARENT에게 열려 있으므로 — 학생이 `/students/<남의 id>`를 열어 다른
학생의 이름·학생코드·학년·반·번호·학적을 읽는데, `can.test.ts`의 `EXPECTED`는 표만 대조하므로
초록이다. `getStudentProfile`의 `assertCan(actor, "student:manage")`을 지우면 생년월일·이메일까지
나오는 「학생 정보」 탭이 열리는데 역시 초록이다.

**권장:** 두 describe를 추가한다 — 실제 `ROLES`를 태워 ADMIN만 통과하고 STUDENT·PARENT는
`ForbiddenError` + `authz:denied`(targetType "StudentProfile")를 받는 것, 그리고
`getStudentProfile`에서 STUDENT·PARENT면 `repo.findStudentDetail`이 아예 안 불리는 것.

#### D-17 · 첨부 업로드·내려받기 라우트 핸들러에 단위 테스트가 하나도 없다

**위치:** `src/app/api/community/attachments/route.ts:72-77`, `:84-92` · `.../[...attachment]/route.ts:54-66`

```ts
/** `requireAuth`가 막는 것을 손으로 다시 세운다 — **mustChangePassword까지.** */
function gate(actor: SessionUser | null): actor is SessionUser {
  return actor !== null && actor.status === "ACTIVE" && !actor.deletedAt && !actor.mustChangePassword;
}
```

`tests/` 안에서 이 두 라우트를 import하는 단위 테스트가 없다(라우트 핸들러 단위 테스트는
`api/auth`와 `api/pass/qr` 둘뿐이고, 저장소의 `route.ts`는 6개다). 유일한 커버는
`tests/e2e/attachment.smoke.spec.ts` 한 건인데 ADMIN 계정의 upload 201 / download 200 왕복과
바이트 일치만 본다.

**무엇을 못 잡는가:** `gate()`에서 `!actor.mustChangePassword`를 지워도 초록이다 — 임시
비밀번호를 아직 안 바꾼 계정(앱 전체가 `/change-password`로 가둬 두는 상태)이 파일을 올린다.
`status`·`deletedAt` 검사도 같다. `if (seen > max)`를 없애도 초록인데, 이 파일 주석이
「**그 대가로 이 경로에는 아무 상한도 자동으로 걸리지 않는다**」고 적어 둔 바로 그 방어다
(D-05가 그 위에 서 있다). 내려받기의 「ForbiddenError도 CommunityError도 똑같이 404로 떨어뜨려
첨부 id 존재 여부를 안 흘린다」도 무검증이다.

**권장:** `tests/app/api/community/attachments/route.test.ts`를 만들어 `getSessionUser`·
`getWritableBySlug`·`uploadAttachment`를 목하고 POST를 직접 부른다 — (a) 세 게이트 조건
각각에서 401이고 `getWritableBySlug`를 아예 안 부른다, (b) 상한 초과 본문이면 413이고
`uploadAttachment`가 안 불린다, (c) `ForbiddenError`면 403이고 `request.body`를 읽지 않는다.
내려받기 쪽은 `ForbiddenError`·`CommunityError`·`ENOENT` 셋이 모두 404 + 같은 본문임을 단언한다.

#### D-18 · 대시보드의 `listRecentPosts`가 테스트 0건 — 게시판별 익명 마스킹 배선이 검증되지 않는다

**위치:** `src/modules/community/post.service.ts:159-178` · 호출부 `app/(app)/page.tsx:151`, `:356`

```ts
const communities = await board.listReadable(actor);
…
const community = byId.get(row.communityId)!;   // ← 글마다 제 게시판의 anonymous를 고르는 자리
return { ...toPostListItem(row, community, actor, row._count.comments),
```

`tests/` 전체에서 `listRecentPosts`가 한 번도 나오지 않는다. `view.test.ts`는
`toPostListItem`이라는 순수 함수만 보고, 「누가 그 함수를 어떤 `community` 인자로 부르는가」는
아무도 안 본다. CLAUDE.md가 못 박은 「repo 행을 화면으로 직접 넘기지 않는다 · 익명을 가리는
자리는 `community.view.ts` 하나」의 **실제 배선이 이 함수에서만 무검증이다.**
171행을 `communities[0]!`로 바꾸면 익명 게시판 글의 작성자 이름이 대시보드 「새 글」에 그대로
뜨는데 초록이고, 163행을 `repo.listCommunities()`로 바꾸면 `canRead` 필터가 사라져 학생이 못
읽는 게시판의 글 제목이 새는데 역시 초록이다.

**권장:** `board.listReadable`을 [실명, 익명] 둘로 목하고 — (a) 익명 게시판 글만 `author`가
null이고 `JSON.stringify(result)`에 작성자 이름이 없다, (b) `listRecentPostsAcross`가 받은 id
배열이 `listReadable`이 준 집합과 정확히 같다, (c) `listReadable`이 빈 배열이면 repo를 아예 안
부른다 — 셋을 단언한다.

---

### 3.10 낮음 (94건)

뿌리가 같은 것끼리 열한 묶음으로 갈랐다. 묶음마다 대표 인용 하나를 앞에 두고 나머지는 표로
접었다.

#### A. 첨부의 생명주기와 그 문서 (6)

```ts
// community.repo.ts:407-413 — postId 조건이 없다
await db.communityAttachment.deleteMany({ where: { id: { in: ids } } });
```

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-01 | 1시간이 지나 고아 정리에 쓸려 나간 첨부가 조용히 빠진 채 글이 저장된다. `attached === 0`만 검사하므로 여럿 중 일부만 만료돼도 통과한다 | `post.service.ts:205-208` | `attached !== input.attachmentIds.length`를 오류 조건으로 삼는다 |
| DL-02 | `deleteAttachments`가 `postId: null`을 다시 확인하지 않아, SELECT와 DELETE 사이에 글에 붙은 첨부를 고아 정리가 지울 수 있다 | `community.repo.ts:412` · `attachment.service.ts:137-145` | `where`에 `postId: null`을 함께 건다 |
| DL-03 | 파일 이름 길이에 상한이 없다. 이 모듈에서 유일하게 zod 경계가 없는 쓰기 경로라 수십만 자가 DB·감사 metadata·`Content-Disposition`에 그대로 들어간다 | `attachments/route.ts:137-143` | 255자 초과를 거부하고 `community.schema.ts`에 업로드 스키마를 둔다 |
| DL-04 | 내려받기 라우트 주석이 「전역 CSP를 여기서 덮어쓴다」고 적어, `next.config.ts`의 첨부 규칙을 군더더기로 읽게 만든다 (실제 소유자는 `next.config.ts`) | `[...attachment]/route.ts:46-48` ↔ `next.config.ts:113-115` | 주석을 「이 줄은 보험이고 실제로 서는 것은 `ATTACHMENT_HEADERS`다」로 고치고 양쪽이 서로를 가리키게 한다 |
| DL-05 | 글쓰기 화면의 「첨부파일」 라벨이 존재하지 않는 id(`pf-files`)를 가리켜 눌러도 파일 고르기가 안 열린다. `htmlFor` 60여 개 중 대상이 없는 유일한 것 | `post-form.tsx:268` · `attachment-picker.tsx` | `AttachmentPicker`가 `inputId` prop을 받아 파일 입력에 붙이고 `aria-label`을 뗀다 |
| DL-06 | 「20MB」가 상수와 별개로 세 곳에 글자로 박혀 있는데 `MAX_ATTACHMENT_BYTES` 주석의 「함께 움직인다」 목록에는 화면 문구가 없다 | `community.schema.ts:9-17` · `route.ts:32·117` · `attachment-picker.tsx:128` | 주석 목록에 화면·오류 문구를 넣거나 상수에서 만든 문자열을 셋이 함께 쓰게 한다 |

#### B. 학적을 보지 않는 명단·화면 (7)

**DL-07 · 「명단에서 빠진 학생」을 설명하는 화면 다섯 곳이 오늘 빠진 학생에게는 켜지지 않는다.**
`applyRoster`는 `roster.repo.ts:192`의 `tx.user.deleteMany`로 User 행 자체를 지운다
(`StudentProfile`→`MeritAward`까지 Cascade). 그래서 교사가 상벌점 화면에서 그 학생 이름을
검색하면 `includeRemoved: true`가 걸려 있어도 조회할 행이 없어 **0건**이 나오고, 화면은 왜
없는지 한 마디도 하지 않는다. `admin-view.tsx:176-180`의 주석이 약속한 「결과에 「삭제됨」이
붙고 부여는 서비스가 막으므로 잘못 줄 수 없다」는 보호가 오늘 데이터에는 존재하지 않는다 —
`removedAt`은 `User.deletedAt`에서 나오는데 그 값을 채우는 코드가 없다. 물리 삭제 자체는
`prisma/schema.prisma:42-56`이 「소프트 삭제를 계획했다가 물리 삭제로 되돌린 잔재」로 명시한
**의도된 현행 설계**이므로, 남는 결함은 ① 존재하지 않는 보호를 있다고 적은 주석과
② `includeRemoved`·`removedAt`·「삭제됨」 배지·「명단 제외일」·`merit-tab` 안내가 도달하지
않는 죽은 분기라는 것이다. **이 항목은 지난 감사 C-01을 대체하지 않는다 — §4.3을 함께 읽어야 한다.**
권장: 물리 삭제를 유지한다면 다섯 분기를 함께 걷어내고 검색 0건일 때 「명단에서 빠진 학생은
기록이 함께 지워집니다」를 `EmptyState`로 말하게 한다. `src/core/auth/session.ts:16`의 주석이
`schema.prisma:47`과 정반대를 말하는 것부터 맞춘다.

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-08 | 기숙사 트랙은 `isYearScoped`가 false라 「지난 학년도를 보는 중」 가드가 건너뛰어진다. 주소를 직접 치면 옛 명단(졸업생 포함)에 일괄 부여 폼이 열린다 | `merit/admin-view.tsx:223` · `award.service.ts:359` | 조건에서 `isYearScoped(query.track)`를 떼거나 명단 표에 `EnrollmentTag`를 붙인다 |
| DL-09 | 반 고르기 칩이 4반까지뿐인데 명단은 20반까지 받는다. 5반이 생기면 그 반만 화면에서 고를 수 없다 | `merit/admin-view.tsx:301-302` ↔ `enrollment.schema.ts:12` | `MIN/MAX_CLASS_NO`로 목록을 만들거나 실제 `SchoolClass` 행을 읽는다 |
| DL-10 | 학생코드가 빈 줄의 중복 검사가 졸업 면제 **후** 목록을 보므로, 재입학 학생을 코드 없이 적으면 확정이 통과해 두 번째 프로필이 생긴다 | `roster.plan.ts:186`, `:220` | 220행의 대조 대상을 면제 전 `missing`(또는 `existing`)으로 넓힌다 |
| DL-11 | 셀 값만 NFC 정규화하고 머리글은 안 한다. 조합형 한글 머리글 파일이 「열이 없습니다」로 전부 막힌다 | `roster.parse.ts:462` | `table[0]!.map((h) => h.trim().normalize("NFC"))` |
| DL-12 | 명단 삭제로 자녀가 없어지는 학부모를 미리보기가 알리지 않는다. 설계 문서가 명시적으로 요구한 항목이고, 빈 학부모 계정이 활성으로 남는다 | `import-form.tsx:475` ↔ 설계문서 `…roster-design.md:298` | `roster.plan`에 그 목록을 얹어 삭제 경고 아래에 띄우거나, 문서를 「구현하지 않음」으로 고친다 |
| DL-13 | 판독 화면이 10반 이상 학생의 학번을 통째로 잃는다. `formatStudentNumber`가 주석으로 약속한 `formatSeat` 폴백을 안 쓴다 | `verify.service.ts:146-157` · `lib/student-number.ts:28` | `formatStudentNumber(...) ?? formatSeat(...)` |

#### C. `AcademicYear` 잠금과 트랜잭션 경계 (5)

```ts
// registration.repo.ts:30 — 여섯 파일에 글자까지 같은 사본이 있다
await db.$queryRaw`SELECT "year" FROM "AcademicYear" ORDER BY "year" FOR UPDATE`;
```

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-14 | 일괄 부여가 `recordAuditMany` 대신 학생 수만큼 `recordAudit`을 부른다 — 그 헬퍼 주석이 정확히 이 잠금을 근거로 든다 | `award.service.ts:324` · `core/audit/audit.ts:57-66` | 루프에서 배열만 모아 `recordAuditMany(inputs, tx)` 한 번 |
| DL-15 | 현재 학년도 전환·계정 수정도 같은 잠금을 기본 5초로 잡고, 저장 실패에 P2028 갈래가 없다 | `academic-year.service.ts:61` · `admin-user.service.ts:111-116` · `admin/students/actions.ts:61-75` | 잠금 예산을 한곳의 상수로 통일하고 `isTransactionTimeout`을 공용 헬퍼로 올린다 |
| DL-16 | 교착을 막는 「전 행을 year 순으로」 규약이 여섯 벌 복제돼 있고 넷은 근거 주석이 없다. 같은 모양임을 지키는 테스트도 없다 | `registration/roster/enrollment/merit/admin-user/pass` repo | core에 하나만 두고 여섯이 re-export한다 |
| DL-17 | 부여 직전의 학생 확인이 트랜잭션 밖이라, 명단 반영을 기다린 부여는 방금 지워진 학생에게 P2003(외래키)으로 떨어지고 그 코드는 번역되지 않는다 | `award.service.ts:114-121`, `:290` | 확인을 잠금 획득 뒤로 옮긴다(`lockEligibleStudentForPassCreation`이 선례). 최소한 P2003을 `STUDENT_NOT_FOUND`로 옮긴다 |
| DL-18 | 가입 중 이메일이 선점되면 준비된 문구 대신 폴백이 나간다. 같은 트랜잭션이 반·번호 충돌은 번역하면서 이메일만 놓친다 | `registration.repo.ts:76-91` ↔ `:155-167` | `isUniqueViolation(error, "email")`을 전용 오류로 옮겨 기존 문구로 번역한다 |

#### D. 감사로그 규격의 균열 (10)

```ts
// core/authz/errors.ts:31-34 — can() 거부 전부가 이 한 곳을 지난다
action: "authz:denied",
targetType: "Authz",
```

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-19 | 학생증 거부 감사로그가 `targetType: "Pass"`에 행위자 User id를 싣는다. 교사·학부모가 `/pass/qr`을 열 때마다 쌓인다 | `request.service.ts:297-301`, `:324-341` | `recordDenied`가 `targetType`을 인자로 받게 한다 |
| DL-20 | 계정 조치 세 건의 사유가 날것으로 찍히거나(`reason 전학`) 아예 안 보인다(`user:update`는 reason을 버린다). 같은 파일이 그 폴백을 나쁘다고 적어 두었다 | `audit-log.labels.ts:443-467`, `:481` | `user:activate`·`user:deactivate`·`user:reset-password`에 `reasonSummary`를 더하고 `user:update`는 둘을 이어 붙인다 |
| DL-21 | 첨부 미리보기 소유권 거부만 `authz:denied`를 안 남긴다 — `src/`의 손수 던지는 `ForbiddenError` 12곳 중 유일 | `attachment.service.ts:170` | `denyAccess`·`denyOwnership`과 같은 모양으로 남긴다 |
| DL-22 | 첨부 고아 정리와 업로드 실패 되돌리기가 행·파일을 지우면서 아무 기록도 안 남긴다. 후자는 `create` 기록을 이미 커밋한 뒤라 존재한 적 없는 첨부의 생성 기록만 남는다 | `attachment.service.ts:118-121`, `:133-149` | 두 자리에서 파일마다 `community:attachment:delete`를 남긴다 |
| DL-23 | 명단 반영이 발급한 초대코드에 건별 `invite:create`가 없다 — 같은 트랜잭션의 폐기는 코드마다 남긴다 | `roster.repo.ts:294-310` ↔ `roster.service.ts:322-331` | `applyRoster`가 만든 invite id를 돌려주고 `recordAuditMany` 배열에 한 줄씩 넣는다 |
| DL-24 | 계정 완전 삭제가 그 학생이 만든 초대코드를 함께 지우면서 아무 기록도 안 남긴다. 명단 반영의 같은 삭제는 코드마다 남긴다 | `admin-user.repo.ts:303-315` · `admin-user.service.ts:262-268` | 지운 invite id·role을 돌려받아 코드마다 한 줄 남기거나, 최소한 건수를 metadata에 넣는다 |
| DL-25 | 모든 권한 거부가 쓰는 `targetType: "Authz"`만 `TARGET_LABELS`에 없어 한글 표의 「대상」 칸에 영문으로 찍힌다. 저장된 12개 중 라벨 없는 유일한 값 | `audit-log.labels.ts:179-196` ↔ `core/authz/errors.ts:33` | `Authz: "권한"`을 더한다 |
| DL-26 | `user:soft-delete`는 아무도 남기지 않는데 「옛 행 전용」 표시 없이 표·라벨·톤 세 곳에 서 있다. 근거였던 계획은 폐기됐다 | `audit-log.labels.ts:38`, `:91`, `:136` | 두 legacy 항목과 같은 주석을 붙이거나 세 곳에서 뺀다 |
| DL-27 | 「`deleted`는 옛 행에만 있는 키」 주석과 달리 명단 반영이 지금도 그 키를 쓴다. 셋을 한 묶음 legacy로 읽고 지우면 삭제 건수가 조용히 사라진다 | `audit-log.labels.ts:257` ↔ `roster.service.ts:290-298` | legacy 표시를 `softDeleted`·`restored`에만 붙인다 |
| DL-28 | 「삭제된 사람의 개인정보가 감사로그에 남으면 안 된다」는 주석이 지켜지지 않는다 — `actorName` 스냅샷과 merit metadata의 `studentName`이 그대로 남는다 | `admin-user.service.ts:265-272` ↔ `schema.prisma:385` | 주석을 이 기록의 범위로 좁혀 적는다. 파기를 원하면 익명화 절차를 따로 설계한다 |

#### E. 오류 경로와 무효화 대상 (6)

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-29 | `PASS_NOT_ACTIVE`는 어디서도 던지지 않는데 오류표와 `MESSAGES`에 남아 있다. 표 머리글이 「이 모듈이 쓰는 코드는 아래가 전부다」라 선언한다 | `pass.error.ts:23` · `pass/actions.ts:46` | 두 자리에서 지우거나 쓰지 않는다는 사실을 명시한다 |
| DL-30 | 학생·학년도 액션 넷의 `revalidatePath("/admin/students")`가 리디렉트 스텁을 가리킨다 — 표를 그리는 `/admin/users`는 아무도 무효화하지 않는다 | `admin/students/actions.ts:59·91·118` · `import/actions.ts:206` | `/admin/users`로 바꾸고 스텁 `page.tsx`에 그 사실을 적는다 |
| DL-31 | 출입증 오류 문구에 규격이 금지한 완충어(「~일 수 있습니다」)가 남아 있다. `src/` 전체에서 이 표현은 이 한 줄뿐 | `pass/actions.ts:45` | 원인을 단정하고 다음에 할 일만 남긴다 |
| DL-32 | `checkInviteAction`의 맨 `catch {`가 오류를 바인딩조차 안 하고 모든 실패를 「쓸 수 없는 가입코드입니다」로 진단한다. 같은 파일의 다음 액션 넷은 규약을 지킨다 | `register/actions.ts:102-107` | `catch (error)`로 받아 `RegistrationError`면 서비스 문구를, 아니면 로그 후 폴백 |
| DL-33 | `/scan`·`/change-password`·`/forbidden`에는 오류 경계가 없다. 정문 판독 화면이 Next 내장 500으로 덮이며 카메라 스트림이 사라진다 | `src/app/scan/actions.ts:33` · `src/app/error.tsx` 부재 | `src/app/error.tsx`를 두고, 판독은 결과 칸만 바꾸는 `scan/error.tsx`를 따로 둔다 |
| DL-34 | 초대·명단 액션 다섯도 같은 스텁 경로를 무효화한다 (DL-30의 나머지 범위) | `admin/invites/actions.ts:97·134·174·202` · `import/actions.ts:206` | 다섯 자리를 `/admin/users`로 바꾼다 |

#### F. 화면 규격과 표기 (19)

```
docs/design/2026-08-30-ui-refresh.md §2 —
  세그먼티드 = 늘 하나가 켜져 있고 **끌 수 없다**
  필터 칩   = 켜면 좁아지고 **끄면 다시 넓어진다**
```

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-35 | 마크다운 각주·문서 내부 링크가 `href` 없이 그려져 눌리지 않는다 (`remarkGfm`은 켜져 있다) | `markdown.tsx:130` | 검사에 프래그먼트를 더한다 — `/^(https?:\|mailto:\|#)/i` |
| DL-36 | 학생 대시보드의 「내 출입증」이 `startAt desc`+take 5라 지금 진행 중인 건을 밀어낸다 | `pass.repo.ts:134-153` | `asc`로 바꾼다 — 이 자리는 「지금·곧」을 답하는 위젯이다 |
| DL-37 | 대시보드가 출입증 기간을 손으로 다시 그린다. `passPeriod`는 유형으로 가르고 연도를 적는데 이쪽은 같은 날인지로 가르고 연도를 뺀다 | `app/(app)/page.tsx:132-138` ↔ `pass.labels.ts:76-86` | `passPeriod(pass)`를 쓰거나 짧은 변형을 `pass.labels`에 둔다 |
| DL-38 | 「분류별 분포」가 「건수 기준 상위 12개」라 적고 실제로는 종류를 먼저 정렬해 자르므로 잘리는 쪽이 언제나 벌점이다 | `charts.tsx:406-415` · `merit.chart.ts:146-150` | 자를 때는 건수로 다시 세우거나 문구를 실제 규칙대로 고친다 |
| DL-39 | 교사 폰의 하단 탭에서 「상벌점」과 「최근 부여」가 동시에 켜지고 `aria-current`도 둘이 붙는다. 사이드바는 최장 일치로 이미 풀었다 | `bottom-tab.tsx:16` · `nav.ts:213` ↔ `:225` | 최장 일치 규칙을 `nav.ts`의 함수 하나로 두고 둘이 함께 쓴다 |
| DL-40 | 감사로그의 「기간」 라벨이 `Segmented`의 `<div>`를 가리켜 아무 데도 안 붙고, 세그먼티드 그룹에 접근 가능한 이름이 없다 | `log-filters.tsx:57-60` · `segmented.tsx:17-31` | `role="group"` + `aria-labelledby`, 또는 `Segmented`가 `aria-label`을 갖게 한다 |
| DL-41 | 출입증 즉시 부여의 「확인 방법」 칸에 이름이 없다 — placeholder뿐이다. 같은 파일의 다른 칸은 전부 `Label htmlFor`로 묶여 있다 | `pass/issue-form.tsx:113-119` | `id` + `<Label htmlFor>`을 붙인다 |
| DL-42 | 로그인 화면이 금지된 클래스를 한자리에 모아 쓴다 — `font-extrabold` 3곳·`text-[11px]` 2곳·원시 hex·임의 `shadow-[...]`. `src` 전체에서 남은 유일한 파일 | `(auth)/auth-panel.tsx:14·17·46·50·51·54·71·72` | 토큰으로 되돌리거나, 시안 예외임을 파일 머리에 한 줄로 적는다 |
| DL-43 | 초대코드 발급의 학생/교사/학부모 전환이 필터 칩으로 그려져 있다 (끌 수 없는 것은 세그먼티드다) | `admin/invites/invite-form.tsx:29-54` | `Segmented` + `SegmentButton` |
| DL-44 | 학생 상세의 「상벌점/출입증/학생 정보」 갈래도 칩이다. 같은 구조인 통계·계정 관리 탭은 세그먼티드다 | `students/[studentId]/page.tsx:127-139` | `Segmented` + `SegmentLink` |
| DL-45 | 학생·학부모의 상벌점 화면만 `PageHeader`를 안 쓰고 머리글을 손으로 그린다 — 같은 주소가 역할에 따라 여백이 다르게 선다 | `merit/own-view.tsx:55-58` ↔ `admin-view.tsx:96` | `PageHeader`로 바꾼다 |
| DL-46 | 게시판 설정 폼이 카드 껍데기 토큰 짝을 손으로 적고 규격 밖 여백(`p-4`)을 쓴다 | `admin/community/community-form.tsx:175` | `cardClass("panel")`을 넘긴다 (`fieldset`도 문자열을 받는다) |
| DL-47 | 규정 화면의 뼈대만 카드 껍데기를 손으로 베꼈다. 다른 loading.tsx 열 곳은 전부 `cardClass()`를 부른다 | `merit/rules/loading.tsx:6` | `cardClass("panel")` |
| DL-48 | 커뮤니티 글 제목이 눈금에 없는 20px(`text-xl`)로 그려진다. `src` 전체에서 이 한 곳 | `community/[slug]/[postId]/page.tsx:51` | `text-title` |
| DL-49 | 확인서 화면은 상단바와 함께 `<h1>`이 둘이 된다. `print:hidden`은 종이에서만 겹침을 푼다 | `students/[studentId]/print/page.tsx:91` | `<h2>`로 내리거나 앱 셸 밖으로 옮긴다 |
| DL-50 | 판독 화면이 `Badge`의 기본 클래스를 `className`으로 덮는다. `cn()`은 tailwind-merge가 아니며, 그 사실을 `cn.ts` 주석이 규칙으로 적어 두었다 | `scan/verdict-card.tsx:20` · `cn.ts:3-9` | `Badge`에 크기 prop을 더하거나 바깥 요소에 크기를 준다 |
| DL-51 | 대시보드의 「최근 부여」만 아직 옛 주소(`/merit/students/…`)로 링크한다. 화면 안에서 이 주소를 가리키는 유일한 곳 | `app/(app)/page.tsx:211-216` | `/students/{id}?tab=merit` |
| DL-52 | 출입증 상세만 결재자·취소자 이름을 호칭 없이 맨으로 찍는다. 같은 파일의 신청·보호자 확인과 형제 화면 셋은 `honorificName`을 쓴다 | `pass/[passId]/page.tsx:104`, `:110` | 두 자리에 `honorificName`을 붙이되 취소자는 `cancellerRole(pass)`를 새로 두어 학생 철회를 「선생님」으로 부르지 않게 한다 |
| DL-53 | `animate-auth-in`만 `prefers-reduced-motion` 가드가 없다 (나머지 다섯은 전부 있다). 붙는 곳이 로그인·가입 화면 다섯 전부 | `globals.css:95-107` | 다른 다섯과 같은 `@utility` + 가드 형태로 옮긴다 |

#### G. 입력 경계와 결과 크기 (7)

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-54 | 전교 명단의 「전체 선택」이 100명 상한을 넘는 선택을 만든다 — 확인창 300줄까지 간 뒤에야 반드시 실패한다 | `merit/class-roster.tsx:148-152` | 선택 인원이 `BULK_AWARD_LIMIT`을 넘으면 버튼을 잠그고 몇 명까지인지 적는다 |
| DL-55 | 최근 부여 내보내기에 행수 상한이 없다. 필터를 비우면 그 트랙 전체가 한 응답으로 나가고 각 행이 학생의 모든 학년도 재적을 함께 싣는다 | `merit.repo.ts:843-852` · `award.service.ts:571-583` | 상한(예: 5,000행)을 두고 넘치면 조건을 좁히게 한다 |
| DL-56 | 표 편집의 학년·반·번호에 2^53을 넘는 정수를 넣으면 `.int()`에 한글 문구가 없어 zod 기본 영어가 한글 화면에 뜬다 | `enrollment.schema.ts:31-49` · `admin/students/actions.ts:48` | `.int()`에도 문구를 주고, 액션이 `issues[0].message`를 날것으로 흘리지 않게 한다 |
| DL-57 | 감사로그 검색칸에 상한이 없어 61자를 넣으면 객체 전체 파싱이 실패해 고른 기간·동작이 함께 기본값으로 되돌아간다. 오류는 한 줄도 안 뜬다 | `admin/logs/page.tsx:139-140` · `log-filters.tsx:92-99` | `maxLength`를 형제 화면과 맞추고, `pass/history/query.ts`의 필드별 파싱을 적용한다 |
| DL-58 | 확인 모달의 사유 칸이 500자를 받는데 호출부 대부분의 스키마 상한은 100~200자다. 상한을 알려 주는 유일한 장치가 거짓말을 한다 | `confirm-dialog.tsx:146-149` | `reasonMaxLength`를 필수 prop으로 올려 호출부가 자기 상한을 넘기게 한다 |
| DL-59 | 규정 화면의 검색어만 zod를 한 번도 안 거친다 (교사용 화면도 같다). 「검증은 경계에서 한 번만」에서 이 경계만 그 한 번이 없다 | `merit/rules/page.tsx:111` · `admin/merit/rules/page.tsx:57` | `recentAwardSearch`와 같은 모양의 `q` 스키마를 두고 입력칸에도 `maxLength`를 준다 |
| DL-60 | 출입증 내역 내보내기의 「기본 30일 창이 이미 막는다」는 주석이 거짓이다 — 시작일을 고르면 하한이 그 날짜가 되고 상한은 아예 없다 | `decision.service.ts:432-437` · `pass.schema.ts:252-263` | 행수 상한을 두거나 조회 창의 최대 길이를 강제하고, 주석을 실제 동작에 맞춘다 |

#### H. 스키마·인덱스·보존 (5)

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-61 | 커뮤니티 삭제자 열이 스키마에서 유일하게 외래키 없는 사용자 참조이고 이름 스냅샷도 없다. 읽는 코드도 없다 | `schema.prisma:657-660`, `:685-688` | 쓰지 않을 것이면 지우고, 남길 것이면 `@relation(onDelete: SetNull)` + `deletedByName`을 붙인다 |
| DL-62 | `CommunityAttachment`의 유일한 인덱스가 `uploaderUserId`로 시작해 `postId`만으로 찾는 두 질의(글 상세·글 수정)가 선두 열을 못 탄다 | `schema.prisma:724` · `community.repo.ts:283-292`, `:301-306` | `@@index([postId, createdAt])`를 더한다 |
| DL-63 | `VerificationCode`를 지우는 코드가 없어 계정이 없는 사람의 이메일·전화번호가 영구 보존된다. 「임시 데이터」라는 근거와 어긋나고 `@@index([expiresAt])`는 읽는 질의가 없다 | `schema.prisma:338-371` · `verification.repo.ts` | 만료·소진 행을 지우는 경로를 두거나(발송 경로가 자기 정리를 겸한다), 인덱스를 빼고 보존 정책을 문서에 적는다 |
| DL-64 | 출입증 전체 내역의 기본 조회(`startAt` 범위 + `startAt` 정렬)를 받는 인덱스가 없다. 학생 상세 탭은 인덱스를 타므로 개발 중 안 드러난다 | `schema.prisma:595-598` · `pass.repo.ts:569-586`, `:631-645` | `@@index([startAt(sort: Desc)])`를 더한다 |
| DL-65 | 초대 목록에 상한이 없어 발급된 모든 코드가 매번 브라우저까지 내려간다 — 행마다 코드 전문·등록 이름·**생년월일**까지 | `invite.repo.ts:35-58` · `panel.tsx:52-61`, `:166` | 서버 쪽 필터와 `skip`/`take`를 붙여 `findRecentAwardPage`와 같은 모양으로 맞춘다 |

#### I. 배포·설정·문서의 어긋남 (9)

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-66 | 통합 테스트가 개발 DB를 건드리는 것을 막는 검사가 문자열 완전일치 하나뿐이고, vitest의 integration 프로젝트에는 대조가 아예 없다 | `scripts/setup-test-db.sh:21` · `vitest.config.mts:77-79` | `playwright.env.ts:3-16`의 정규화 비교를 공유 모듈로 올려 셸과 vitest가 함께 쓴다 |
| DL-67 | `.env.example`이 `SMS_TEST_MODE="true"`를 배포하는데 compose 주석과 `deploy.md`는 비워 두라고 한다. 배포 첫 명령이 `cp .env.example .env`다 | `.env.example:43` ↔ `docker-compose.yml:99-105` ↔ `deploy.md:85` | 예제를 `""`로 바꾸고 세 문서가 같은 말을 하게 한다 |
| DL-68 | 복구 절차의 검증 쿼리가 존재하지 않는 테이블 이름을 쓴다 (`"User"` vs `@@map("user")`). 정상 복구된 DB에서도 즉시 실패한다 | `docs/deploy.md:353` · `schema.prisma:98` | `from "user"`로 고치고 소문자 테이블 넷을 한 줄로 적는다 |
| DL-69 | `deploy.md`가 앱 컨테이너 메모리를 512m이라 적지만 compose는 첨부 때문에 1g로 올렸다 | `docs/deploy.md:428` ↔ `docker-compose.yml:72-78` | 1g으로 고치고 근거를 한 줄 붙인다 |
| DL-70 | `tsconfig`가 `dev-local`을 제외하지 않아 로컬 워크트리 사본 740개가 typecheck 프로그램에 들어온다. lint는 근거와 함께 뺀다 | `tsconfig.json:33` ↔ `eslint.config.mjs:22-24` | exclude를 `["node_modules", "**/node_modules", "dev-local", ".playwright-mcp"]`로 넓힌다 |
| DL-71 | `.dockerignore`의 scripts 화이트리스트가 실제로는 `scripts/` 전체를 통과시킨다(`!scripts` 한 줄이 하위를 되살린다). 지금은 그 누수가 오히려 seed 절차를 살린다 | `.dockerignore:20-23` | 의도를 고르고 통일한다 — 전체를 보내기로 하면 세 줄을 지우고 근거를 적는다 |
| DL-72 | `overrides`가 `@prisma/config`의 정확 고정(`7.1.5`) 의존성을 메이저 하나 위(8.0.2)로 강제하는데 근거가 어디에도 없다 | `package.json:66-68` | 이유와 걷어낼 조건을 한 줄로 적거나, 걷고 `npm run verify`로 확인한다 |
| DL-73 | `start:standalone`·`start`는 `HOSTNAME`이 없으면 0.0.0.0에 묶는다. 루프백 규칙을 지키는 것은 compose의 포트 매핑뿐 | `scripts/start-standalone.mjs:9` · `package.json` | `process.env.HOSTNAME ??= "127.0.0.1"` 한 줄, `start`도 `--hostname 127.0.0.1` |
| DL-74 | 첨부 업로드 라우트 주석이 라우트 핸들러를 고른 근거로 512m을 드는데 그 1g는 이 경로 때문에 올라간 값이다 | `attachments/route.ts:12-13` | 1g으로 고치고 「그 1g가 이 경로 때문이다」를 덧붙인다 |

#### J. 테스트가 지키지 못하는 불변식 (9)

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-75 | 커뮤니티 첫 화면의 유일한 읽기 필터 `listReadableWithActivity`가 테스트 0건. 형제 `listReadable`에는 있다 | `board.service.ts:229-240` | `listReadable` describe 바로 아래에 같은 모양으로 붙인다 |
| DL-76 | 첨부 응답 CSP가 `next.config.ts`의 규칙 **순서** 하나에 의존하는데 그 순서를 지키는 테스트가 없다 | `next.config.ts:108-121` | `bodySizeLimit` 테스트와 같은 방식으로 두 규칙의 인덱스와 CSP 값을 단언한다 |
| DL-77 | 14개 화면의 첫 문인 `requirePermission`에 테스트가 하나도 없다 (재료인 `requireAuth`·`assertCan`은 각각 있다) | `core/auth/session.ts:75` | 실제 `RULES`를 태워 권한 없는 역할이 `/forbidden`으로 가고 `authz:denied`가 남는 것을 단언한다 |
| DL-78 | 정문 판독의 유일한 서버 진입점 `scanAction`이 무테스트이고 e2e도 `/scan`을 안 연다 | `app/scan/actions.ts:22` | `requireAuth` 순서·빈 코드·`ForbiddenError` 갈래 셋을 단언한다 |
| DL-79 | 커뮤니티 글·댓글 서버 액션 5개와 게시판 관리 액션 3개가 전부 무테스트 — 권한 거부 전용 문구 분기가 무방비 | `community/[slug]/actions.ts:37` · `admin/community/actions.ts` | 기존 `merit`·`admin/users` actions.test와 같은 틀로 액션당 세 줄씩 |
| DL-80 | `pass/actions.ts`의 액션 8개 중 7개가 무테스트. 목 선언이 `decision.service`를 빈 객체로 갈아 결재 계열을 부를 수조차 없다 | `pass/actions.ts:127` · `tests/app/(app)/pass/actions.test.ts` | 목을 실제 함수 셋으로 바꾸고 액션마다 조립 인자와 `MESSAGES` 매핑 두 줄 |
| DL-81 | 오류 코드 ↔ `MESSAGES` 대응을 지키는 테스트가 없다. 이미 죽은 키가 하나 있고(DL-29) 반대 방향(코드 추가 후 문구 누락)은 타입 검사도 못 잡는다 | `pass/actions.ts:32-47` · `pass.error.ts:5-6` | 코드 목록을 값으로 export하고 `can.test.ts`가 `RULES`↔`EXPECTED`를 대조하듯 양방향을 고정한다 |
| DL-82 | 커버리지 임계값이 정적이라 하강은 잡지만 상승을 고정하지 못한다 — 60%가 되어도 임계는 51에 머문다 | `vitest.config.mts:35-43` | 음수(허용 미커버 개수) 방식이나 `thresholds.autoUpdate`로 래칫을 만든다 |
| DL-83 | 학생증 서명 키가 `BETTER_AUTH_SECRET`에서 파생된다는 성질을 아무 테스트도 확인하지 않는다. 키를 소스 상수로 바꿔도 왕복은 맞아떨어진다 | `pass.token.ts:32-38` | 비밀키 A로 발급한 코드가 `resetModules` 뒤 비밀키 B에서 STALE임을, 그리고 미설정 시 던짐을 단언한다 |

#### K. 죽은 코드와 사실과 다른 주석 (11)

```ts
// icons.tsx:68 — 존재하지 않는 최상위 메뉴 줄을 설명한다
/**
 * QR 스캔 메뉴. 출입증(QrIcon)의 그림을 다시 쓰지 않는다 — 둘은 최상위 메뉴에서
 * 나란히 서므로 …
 */
```

| # | 결함 | 위치 | 권장 |
|---|---|---|---|
| DL-84 | `findOverlapping` 주석이 없는 인자(자기 자신 제외)를 약속한다. 수정 경로를 붙이는 사람이 그대로 부르면 항상 `OVERLAPPING_PASS`가 난다 | `pass.repo.ts:280-297` | 인자를 실제로 추가하거나 두 문장을 지운다 |
| DL-85 | 스키마 주석이 「외박은 KST 자정 눈금」이라 적지만 코드는 두 유형 모두 시각을 받는다. 정렬키 근거 주석도 같은 죽은 전제 위에 있다 | `schema.prisma:554` · `pass.repo.ts:623-624` | 둘 다 실제 동작대로 고친다 (결론은 그대로 둔다) |
| DL-86 | 「명단에서 빠진 뒤의 옛 코드다」라는 주석과 달리 `findStudentForCard`는 재적·소프트 삭제를 하나도 안 본다 (실제 우회는 없다) | `verify.service.ts:83-86` · `pass.repo.ts:101-110` | 주석을 「프로필 행 자체가 사라진 경우다. 재적은 여기서 보지 않는다」로 고친다 |
| DL-87 | 메뉴 주석이 「QR은 `/pass/{id}`에서 뜬다」고 적지만 그 화면에 QR이 없다. 상세 페이지는 정반대를 적는다 | `nav.ts:67-71` ↔ `pass/[passId]/page.tsx:51` | 「학생증 QR은 사람에 붙는다 — `/pass/qr`」로 고친다 |
| DL-88 | 계정 관리 탭이 세그먼티드로 바뀌었는데 주석 둘은 아직 `ChipLink`를 가리킨다. 다음 사람이 칩/세그먼티드 구분을 되돌리게 오도한다 | `admin/users/admin-tabs.tsx:12-21` · `unsaved.ts:8-9` | 둘을 `SegmentLink`로 고친다 |
| DL-89 | `kstHour`가 호출자 없이 남아 있고, 주석이 규격이 금지한 시각대별 인사말을 존재 근거로 적는다. 테스트가 둘 붙어 있어 미사용 검사에도 안 걸린다 | `lib/datetime.ts:213-217` | 함수와 두 테스트를 지운다. 남긴다면 주석에서 인사말 예시를 뺀다 |
| DL-90 | 세션 게이트 판정이 네 곳에 손으로 복제돼 있고, 그러라고 만든 `isLoginBlocked`는 호출자가 하나뿐이다 | `core/auth/login-eligibility.ts:5` · `api/pass/qr/route.ts:21` · `attachments/route.ts:84` · `[...attachment]/route.ts:27` · `scan/page.tsx:32` | 네 곳의 status·deletedAt 부분을 `isLoginBlocked(user)`로 바꾸고 `mustChangePassword`만 따로 붙인다 |
| DL-91 | `ScanIcon`·`InviteIcon`은 아무도 안 쓰고, `ScanIcon` 주석은 존재하지 않는 최상위 메뉴 줄을 설명한다 | `components/icons.tsx:68`, `:80` | 두 함수와 주석을 지운다 |
| DL-92 | `Rail()`과 `IDLE`이 사이드바·모바일 서랍에 글자 그대로 복제돼 있고, 그 주석의 「브랜드색이 나오는 유일한 자리」는 사실이 아니다 | `sidebar.tsx:24-35` · `mobile-nav.tsx:133-142` | 공용 모듈로 한 번만 두고 「유일한 자리」 문장을 뺀다 |
| DL-93 | `@deprecated`가 붙은 `upsertThreshold`가 호출자 없이 repo에 남아 있다. 형제 둘이 하는 `updatedAt` 대조를 건너뛰는 upsert다 | `merit.repo.ts:268-279` | 지운다 |
| DL-94 | `EXTRA_TITLES`의 `/scan` 줄은 도달할 수 없고 이름도 화면과 다르다(「QR 스캔」 vs 「학생증 확인」). 「제목 찾기는 여기 한 곳이 소유한다」가 사실이 아니다 | `nav.ts:177-184` ↔ `scan/page.tsx:13`, `:58` | 줄과 주석을 지우고 제목을 페이지가 소유한다고 적거나, 페이지가 이 값을 끌어오게 한다 |

---

## 4. 지난 감사와의 대조

지난 감사는 [`2026-08-31-codebase-audit.md`](2026-08-31-codebase-audit.md)이고 확정 53건
(높음 2 · 중간 26 · 낮음 25)이다. 그 확정분은 **아직 미처리**이므로, 이 문서의 항목과
겹치는 것은 「같은 결함을 다시 봤다」는 뜻이지 「고쳐졌다가 되살아났다」는 뜻이 아니다.

### 4.1 재확인 (지난 항목과 같은 결함, 27건)

| 이 문서 | 지난 감사 | 비고 |
|---|---|---|
| D-02 | C-03 | 전교 통계 모집단이 한 화면 안에서 갈린다 |
| D-03 | C-04 | 기준 초과 명단이 재적을 안 본다 |
| D-15 | C-24 | `getPassDetail` 소유권 분기 무테스트 |
| D-17 | C-26 | 첨부 라우트 둘 단위 테스트 0건 |
| D-18 | C-25 | 대시보드 게시판 횡단 목록 테스트 0건 |
| DL-01 | C-07 | **중간 → 낮음.** 도달 조건이 좁고(초안을 1시간 넘게 붙든다) 손실이 화면에 드러나며 재업로드로 복구된다는 것이 격하 근거 |
| DL-03 | L-12 | 파일 이름 길이 상한 부재 |
| DL-10 | C-08 | **중간 → 낮음.** 정상 왕복에서는 내보내기가 학생코드를 실어 주므로 교사의 수기 삭제가 전제이고, 옛 프로필의 기록은 보존된다 |
| DL-12 | C-13 | **중간 → 낮음.** 데이터 손실이 아니라 운영 정리 누락 |
| DL-19 | L-06 | 거부 감사로그 `targetId`가 사용자 id |
| DL-21 | L-10 | 미결 첨부 소유권 거부에 `authz:denied` 없음 |
| DL-22 | L-11 | 첨부 정리·롤백 삭제가 감사로그 없이 일어난다 |
| DL-23 | C-14 | **중간 → 낮음.** 유출 코드의 출처는 `Invite` 행 자체(`createdById`·`createdAt`)로 특정 가능하므로, 남는 것은 기록 규약의 비대칭 |
| DL-29 | L-25 | `PASS_NOT_ACTIVE` 死 키 |
| DL-42 | 지난 §5 | 로그인 껍데기의 규격 이탈. 지난 감사가 「의도인지 확인한다」로 사람에게 넘긴 것을 이번 감사는 위반으로 확정했다 — §6에 다시 올린다 |
| DL-43 · DL-44 | C-21 | 끌 수 없는 것을 칩으로 그린 곳 둘 |
| DL-45 | C-22 | `PageHeader`를 손으로 다시 그렸다 |
| DL-46 · DL-47 · DL-48 · DL-31 | 지난 §3.7 화면 낮음 묶음 | 손으로 적은 카드 껍데기·네 번째 여백 `p-4`·`text-xl`·문구 규칙 위반. 지난 감사가 묶음으로만 적은 것을 위치까지 확정했다 |
| DL-55 | L-09 | 최근 부여 내보내기에 행수 상한 없음 |
| DL-58 | L-02 | 사유 입력칸 상한이 서버 스키마보다 큼 |
| DL-66 | C-16 | **중간 → 낮음.** 기본 설정(`gbsw` / `gbsw_test`)을 따르면 닿지 않는다 |
| DL-67 · DL-69 · DL-74 | 지난 §5 | `SMS_TEST_MODE` 기본값, `mem_limit` 기준이 둘. 지난 감사가 「사람이 할 일」로 올린 것을 이번에 위치별로 확정했다 |
| DL-72 | C-17 | **중간 → 낮음.** 지금 깨진 것이 없고 근거 부재가 결함의 전부 |
| DL-73 | C-15 | **중간 → 낮음.** 도커를 거치지 않는 실행이 정규 배포 절차가 아니다 |
| DL-78 · DL-79 · DL-80 | C-27 | 서버액션 커버리지 구멍. 지난 감사가 16개로 센 것을 세 항목으로 갈랐다 |
| DL-82 | 지난 §3.7 테스트 낮음 묶음 | 커버리지 래칫 부재 |
| DL-84 | L-05 | 없는 인자를 설명하는 주석. 지난 감사가 「주석이 코드와 반대인 곳 셋」으로만 적고 나머지 둘의 위치를 밝히지 않아, DL-85·DL-86이 그 셋에 포함되는지는 대조할 수 없었다 |

**등급이 내려간 것은 일곱이다**(C-07·C-08·C-13·C-14·C-15·C-16·C-17). 전부 「사실관계는
맞으나 도달 조건이 좁거나 실제 피해가 서술보다 작다」는 이유이며, 결함 자체가 사라진 것은
하나도 없다.

### 4.2 신규 (지난 감사에 없던 것, 84건)

높음 D-01과 중간 12건(D-04·D-05·D-06·D-07·D-08·D-09·D-10·D-11·D-12·D-13·D-14·D-16),
낮음 71건이 새로 나왔다. 새로 보인 이유는 갈래가 셋이다.

- **관심사 축이 모듈 경계를 가로질렀다.** 지난 감사는 영역별로만 읽었다. D-08(서버 액션 열
  곳의 오류 삼킴)·DL-16(`findCurrentYearForUpdate` 여섯 복제)·DL-25(`Authz` 라벨 부재)·
  DL-90(세션 게이트 네 곳 복제)은 한 모듈만 보면 「한 군데의 사소한 일」로 보이고, 전 저장소를
  같은 질문으로 훑을 때만 규격 균열로 드러난다.
- **설정과 코드를 함께 실행해 봤다.** D-01은 `docker compose config`를 실제로 돌려 `${VAR:-}`가
  빈 문자열을 만든다는 것을 눈으로 본 뒤에야 나왔다. DL-70의 740개도 `npx tsc --listFilesOnly`를
  돌려 센 값이다.
- **화면과 서비스를 한 줄로 이었다.** D-04(첨부 영구 삭제)는 `post-form.tsx`가 칸을 안 그린다는
  사실과 `post.service.ts`가 빈 배열을 「전부 빼기」로 읽는다는 사실이 만나야 성립한다.
  두 파일이 서로 다른 담당에게 갔던 지난 감사에서는 각각 정상으로 보였다.

지난 감사가 §4에서 「정상으로 확인한 것」으로 적은 항목들과 겹치되 **층이 다른** 둘은 오해를
막기 위해 여기 밝혀 둔다. **DL-35**(마크다운 각주 링크가 안 눌린다)는 지난 감사의 「마크다운은
`rehype-raw`가 없고 프로토콜이 좁혀져 있다」와 충돌하지 않는다 — 그쪽은 살균기 스키마의
보안 판정이고, 이쪽은 그 아래 컴포넌트의 정규식이 프래그먼트까지 함께 버린다는 표시 결함이다.
**DL-76**(첨부 CSP 순서 테스트 부재)도 「첨부 CSP가 전역 규칙 뒤에 와서 실제로 이긴다」와
충돌하지 않는다 — 동작은 지난 감사 말대로 옳고, 그 옳음이 설정 파일의 배열 순서 하나에 얹혀
있는데 지키는 테스트가 없다는 것이 이번 지적이다. **DL-15~DL-17**(잠금 예산·확인 위치)도
지난 §4의 「부여 한 건마다 `FOR UPDATE` — 조치 불필요」와 다른 이야기다. 그쪽은 잠금 **범위**를
정당하다고 판정했고, 이쪽은 그 잠금을 기다리는 쪽의 **시간 예산과 검사 위치**를 본다.

### 4.3 상충 (3건)

#### 상충 1 · 「호칭 규율 완전」 — 지난 감사가 틀렸다

지난 감사 §4는 정상으로 확인한 것 목록에 **「호칭 규율 완전」**을 적었다. 이번 DL-52가 그것을
뒤집었고, 코드를 직접 열어 판정했다.

```tsx
// src/app/(app)/pass/[passId]/page.tsx — 같은 화면 안에서 갈린다
:89   value={`${honorificName(pass.requestedByName, requesterRole(pass))} · …`}
:96   ? honorificName(pass.consentedByName, consenterRole(pass))
:104  value={`${pass.decidedByName ?? "—"} · …`}        // ← 맨 이름
:110  value={`${pass.cancelledByName ?? "—"} · …`}      // ← 맨 이름
```

같은 값을 그리는 형제 화면 셋은 전부 호칭을 붙인다 — `pass/history/page.tsx:290-291`,
`students/[studentId]/pass-tab.tsx:221-222`, `merit/recent/page.tsx:171-172`가 모두
`honorificName(…, "ADMIN")`이다. `grep`으로 `decidedByName`·`cancelledByName`을 그리는 자리를
전수로 확인했고, 호칭이 빠진 곳은 `pass/[passId]/page.tsx` 하나뿐이다.

**판정: 지난 감사의 「완전」이 틀렸다.** CLAUDE.md가 「이름을 맨으로 그리는 화면을 새로 만들지
않는다 — `honorificName(name, role)` 하나가 정한다」로 못 박은 규율에 예외가 하나 있다.
학생·학부모가 자기 출입증 상세를 열면 교사 이름이 호칭 없이 뜨고, 같은 교사가 출입증 내역
표에서는 「이정민 선생님」으로 읽힌다. 심각도는 표기 일관성이라 낮음이다.

#### 상충 2 · `User.deletedAt` 복합 — 둘 다 맞다. 경로가 다르다

지난 감사의 가장 무거운 항목 C-01(높음)은 「명단에서 빠진 학생은 상벌점을 못 받는다」는
방어선이 비어 있다고 판정했다. 이번 감사의 DL-07(낮음)은 「명단에서 빠진 학생은 행째로
지워지므로 남는 것은 죽은 UI 분기뿐」이라 판정했다. **이 문서만 읽으면 C-01이 낮음으로
격하된 것처럼 읽힌다. 그렇지 않다.** 코드를 열어 확인한 결과는 이렇다.

```ts
// roster.repo.ts:192 — 파일에서 줄이 사라진 학생: 행째로 물리 삭제
await tx.user.deleteMany({ where: { id: { in: deleteUserIds } } });

// roster.repo.ts:239-256 — 파일에 줄은 있고 학적만 바뀐 학생: 살아남는다
const inactive = changed.filter((r) => r.status !== "ENROLLED").map(…);
await tx.user.updateMany({
  where: { id: { in: ids } },
  data: { status: "INACTIVE", deletedAt: null, updatedAt: revisionStamp },
});
```
```ts
// merit.repo.ts:415-421 — 게이트는 deletedAt만 본다
where: { id, user: { deletedAt: null } },
```

**둘은 서로 다른 제거 경로를 말한다.** DL-07이 다루는 것은 **파일에서 줄을 지운** 학생이고,
그 학생은 정말 사라진다. C-01이 다루는 것은 **파일에 「퇴학」·「전학」으로 남아 있는** 학생이고,
그 학생은 `status: "INACTIVE"` · `deletedAt: null`로 살아남아 `findAwardableStudent`의
`deletedAt: null` 게이트를 그대로 통과한다. `src/` 전체를 다시 grep해 확인했다 —
`User.deletedAt`에 non-null을 쓰는 코드는 **여전히 하나도 없다**(`community.repo.ts`의 둘은
`CommunityPost`·`CommunityComment`다).

**판정: C-01은 유효하며 높음 그대로다.** 이 문서의 DL-07은 그 옆 경로의 잔재를 짚은 것이고
C-01을 대체하거나 격하하지 않는다. 이번 감사의 D-03(= 지난 C-04)이 같은 전제 위에서 독립적으로
확정된 것도 C-01의 근거를 보강한다. 두 문서를 함께 읽는 사람은 **경로를 먼저 갈라야 한다** —
「퇴학·전학(살아남음, 게이트 무력)」과 「파일에서 삭제(사라짐, UI 분기 죽음)」는 같은 이름으로
불리지만 다른 문제다.

#### 상충 3 · 지난 L-14가 사실상 정리 메모로 내려간다

지난 감사는 L-14로 「로그인·가입 페이지의 세션 게이트가 `requireAuth`와 어긋난다(`deletedAt`) —
C-01의 날 루프」를 확정했다. 이번 감사에서 같은 주장이 올라왔고 **기각됐다**(§5-1). 기각 근거는
상충 2에서 확인한 것과 같은 사실이다 — `User.deletedAt`에 값을 넣는 코드가 없고, 설령 옛 배포의
legacy 행이 남아 있어도 `isLoginBlocked`가 `status`와 `deletedAt`을 독립적으로 보아 세션 발급
자체를 막으므로 순환에 필요한 「살아 있는 세션 + `deletedAt`」 조합이 만들어지지 않는다.
`roster.repo.ts:238`도 상태를 바꿀 때마다 legacy 표시를 지운다.

**판정: 판정이 두 곳에서 갈려 있다는 L-14의 사실은 맞고, 「리다이렉트 루프가 된다」는 결과는
현재 코드로 도달 불가능하다.** L-14는 결함이 아니라 **정리 대상 메모**로 다루는 것이 옳다.
다만 C-01을 고치는 방향이 「`deletedAt`을 실제로 채운다」쪽으로 정해지면 그 순간 L-14가 다시
결함이 되므로, C-01의 처리 방향을 정할 때 함께 결정해야 한다.

---

## 5. 검증에서 기각된 것 중 기록할 값이 있는 것

기각은 2건뿐이다. 둘 다 「인용은 정확한데 실패 시나리오에 도달할 수 없다」는 이유이며, 다음
감사가 같은 자리를 다시 파지 않도록 근거를 남긴다.

**5-1 · `/login`·`/register`가 `status`만 보고 `deletedAt`을 안 본다** (`login/page.tsx:26`)
인용은 정확하다 — `login/page.tsx:23-25`와 `register/page.tsx:19-20`은 `status`만, `session.ts:56`은
둘을 함께 본다. 그러나 `src` 전체에서 `User.deletedAt`에 값을 넣는 문장이 하나도 없고,
`deleteUserPermanently`는 소프트가 아니라 완전 삭제다. legacy 행이 남아 있어도
`core/auth/login-eligibility.ts`의 `isLoginBlocked`가 두 값을 독립적으로 보아 sign-in 훅에서
세션 발급 자체를 막으므로 순환에 필요한 조합이 생기지 않는다. **지난 감사가 L-14로 확정한
항목이며, 이 기각이 그것을 정리 메모로 내린다**(§4.3 상충 3).

**5-2 · 로그인 라우트가 `x-forwarded-host`를 검증 없이 오리진 후보로 받는다** (`login/submit/route.ts:23`)
실패 시나리오에 피해자가 없다. 브라우저는 교차 출처 폼 POST에 `X-Forwarded-Host`를 붙일 수
없고(안전목록 밖 → 프리플라이트, 이 라우트에 `OPTIONS` 핸들러 없음), 그 헤더가 없으면 공격
도메인이 expected 후보에 아예 들어가지 않아 403이다. 헤더 둘을 모두 붙일 수 있는 것은 `curl`
같은 자기 자신을 공격하는 클라이언트뿐이고, 그때 나가는 303은 그 요청자에게만 간다.
**다음 감사가 이 자리를 다시 볼 조건:** 이 라우트에 `OPTIONS` 핸들러가 생기거나, 프록시 앞에
헤더를 정리하지 않는 계층이 한 겹 더 붙는 날.

---

## 6. 사람이 정해야 할 것

코드로 답이 정해지지 않고 방침을 골라야 하는 것들이다. 전부 이 문서의 확정 항목에서 나왔다.

- **`User.deletedAt` 복합의 처리 방향을 하나로 정한다** (§4.3 상충 2 · DL-07 · D-03 · 지난 C-01).
  갈래는 둘이다. ① **물리 삭제를 유지**하고 `includeRemoved`·`removedAt`·「삭제됨」 배지·
  「명단 제외일」·`merit-tab` 안내를 함께 걷어낸 뒤, 부여 게이트를 `status: "ACTIVE"` 또는 그
  학년도 `ENROLLED`로 바꾼다. ② **`deletedAt`을 실제로 채우도록 되돌리고** 다섯 화면을 살린다.
  ①을 고르면 지난 L-14는 영원히 정리 메모로 남고, ②를 고르면 L-14가 그날 결함이 된다.
  **어느 쪽이든 「퇴학·전학 학생에게 상벌점을 줄 수 있는가」에 먼저 답해야 한다** — 지금 코드의
  답은 「줄 수 있다」이고 화면은 「줄 수 없다」고 적혀 있다.
- **익명 게시판의 이미지 첨부를 어떻게 할지 정한다** (D-11). 벗기는 처리를 넣을 것인가,
  익명 게시판에서 이미지 형식을 아예 받지 않을 것인가, 아니면 감수하고 글쓰기 화면에
  「사진에는 촬영 위치가 남을 수 있습니다」를 적을 것인가. 대상이 미성년자의 거주 위치라
  기술 선택 이전에 방침이 필요하다.
- **`VerificationCode`의 보존 정책을 정한다** (DL-63). 지금은 계정이 만들어지지 않은 사람의
  이메일·전화번호가 영구 보존된다. CLAUDE.md는 이 테이블을 「임시 데이터」라 부르고 그것을
  감사로그 예외의 근거로 삼았으므로, 보존 기간을 정하거나 그 근거 문장을 고쳐야 한다.
  README의 「다음에 검토할 만한 것」에 있는 감사로그 IP 보존 기간과 같은 자리에서 함께 정한다.
- **IP당 인증 한도를 재조정한다** (D-14). 신입생을 컴퓨터실에서 한 번에 가입시킬 것인지가
  운영 방식의 문제다. 그렇게 할 것이라면 20은 시간당 10명이라 부족하고, 그렇게 하지 않을
  것이라면 지금 값이 맞으니 주석의 「교내망에서 여러 학생이 동시에 가입」을 지운다.
- **`CommunityPost.deletedByUserId`·`deletedReason` 두 열의 존폐를 정한다** (DL-61). 읽는 코드가
  하나도 없고 외래키도 이름 스냅샷도 없다. 「누가 왜 지웠나」를 감사로그로만 되짚기로 하면
  지우고, 열로 남기기로 하면 다른 열과 같은 규약(`@relation(onDelete: SetNull)` + 이름 스냅샷)에
  맞춘다.
- **`SMS_TEST_MODE`의 기본값을 정한다** (DL-67). `.env.example`·`docker-compose.yml`·
  `docs/deploy.md` 셋이 서로 다른 말을 한다. 실제 발송을 다시 켜는 날 가장 먼저 밟는 자리다.
  지난 감사도 같은 것을 사람에게 올렸고 아직 정해지지 않았다.
- **로그인 껍데기의 규격 이탈이 예외인지 결정한다** (DL-42). `src` 전체에서 `font-extrabold`와
  임의 글자크기가 남은 유일한 파일이고, 규격 문서는 「한 곳도 남지 않아야 한다」고 단정한다.
  예외라면 파일 머리에 한 줄로 적고, 아니라면 토큰으로 되돌린다. 이것도 지난 감사가 올린 뒤
  그대로 남아 있다 — 정하지 않으면 감사마다 다시 올라온다.
