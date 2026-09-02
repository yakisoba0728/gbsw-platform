# 단순화·보안 조사 — 2026-09-01

> **이 문서는 검사 시점의 스냅샷이다.** 코드는 한 줄도 고치지 않았다.
> 직전 감사([`2026-09-01-vertical-full-read.md`](2026-09-01-vertical-full-read.md))가 「무엇이 틀렸나」를 봤다면
> 이 조사는 **「무엇을 지울 수 있고 어떻게 더 단순해지나」**를 봤다.
> 여기서 나온 제안을 순서로 엮은 것은 [`../superpowers/plans/2026-09-01-implementation-plan.md`](../superpowers/plans/2026-09-01-implementation-plan.md)의 **Phase B**다.

기준선: `main @ 5860e90`

## 1. 범위와 방법

일곱 축으로 나눠 조사하고, 축마다 검증자를 따로 붙였다. 에이전트 15개(조사 7 · 검증 7 · 종합 1).

| 축 | 무엇을 봤나 |
|---|---|
| 삭제 | 안 쓰는 export 132개 후보(기계로 미리 뽑음) · 안 던지는 오류 코드 · 도달 불가 분기 · 실사용 0곳 토큰 · 안 쓰는 의존성 · 아무 일도 안 하는 설정 줄 |
| DB | 마이그레이션 21개를 하나로 접는 안 · 아무도 안 읽는 컬럼 · 인덱스 41개의 실사용 · 합칠 수 있는 모델 · 소프트/하드 삭제 |
| 보안 | 권한 표 전수 대조 · IDOR · 세션 무효화 · 업로드 · 주입 · 헤더 · 비밀 유출 · 속도 제한 · `npm audit` |
| 복잡성 ×3 | 상벌점·출입증 / 커뮤니티·명단·계정 / core·lib·UI·화면 계층 |
| 테스트 | 33,527줄에서 중복·과도한 목·픽스처 반복 |

**검증이 이 라운드의 핵심이다.** 단순화 제안이 가장 흔하게 틀리는 방식은 **주석에 적힌 결정을 못 보고 지우는 것**이라, 제안마다 셋을 확인하게 했다.

1. **정말 아무도 안 쓰나** — 문자열 키 사전(`MESSAGES`·`METADATA_FORMATTERS`·라벨표), Next App Router 규약 파일, CSS 클래스, 테스트 전용 같은 **동적 참조까지** 본다.
2. **그 자리의 주석·`CLAUDE.md`가 이유를 적어 뒀나** — 적혀 있으면 원칙적으로 기각. 그 이유의 전제가 무너진 경우만 예외이고, 무엇이 무너졌는지 적게 했다.
3. **권한·감사로그·정합성·보안 성질을 잃지 않나.**

애매하면 기각 쪽으로 기울게 했다 — 안 지운 코드는 나중에 지울 수 있지만 잘못 지운 결정은 되돌리기 어렵다.
실험(지우고 스위트 돌려 보기)은 원복하게 했고, 워크플로가 끝난 뒤 `git status`가 깨끗한 것을 확인했다.

## 2. 결과 요약

| | 수 |
|---|---:|
| 제안 | 70 |
| 채택 | 13 |
| 조건부 | 41 |
| **기각** | **16** |
| 예상 줄 증감 | **-879** |

위험별: 안전 28 · 테스트필요 20 · 동작변화 6 · 종류별: 삭제 23 · 보안 12 · 통합 7 · 단순화 6 · 스키마 3 · 경계 2 · 테스트 1

### 이 조사의 주된 결과는 「이 저장소에 죽은 살이 적다」는 것이다

**안전하게 지울 수 있는 것이 약 880줄뿐이다.** 76,582줄(운영+테스트) 중 1.1%다. 왜 그런지가 이 문서의 값이다.

- **제안 70건 중 16건이 「주석에 이유가 적혀 있어서」 죽었다.** 지우자고 한 것들이 실은 결정이었다 — `User.deletedAt`의 열거된 독자 넷, 인증 발송기의 「다시 켤 때를 위해 보존한다」, 초안 저장의 난수 접미사, 출입증 만료의 `clock_timestamp` 순서, Better Auth 접근제어 표의 자리.
- **살아남은 54건 중 35건이 여전히 문서화된 결정을 건드린다.** 그래서 판정이 「채택」 13건에 「조건부」 41건이다 — 대부분 「함께 해야 할 것」이 붙는다.
- **확인했는데 아무것도 안 나온 곳이 많다.** 의존성 30개는 전부 실제로 import되고, `npm audit` 취약점 0건, raw SQL 15자리 전부 태그드 템플릿, 오류 코드↔`MESSAGES` 여덟 갈래 전수 대조에서 죽은 코드 하나, `@theme` 토큰 50개 중 죽은 것 넷.
- **가장 큰 삭제안(벤더 Prisma 문서 10,860줄)은 기각됐다** — 「저장소 코드가 참조하지 않는다」가 「아무도 안 쓴다」가 아니기 때문이다. 그 문서는 이 저장소에서 일하는 에이전트 도구가 실제로 읽는다.

**대신 이 프로그램은 순수한 빼기가 아니다.** 보안 축이 낸 일곱 건은 전부 **덧셈**(약 +104줄)이고, 그것이 이 조사에서 위험을 실제로 줄이는 유일한 부분이다.

**줄 수는 구현 전 추정치다.** 검증자가 다시 세어 고친 값이지만, 프로그램의 6·7단계는 포기 조건을 함께 달고 있어 실현되는 수는 이보다 작을 수 있다.

### 진짜 이득은 줄이 아니라 개념이다

- `SchoolClass` 테이블 하나가 사라지면 `upsert` 블록 넷과 조인 15곳이 함께 사라진다
- 메뉴 나무 두 벌 → 한 벌, 앱 오류 화면 셋 → 하나, 「오류→문구」 껍데기 여섯 벌 → 한 벌
- 세션 픽스처를 고칠 자리 28곳 → 1곳, core 목을 고칠 자리 29곳 → 1곳
- 다섯 문서가 경고하는 「`migrate dev`가 인덱스를 DROP한다」가 사실이 아님이 확인돼 경고 다섯 줄이 사실 한 줄로 준다

## 3. 축별로 본 것

### 삭제 — 운영 코드·설정·의존성　<sub>제안 22 → 채택·조건부 19 / 기각 3 · -259줄</sub>

「지울 수 있는 것 전부」 축에서 본 것은 셋으로 갈린다. 첫째는 **진짜 죽은 코드**로, 기계 후보 132개를 (자기 파일 안 등장 횟수, 저장소 전체 등장 횟수, 타입/값)으로 분류해 보니 대부분은 export 키워드만 군더더기이고 코드는 살아 있었으며(줄이 줄지 않아 제안하지 않았다), 실제로 지울 수 있는 것은 아이콘 셋·datetime 함수 셋·upsertThreshold·타입 별칭 넷처럼 좁았다 — 후보 목록의 `src/proxy.ts`는 Next 16의 미들웨어 후속 규약 파일이라 거짓 양성이다(node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md로 확인). 둘째는 **살아 있는 척하는 코드**로, 이쪽이 훨씬 크고 위험하다: 던져지지 않는 오류 코드가 표에 남아 「이 목록이 전부다」라는 선언을 거짓으로 만들고, 늘 참인 필터가 「여기서 거른다」는 보호가 있는 것처럼 보이며, 전역 headers()에 덮이는 CSP 옆에 정반대로 적힌 주석이 붙어 있다. 셋째는 **꺼져 있는 기능**이다 — 인증코드 발송·대조 경로 약 900줄이 통째로 도달 불가 상태로 남아 있고(requestVerification이 늘 verified:true를 돌려줘 인증번호 입력칸이 렌더되지 않는다), 저장소 추적 파일의 16%가 코드가 참조하지 않는 벤더 Prisma 문서다. 이 둘만으로 전체 감소분의 96%다. **확인했지만 아무것도 안 나온 곳도 적어 둔다** — 의존성 30개는 전부 실제로 import된다(`@prisma/client`는 src/generated 경유, `pretendard`는 layout.tsx의 CSS import, `@tailwindcss/postcss`는 postcss.config로 산다). 오류 코드↔MESSAGES 양방향 대조는 여덟 갈래 전수에서 PASS_NOT_ACTIVE 하나만 걸렸다. @theme 토큰 50개 전수 사용 조사에서 죽은 것은 네 줄뿐이다. check-standalone.mjs의 민감 확장자 목록과 .dockerignore의 거부 목록은 지금 어긋난 데가 없다(둘을 한 파일로 모으는 방법은 형식이 달라 없다). 직전 감사의 죽은코드 44건 중 `YearState.ok`(roster-1-C07)는 일부러 뺐다 — 고치는 방향이 「지우기」가 아니라 「읽기」이므로 이 축의 제안이 아니다. **총 -12,267줄이지만 성격이 다르다**: 10,860줄은 벤더 마크다운(dead-15)이라 추적만 끊으면 되고, 나머지 약 1,400줄이 운영 코드와 테스트다. 그중 dead-13(-930)과 dead-08(-149)은 문서화된 결정을 건드리므로 사용자가 먼저 정해야 하고, 나머지 열아홉 건(약 -330줄)은 판단이 필요 없다.

### DB — 스키마·마이그레이션　<sub>제안 7 → 채택·조건부 5 / 기각 2 · -86줄</sub>

이 저장소의 DB는 "복잡해서" 큰 게 아니라 **역사가 스키마 옆에 그대로 남아 있어서** 크다. 물리 인덱스는 비-PK 41개(선언 40 + 부분 인덱스 1)로 세었고, 마이그레이션 21개 729줄은 지금의 20모델을 만드는 데 필요한 535줄보다 200줄 가까이 길다 — 차이는 전부 TeacherProfile·StudentProfile.classId·MeritAward.batchId처럼 이미 없어진 것들을 만들었다 지우는 왕복이다. 실사용 배포가 없으므로 그 왕복은 지금 접을 수 있고, 마이그레이션 전량 적용 DB와 `--from-empty` init.sql 적용 DB를 pg_indexes·pg_constraint로 대조해 **DDL이 완전히 일치**함을 확인했다(차이는 손으로 적은 부분 유니크 인덱스와 `_prisma_migrations`뿐). 두 번째 무게는 **문서화된 공포**다 — CLAUDE.md·README·deploy.md·schema 주석·repo 주석 다섯 곳이 「다음 `migrate dev`가 `AcademicYear_single_current`를 DROP할 수 있다」고 경고하는데, Prisma 7.9.1에서 섀도 DB로 직접 확인한 결과 `migrate diff`는 그 인덱스를 아예 보지 않아 빈 마이그레이션을 냈고, 같은 테이블에 컬럼을 추가한 스키마로 강제해도 `ALTER TABLE` 한 줄만 나왔으며, `git log -S`로 보니 그 DROP 줄은 21개 마이그레이션 어디에도 실제로 생긴 적이 없다. 셋째는 **모델 하나가 값 두 개 때문에 산다** — `SchoolClass`는 (year, grade, classNo) 말고 아무것도 담지 않는데, 그것 하나 때문에 네 곳의 upsert 블록과 명단 반영의 배치 루프, `Restrict` 온델리트 논쟁, 인덱스 둘이 존재한다. 넷째는 **사람 참조 규약의 구멍**이다 — 스키마는 「계정이 지워져도 누가 했는지 남긴다」를 SetNull + 이름 스냅샷으로 스무 곳에서 지키는데 `Invite.createdById`만 `Restrict`라, 교사 계정을 지우려면 그가 발급한 초대를 먼저 지워야 하고 그래서 `admin-user.repo.deletePermanently`가 **다른 학생의 아직 안 쓴 PENDING 코드까지 조용히 없앤다.** 다섯째는 **소프트 삭제가 반만 있다** — `User.deletedAt`은 채우는 코드가 저장소에 하나도 없는데(명단에서 빠진 학생은 행째 지운다) 읽는 자리가 네 갈래로 살아 있어, 늘 참인 조건 열대여섯 개가 「보호되고 있다」처럼 읽힌다. 커뮤니티의 `deletedAt`은 다른 개념(글 삭제 표시)이고 실제로 읽히므로 그대로 둔다. **제안하지 않기로 한 것**도 적는다: `AcademicYear` 제거는 그 행들의 `FOR UPDATE`가 학년도 전환·명단 반영·상벌점 부여를 직렬화하는 **전역 앵커**라 단순화가 아니라 잠금 재설계다; `VerificationCode` 모델은 「다시 켤 때를 위해 보존한다」는 문서화된 결정이라 안 쓰는 인덱스만 걷는다; Better Auth 소유 컬럼(Account 토큰 5개·`banned`/`banExpires`·`Verification` 모델)은 admin 플러그인이 세션 검증에서 읽으므로 손대지 않는다 — User에서 **학교 몫은 phone·status·mustChangePassword·deletedAt 넷뿐이고 `role`은 admin 플러그인 것**이다; `ParentStudent`는 `parents: { some }`로 다대일이 실제 질의되고 형제 등록 여지를 없애므로 스칼라화하지 않는다; `MeritThreshold.updatedByUserId`가 쓰기 전용인 것은 스냅샷 쌍의 FK 절반이라 정상이다. 마지막으로 이 축 밖의 긴장 하나만 적어 둔다 — 스키마는 **행위자**를 영구 보존하려고 SetNull+스냅샷을 스무 번 쓰면서 **대상**은 `MeritAward.studentProfile onDelete: Cascade`로 통째 파괴한다(명단에서 빠진 학생의 상벌점이 함께 사라진다). 문서화된 「오등록 정리」 결정이고 동작 변경이라 제안으로 올리지 않는다.

### 보안　<sub>제안 7 → 채택·조건부 7 / 기각 0 · 105줄</sub>

보안 축에서 본 것은 「구멍이 뚫려 있다」가 아니라 **「지키는 규약이 몇 자리에서만 안 지켜진다」**다. 권한 표(`can.ts`)의 액션 24개를 부르는 서비스 함수를 전수 대조했더니, `assertCan`이 필요한 자리에서 그것을 안 부르는 함수는 `getMyStudentQr` 하나뿐이었다(sec-03) — 읽기 경로까지 포함해 나머지는 전부 서비스 첫 줄에서 막는다. IDOR도 마찬가지로 좁다: 세션에서 유도할 수 있는 식별자를 인자로 받는 자리가 없고(`getMyMerit`·`createParentInvite`·`getMyStudentQr`가 전부 세션→프로필로 간다), `attachToPost`는 `uploaderUserId`+`postId: null`을 함께 걸어 남의 첨부를 못 붙이며, 커뮤니티는 글·댓글·첨부 어느 쪽으로 들어와도 `board.service`의 문 둘(`getReadableBySlug`·`getWritableBySlug`)을 다시 지난다. 역할 상승 경로도 닫혀 있다 — `updateUserSchema`에 `role`이 없고, Better Auth admin 플러그인의 mutation은 `[...all]` 화이트리스트가 전부 404로 떨어뜨린다. 그래서 이 축의 제안 일곱 중 다섯이 **권한이 아니라 기록**에 관한 것이다: 세션이 생기고 사라지는 순간(sec-01·05·06), 개인정보가 통째로 나가는 순간(sec-07), 유일하게 시도 가능한 IDOR이 막히는 순간(sec-04)이 감사로그에 안 남는다. 감사로그를 시각으로 대조하는 것이 익명 게시판 추적의 유일한 수단이라고 스스로 못 박은 시스템에서 그 기록의 빈칸이 곧 이 축의 위험이다. 나머지 둘 중 sec-02는 성격이 다르다 — 감사로그의 IP가 **클라이언트가 지어 보낼 수 있는 헤더의 첫 항목**을 그대로 믿고, 그 값이 진짜인 유일한 근거가 운영자의 프록시 설정인데, 배포 문서 자신이 「Caddy는 덧붙인다, 2026-08-27에 위조 헤더가 첫 항목으로 들어오는 것을 눈으로 봤다」고 적어 두었다. 같은 프로세스 안의 Better Auth는 같은 헤더를 항목이 둘 이상이면 아예 안 믿는데 이쪽만 믿는다.

**검증했고 깨끗한 것**을 그대로 적는다. raw SQL 15자리 전부 태그드 템플릿이고 `$queryRawUnsafe`·`$executeRawUnsafe`는 저장소에 없다. `npm audit` 취약점 0건. 응답 헤더 겹침 순서는 실측했다 — Next가 쓰는 path-to-regexp로 `/api/community/attachments/:id*`가 `/<id>/<파일이름>`까지 매치하는 것을 node로 확인했으므로, 첨부 응답에 전역 CSP가 아니라 `default-src 'none'; sandbox`가 실제로 선다. `sanitize-standalone`·`check-standalone`은 `npm run build` 스크립트에 묶여 있고 Dockerfile builder가 그 스크립트를 돌린 뒤 산출물만 runner로 복사하므로, `.env`가 이미지로 넘어가는 경로가 실제로 닫혀 있다. `NEXT_PUBLIC_` 변수는 하나도 없고 `BETTER_AUTH_SECRET`을 읽는 세 모듈(`pass.token`·`pass-flash`·`roster.preview-token`) 중 클라이언트 컴포넌트가 임포트하는 것은 없다(`scan/scanner.tsx`가 무는 `pass.url`은 공개 주소만 읽는다). 토큰 엔트로피도 충분하다 — 학생증 HMAC 96비트에 20초 창, 부트스트랩 256비트·1회성·메모리 전용, 초대코드 39.6비트에 2차 요소 5회 제한, storageKey 128비트. 업로드는 순서가 옳다(권한 → 동시 3건 → 상한까지만 본문 수집 → 확장자로 형식 판정 → EXIF 제거 실패 시 거절). 세션 무효화도 전부 확인했다: 비밀번호 변경·초기화·계정 중지는 같은 트랜잭션에서 `session.deleteMany`를 돌리고, 완전 삭제는 Session의 `onDelete: Cascade`가 받는다.

**감사로그의 IP는 무기한 보존된다** — 삭제·정리 경로가 코드에도 마이그레이션에도 없고 스키마 주석이 「감사로그는 삭제 경로가 없어 단조 증가한다」고 스스로 적는다. 보관 기간 정책이 필요해지는 날 함께 볼 자리다. **제안으로 내지 않은 관찰 넷**: ① `/login/submit`이 `x-forwarded-host`·`x-forwarded-proto`를 오리진 후보에 넣지만, 브라우저 폼은 그 헤더를 못 붙이고 fetch로 붙이면 프리플라이트가 먼저 걸려 CSRF 경로가 서지 않는다 — 확인하고 기각했다. ② `checkInvite`는 로그인 없이 부를 수 있고 횟수 제한도 기록도 없는 오라클이지만, 코드 공간이 31^8≈8.5×10^11이고 2차 요소가 5회로 잠기며, 추측마다 감사로그를 남기면 그쪽이 감사 테이블 범람이라는 더 나쁜 문을 연다. ③ `/scan?c=<코드>`는 코드를 쿼리에 실어 프록시 접근로그에 남는다 — 20~40초짜리 값이라 재사용은 무의미하지만 `studentProfileId`와 시각이 감사 체계 밖에 영구히 쌓이는 이동 기록이 된다. 고치려면 판정 뒤 `?c=`를 털고 결과를 짧은 서명 쿠키로 옮겨야 해서(이미 `pass-flash`가 그 모양이다) 한 커밋을 넘고, 위험도 운영자의 로그 설정에 달려 있어 관찰로만 적는다. ④ 글에 붙은 첨부에는 용량 상한도 글쓰기 속도 제한도 없어 한 계정이 볼륨을 채울 수 있는데, 이것은 설계 문서가 이미 이름을 붙여 미룬 것이다(2026-08-28-community-design.md:396 「그쪽은 글이 남으므로 교사가 보고 지울 수 있다는 것이 지금의 답이고, 용량 관리는 「다시 열어야 할 때」 목록에 있다」). 같은 이유로 verification 모듈의 감사로그 예외, 실제 발송이 없는 상태와 `emailVerified` 하드코딩, CSP의 `unsafe-inline`, 익명 게시판의 감사로그 추적성, `merit:threshold` 읽기 무권한, `pass:verify`를 학생·학부모에게 여는 것, GIF의 EXIF 미제거는 전부 문서화된 결정이라 제안에서 뺐다. `Permissions-Policy` 헤더가 없는 것은 사실이나 `frame-ancestors 'none'`과 iframe 부재로 실질 이득이 카메라 권한 한 줄뿐이라 채우지 않았다.

### 복잡성 — 상벌점·전자출입증　<sub>제안 9 → 채택·조건부 6 / 기각 3 · -151줄</sub>

merit.repo.ts 1,306줄을 크게 만드는 것은 질의 수가 아니라 **같은 조건을 아홉 번 다시 조립하는 일**이다 — `track + status:\"ACTIVE\" + 학년도 삼항`이 열한 번, 모집단 술어(그 학년도 재적)가 세 벌로 나타난다. 트랙(SCHOOL/DORM)과 종류(MERIT/DEMERIT/OFFSET)는 걱정과 달리 `core/authz/merit-track.ts` 한 곳에 잘 모여 있다(KIND_BUCKETS가 Record라 종류가 늘면 타입 검사가 먼저 깨진다). 흩어져 있는 것은 **학년도 셋**이다 — `year`(반 편성)·`totalsYear`(합계 범위)·`rosterYear`(모집단)이 여덟 집계 시그니처를 각각 통과하고, 그중 studentScope의 「인자가 없으면 조건도 없다」 갈래는 운영 호출부가 이미 사라져 죽은 채 위험만 남았다. 반별 요약(classSummaries)과 반 명단(listClassRoster)은 같은 재적 술어와 같은 groupBy를 두 번 적은 것이고, topRules와 ruleStats는 글자 그대로 같은 질의이며 「규정의 현재 이름으로 바꾼다」는 규칙이 repo와 서비스 양쪽에 각각 구현돼 있다. 서비스 넷(rule·award·stats·threshold)의 경계 자체는 옳다 — stats.service가 663줄인 이유는 책임이 섞여서가 아니라 화면 넷(개요·순위·교사별·규정별)이 각자 접기 규칙을 갖기 때문이고, 그 분할은 주석이 근거를 대고 있다. 화면 쪽의 진짜 중복은 **점수 네 열**이다: 상점·벌점·상쇄·순점수 열 묶음이 여섯 표에 손으로 다시 그려지면서 상쇄 칸의 색과 상점 칸의 굵기가 표마다 갈렸다. 출입증은 결이 다르다 — 순수 조각 다섯의 쪼갬은 값을 한다(특히 pass.qr.ts는 `server-only`라 uqr이 클라이언트 번들에 새지 않고, tokenFromScanUrl은 브라우저에서 돌아야 해서 pass.url.ts와 갈라져 있어야 한다). 신청·결재 서비스가 같은 전이를 각자 검사한다는 의심도 실제로는 근거가 약하다: 둘 다 조건부 갱신 하나로 끝내고 사전 검사는 한 줄뿐이다. 출입증에서 무게를 지우는 자리는 둘이다 — 화면 배너 하나를 위해 미들웨어 한 층과 HMAC·nonce·시계 오차까지 세워 둔 플래시 쿠키, 그리고 형제 함수가 Prisma 한 줄로 하는 일을 80줄 원시 SQL로 하는 transitionUnexpired(그 함수가 지키겠다고 적어 둔 「앱 시각을 믿지 않는다」는 규칙은 만료 기준 인자를 한 번도 쓰지 않아 이미 절반만 성립한다). KST·UTC를 오가는 자리는 걱정보다 깨끗하다 — pass.window는 lib/datetime의 KST 함수만 쓰고, 두 시계가 섞이는 유일한 곳이 바로 그 원시 SQL이다.

### 복잡성 — 커뮤니티·명단·계정　<sub>제안 13 → 채택·조건부 9 / 기각 4 · 120줄</sub>

이 축에서 가장 크게 걷어낼 것은 커뮤니티가 아니라 **인증 모듈**이다 — requestVerification이 늘 `{verified:true}`를 돌려주는 탓에 화면의 인증번호 입력칸이 뜨는 길이 없고, 그 아래로 confirmCode·requestCode·알리고 연동·발송기·목업까지 1,000줄 가까이가 도달 불가인 채 남아 있다. 그래서 「지우는 안(01)」과 「켜는 안(02)」을 배타적인 두 제안으로 냈고, 아래 합계는 01을 고른 경우다. **명단 흐름**은 단계가 넷(파싱 → 계획 → 미리보기 봉인 → 확정)인데 복잡한 것은 단계 수가 아니라 확정 쪽 검사 아홉 개이며, 그중 삭제 대상 집합 대조는 HMAC 봉인과 명단 지문이 이미 증명한 것을 한 번 더 묻느라 통과할 수밖에 없다(04). 같은 흐름에서 미리보기·확정이 내보내기 전용 열을 얻으려고 전교 Enrollment를 학년도 잠금 안에서 훑고 있고, 늘 false인 `deleted` 필터까지 달고 있다(05). roster.parse.ts 601줄 중 325줄이 손수 짠 ZIP preflight인데 **뺄 수 없다는 것이 이 라운드의 답이다** — 압축 해제 상한을 강제하면서 파서(read-excel-file)가 같은 엔트리를 보게 보증하는 코드가 그것뿐이고, 유일한 지렛대인 「xlsx 업로드 포기」는 내보내기가 xlsx라 왕복을 깨므로 권하지 않는다. **커뮤니티 첨부의 상태는 넷**(내 미결 · 주인 없는 미결 · 붙음 · 뗌)이고 이 중 설계가 아니라 부작용인 것은 「주인 없는 미결」 하나다 — 나머지 셋은 계정별 용량 상한과 GC의 손잡이라 유지하는 편이 맞고, 대신 그 청소가 남의 파일을 아무 기록 없이 지우는 구멍을 닫는다(10). 첨부에서 실제로 접히는 것은 생명주기가 아니라 글 수정의 kept 산수로, repo 조건 한 줄을 넓히면 「이 모듈에서 가장 미묘한 산수」가 통째로 사라진다(07). **부정 결론 셋을 분명히 적는다**: community.access.ts의 can() 예외는 전제(게시판마다 다르고 교사가 화면에서 바꾸는 행 데이터)가 그대로라 접지 않고, community.view.ts는 이미 유일한 관문이며(app/ 어디서도 community.repo를 import하지 않는다) 타입으로 더 조이면 줄이 늘 뿐이고, 초대·가입·계정 셋의 경계는 겹치는 자리가 registration→verification 호출 하나뿐이라 합칠 것이 없다. 소프트 삭제와 하드 삭제가 섞이는 자리는 하나로 좁혀진다 — `User.deletedAt`은 값이 채워진 적이 없어 읽기 열여섯 곳과 오류 코드 하나가 전부 헛돌고, 커뮤니티의 `deletedByUserId`·`deletedReason`은 쓰기만 되고 읽히지 않는다(03·06).

### 복잡성 — core·lib·UI·화면 계층　<sub>제안 8 → 채택·조건부 7 / 기각 1 · -308줄</sub>

이 축에서 본 것은 src/core(1,072줄) · src/lib(723줄) · src/components(공용 UI 28개 + 앱 셸) · src/app(20,570줄, 178파일)이다. 핵심은 하나다 — **이 저장소가 복잡한 이유는 추상화가 모자라서가 아니라 같은 규칙이 여러 벌 복사돼 있어서다.** 서버 액션 스물다섯 개 중 여섯이 「오류를 화면 문구로 옮기는」 12줄을 글자까지 똑같이 갖고 있고(합계 100줄), sidebar.tsx와 mobile-nav.tsx는 504줄 중 250줄이 서로의 복사본이며, pass/error.tsx와 merit/error.tsx는 `diff`가 세 덩어리만 내는 쌍둥이다. 복사본은 이미 갈라지기 시작했다 — 같은 오류 처리가 어떤 파일에서는 폴백을 함수 안에 박고 어떤 파일에서는 인자로 받으며, 표 뼈대의 행 높이가 화면마다 h-6과 h-8로 나뉘고, 세 오류 화면이 카드 유무·정렬·콘솔 기록까지 셋으로 갈렸다. 반대로 **주석이 이유를 적어 둔 자리는 대체로 옳았다**: 세 겹 세션 게이트는 각각 다른 것을 막고(발급 차단 · 검증과 삽입 사이의 비밀번호 경쟁 · 이미 나간 쿠키), generate-invite-code.ts가 invite-code.ts에서 갈라진 것은 클라이언트 컴포넌트에 node:crypto를 들이지 않기 위해서이며(M15), 서랍이 사이드바와 달리 펼친 채 뜨는 것도 실제 사고를 겪고 정한 값이다 — 전부 보존 대상이라 제안에 넣지 않았거나 prop으로 옮기는 선에서 멈췄다. 함께 검토하고 **접지 않기로 한 것**도 적어 둔다: PageHeader가 세 곳뿐인 것은 나머지 화면의 제목을 상단바 <h1>이 갖기 때문이라 규격 이탈이 아니고, 초안·미저장 표시 세 파일(student-table-drafts · unsaved · post-draft)은 행 오버라이드 · 모듈 스코프 불리언 · sessionStorage 난수 규약으로 기전 자체가 달라 하나로 못 모으며, AcademicYearError를 잡는 스무 곳은 잡은 뒤 하는 일이 제각각(JSX 반환 · 플래그 세우기 · null · 부분 화면)이라 공통 헬퍼로 접으면 이득이 20줄 남짓이라 접지 않았고, action-state.ts 여덟 벌도 ConfirmDialogState 계약처럼 문서화된 결합이 붙어 있어 제네릭으로 묶으면 줄이 줄지 않는다. loading.tsx 열여섯 개는 이미 Skeleton 조각들을 공유하고 있어 「화면에서 뼈대를 유도한다」는 마법이 될 뿐이라, 표 뼈대 세 곳이 규격을 벗어난 것만 좁게 제안했다. 마지막으로 남는 작은 어긋남 하나를 기록해 둔다 — PASS_FLASH 쿠키의 secure 값을 pass/actions.ts는 x-forwarded-proto로, proxy.ts는 nextUrl.protocol로 각각 따로 정한다. 지우기가 커밋 하나 크기가 안 돼 제안으로 올리지 않았지만 같은 쿠키의 규격이 둘로 갈린 자리다. 제안 여덟 건을 다 적용하면 이 축에서 517줄이 줄고, 그중 288줄은 「없어져야 개념이 하나 사라지는」 삭제다.

### 테스트 층　<sub>제안 4 → 채택·조건부 1 / 기각 3 · -300줄</sub>

테스트 33,527줄(운영 코드의 78%)을 통독한 결과, 살은 단언이 아니라 준비 코드에 붙어 있다. 단위 테스트 141개 파일의 첫 describe 앞 서두만 6,199줄(단위 스위트의 약 19%)이고, beforeEach/beforeAll 블록이 1,726줄, 통합 테스트의 prisma 픽스처·정리 블록이 857줄이다. 반면 정확히 같은 것을 두 번 확인하는 it()은 저장소 전체에 두 쌍 10줄뿐이고(한 쌍은 제목에 「회귀 방지」라고 의도를 적어 둔 것), 단위↔통합 겹침도 표본(merit 일괄부여)으로 대조해 보니 실질적으로 없다 — 단위는 인자 모양과 상한을, 통합은 실제 SQL과 경합을 본다. 그래서 커버리지를 지우자는 제안은 하나도 없다. tests/에는 공용 헬퍼 파일이 하나도 없어서, 세션 사용자 픽스처가 28개 파일에 327줄로 복제돼 있고, recordAudit·txClient·withTransaction 목이 29개 파일에 117줄, repo 목의 함수 이름이 24개 그룹에서 두 번씩(선언 한 번, 팩토리 목록 한 번) 227개 적혀 있으며, 통합 테스트마다 「학생 하나 만들고 뒷정리한다」가 다섯 벌 따로 구현돼 있다. 이 복제는 낭비가 아니라 결함 생산기다 — 직전 감사의 pass-3-R10(decision.service 목 절반이 그 서비스가 부르지 않는 함수이고, 실제로 부르는 둘은 목에 없다)과 merit-4-C02(고정 접미사 id를 리셋되지 않는 테스트 DB에 쓴다)가 모두 「손으로 벤 목록이 원본과 갈라진 자리」다. 직전 감사가 이 층에 낸 119건은 「단언을 더 붙여라」이고 이 축은 「준비 코드를 지워라」인데, 둘은 충돌하지 않는다 — 살이 붙은 곳이 서로 다르고, 공용 헬퍼가 생기면 그 119건이 요구하는 단언을 붙이는 값이 오히려 싸진다. 아래 네 제안은 모두 기계적이고 각각 한 커밋이며, 합쳐서 준비 코드 1,244줄을 지우면서 목 표면이 실제 모듈과 갈라지는 결함 두 종류를 함께 닫는다.

---

## 4. 채택·조건부 54건

### 삭제 — 운영 코드·설정·의존성 (19건)

#### dead-02 · 운영 호출부가 없는 datetime 함수 셋(formatKstDay·formatTimeInput·kstHour)과 전용 Intl 포맷터·테스트를 지운다

**조건부** · 삭제 · 위험 안전 · **-87줄**

`src/lib/datetime.ts` · `tests/lib/datetime.test.ts` · `tests/lib/datetime.timezone.test.ts`

datetime.ts에서 dayLabel 포맷터(104-109)+formatKstDay(111-114), timeInput 포맷터(178-183)+formatTimeInput(185-191), kstHour(213-225)를 지운다(공백 포함 41줄). 딸린 테스트도 함께 — datetime.test.ts의 kstHour·formatTimeInput describe 블록과 import 두 줄(29줄), datetime.timezone.test.ts의 formatKstDay·formatTimeInput·kstHour probe 항목 셋(17줄).

**왜:** 셋 다 src/ 안에 호출부가 없고 테스트만 부른다. 게다가 주석이 존재하지 않는 근거를 든다 — kstHour 주석은 「시간대에 따라 달라지는 화면」을 근거로 삼는데 CLAUDE.md가 시각대별 인사말을 금지했고 greetingFor는 이미 지워졌다. timezone.test.ts:127의 주석도 지워진 greetingFor를 그대로 가리킨다. 테스트만 있는 함수는 서버 시간대 회귀를 지키는 척하면서 실제로는 아무 화면도 지키지 않는다.

**조건:** (1) datetime.ts:98 formatMonthDay 주석이 formatKstDay를 근거로 들고 있으므로 함께 고친다 — 안 고치면 없는 함수를 가리키는 주석이 새로 생긴다. (2) tests/lib/datetime.timezone.test.ts는 「probe 표가 실제 export 목록을 덮는가」를 스스로 대조하므로 export와 probe를 반드시 같은 커밋에서 지운다.

> **문서화된 결정을 건드린다** — kstHour 주석의 「시간대에 따라 달라지는 화면」 근거 — CLAUDE.md 「화면이 사람에게 말을 걸지 않는다」가 그 화면을 금지한 뒤로 낡았다
>
> 검증: formatKstDay·formatTimeInput·kstHour 전수 grep 결과 src/ 안 호출부 0, 테스트만 부른다. kstHour 주석의 「시간대에 따라 달라지는 화면」과 timezone.test.ts:126의 greetingFor 언급 둘 다 전제가 무너졌다 — greetingFor는 저장소에 없고(grep 0건) CLAUDE.md 「화면이 사람에게 말을 걸지 않는다」가 그 화면을 금지했다. 시간대 회귀 방어는 남는 12개 probe가 계속 지킨다.

---

#### dead-01 · 쓰는 화면이 하나도 없는 아이콘 셋(ScanIcon·InviteIcon·SettingsIcon)을 지우고 SlidersIcon 주석을 사실에 맞춘다

**조건부** · 삭제 · 위험 안전 · **-38줄**

`src/components/icons.tsx`

icons.tsx의 ScanIcon(주석 포함 62-79행)·InviteIcon(80-89행)·SettingsIcon(110-118행)을 통째로 지운다. SlidersIcon 위 주석(119-123행)이 「톱니바퀴(SettingsIcon)를 다시 쓰지 않는다」로 존재하지 않는 화면을 근거로 대므로, 실제 이유(설정 메뉴와 사용자 관리가 나란히 선다)로 네 줄로 줄여 다시 쓴다.

**왜:** 15개 아이콘 중 이 셋만 저장소 어디에서도 참조되지 않는다. 죽은 아이콘이 남으면 새 화면을 만드는 사람이 「이미 있는 것부터 찾는다」 규칙을 따를 때 후보 목록이 부풀고, 주석이 존재하지 않는 화면을 근거로 대기 시작하면 다음 사람이 그 화면을 찾다가 시간을 버린다.

**조건:** SlidersIcon 주석을 다시 쓸 때 「사용자 관리가 톱니바퀴를 쓴다」류의 거짓 근거를 재생산하지 않는다 — ADMIN_NAV_ITEMS의 「계정 관리」는 UsersIcon(사람)을 쓰므로 그런 화면은 없다. 근거를 확인할 수 없으면 주석을 다시 쓰지 말고 지운다.

---

#### dead-03 · merit.repo·threshold.service의 죽은 함수·흡수되는 조건·안 읽는 select를 정리한다

**조건부** · 삭제 · 위험 안전 · **-20줄**

`src/modules/merit/merit.repo.ts` · `src/modules/merit/threshold.service.ts`

(1) `upsertThreshold`(266-278행, @deprecated 주석 포함 13줄)를 지운다 — 호출부가 하나도 없다. (2) `isThresholdCreateConflict`(233-239)의 첫 조건 `isUniqueViolation(error, "track")`은 두 번째 조건(P2002 전부)에 완전히 흡수되므로 함수를 P2002 검사 한 줄로 줄인다(-5). (3) `findUserNames`(1094)의 select에서 아무도 안 읽는 `email`을 뺀다. (4) `listThresholdSettings`(73)의 `rows.filter(row => isMeritTrack(row.track))`을 지운다(+ 쓸모없어진 import).

**왜:** upsertThreshold는 스스로 @deprecated를 달고 「createThreshold/updateThreshold를 쓰라」고 적어 두었는데 그 뒤에도 지워지지 않아, 개정 검사(updatedAt 낙관적 잠금)를 우회하는 쓰기 경로가 repo에 남아 있다. isThresholdCreateConflict의 첫 조건은 읽는 사람에게 「컬럼별로 가른다」고 말하지만 실제로는 아무것도 가르지 않는다. isMeritTrack 필터는 걸러 낸 행이 어차피 MERIT_TRACKS로만 조회되므로 결과가 같다 — 거르는 척하는 코드다.

**조건:** isThresholdCreateConflict를 줄일 때 `typeof error === "object" && error !== null` 가드를 유지한다 — code 비교만 남기면 null/원시값 오류에서 터진다. 네 항목은 성격이 달라 커밋을 나누되, 한 커밋에 묶을 경우 upsertThreshold 삭제가 다른 세 항목의 리뷰에 묻히지 않게 한다.

---

#### dead-19 · 대상이 사라진 테스트 주석·존재하지 않는 파일 참조·중복 테스트·부르지 않는 함수의 목을 정리한다

**조건부** · 테스트 · 위험 테스트필요 · **-20줄**

`tests/app/(app)/merit/actions.test.ts` · `tests/integration/merit.bulk-award.integration.test.ts` · `tests/modules/enrollment/roster.service.test.ts` · `tests/modules/pass/decision.service.test.ts` · `tests/modules/merit/award.service.test.ts` · `tests/modules/registration/registration.repo.test.ts`

(1) merit/actions.test.ts:89의 지워진 cancel-batch-button 픽스처를 설명하는 고아 JSDoc을 지운다. (2) merit.bulk-award 통합 테스트:268이 근거로 드는 존재하지 않는 파일 `components/merit/recent-feed.ts` 언급을 지운다. (3) roster.service.test.ts:747 부근의 같은 호출·같은 단언 중복 테스트 두 쌍 중 하나씩을 지운다. (4) decision.service.test.ts:83의 repo 목 중 그 서비스가 부르지 않는 함수들을 지운다. (5) award.service.test.ts:150의 엉뚱한 목 위에 붙은 주석과 622의 스키마에 없는 occurredOn 픽스처 키를 지운다. (6) registration.repo.test.ts:230의 운영에서 도달할 수 없는 학생코드 재시도 분기 테스트를 지운다.

**왜:** 테스트 33,527줄이 운영 43,055줄의 78%다. 그 안에 지워진 코드를 설명하는 주석·존재하지 않는 파일을 근거로 드는 단언·같은 것을 두 번 확인하는 쌍이 섞이면, 테스트를 읽어 사양을 파악하려는 다음 사람이 없는 코드를 찾아 나선다. 부르지 않는 함수의 목은 특히 나쁘다 — 서비스가 실제로 무엇을 부르는지를 목 목록으로 읽을 수 없게 만든다.

**조건:** 여섯 항목을 그대로 묶어서는 안 된다. (a) registration.repo.test.ts:224 이하의 학생코드 재시도 테스트는 삭제 대상에서 뺀다 — 그 분기는 registration.repo.ts:186-193에 실제로 살아 있고(STUDENT_CODE_RETRIES 루프), 롤백 후 트랜잭션 전체 재실행·초대코드 1회 소진이라는 틀리기 쉬운 성질을 그 테스트만 지킨다. 감사 auth-3-R04에도 「도달할 수 없다」는 논증이 없다. (b) roster.service.test.ts:747 부근의 「중복 쌍」은 확인되지 않았다(741·748 두 건은 삭제 건수 1 대 0으로 다르다) — 어느 쌍인지 특정하기 전에는 뺀다. (c) merit.bulk-award 통합 테스트:266-270은 언급을 지우지 말고 실재 파일 `src/app/(app)/merit/recent/page.tsx`를 가리키게 고친다 — 「입력 시각으로 한 번의 부여를 알아낸다」는 사실은 지금도 …

---

#### dead-06 · 호출부가 없는 UI prop 셋(SectionCard.headerAlign·Select.rows·Badge의 read·unread)을 지워 컴포넌트 분기를 줄인다

**채택** · 삭제 · 위험 안전 · **-18줄**

`src/components/ui/section-card.tsx` · `src/components/ui/select.tsx` · `src/components/ui/badge.tsx`

(1) SectionCard의 `headerAlign`(15·31-32·87행)을 지우고 머리글 클래스를 `items-center` 고정 문자열로 되돌린다. (2) Select의 `rows` prop과 목록형 갈래(9-11·15·20-21·25·26-31행)를 지운다 — className이 `cn(fieldClass(size), "field-chevron")` 한 줄이 되고 `fieldBase` import도 빠진다. (3) BadgeTone에서 `read`·`unread`(10-11행)와 TONES의 두 항목(23-24행), WITH_DOT의 `unread`를 지운다.

**왜:** 셋 다 저장소 전체에 호출부가 없다. Select는 특히 rows 유무로 클래스 계산이 통째로 갈리는데 목록형 쪽은 한 번도 렌더된 적이 없어, 「고르는 칸」이 실제로는 한 가지 모양뿐인데 코드는 두 가지인 척한다. Badge의 read/unread는 게시판 읽음 표시를 하려다 만 잔재로 보이며, 남아 있으면 다음 사람이 「읽음 배지 규격이 이미 있다」고 믿고 쓰기 시작한다.

---

#### dead-17 · 조회 단계에서 이미 걸러져 늘 false인 ExistingStudent.deleted와 그것으로 아무도 못 거르는 내보내기 필터를 지운다

**채택** · 삭제 · 위험 안전 · **-14줄**

`src/modules/enrollment/roster.repo.ts` · `src/modules/enrollment/roster.plan.ts` · `src/modules/enrollment/roster.service.ts` · `tests/modules/enrollment/roster.plan.test.ts` · `tests/modules/enrollment/roster.repo.listExisting.test.ts`

roster.repo.ts:81의 `deleted: p.user.deletedAt !== null`과 select의 `deletedAt: true`(44행), roster.plan.ts:25-26의 `deleted?: boolean` 필드와 주석, roster.service.ts:117-118의 주석과 `.filter((s) => !s.deleted)`를 지운다. 딸린 테스트도 함께 — roster.plan.test.ts의 「예전 deletedAt 표시가 남아 있는 입력」 describe(약 8줄)와 listExisting 테스트의 `deleted` 단언.

**왜:** repo의 where가 39행에서 이미 `user: { deletedAt: null }`로 거르므로 81행의 `deleted`는 어떤 행에서도 true가 될 수 없고, exportRoster의 필터는 한 건도 걸러 내지 못한다. 주석까지 「legacy deletedAt 표시가 남은 계정은 listExisting()에서 이미 빠진다」고 스스로 그 사실을 적어 놓고 필터를 남겨 둔 상태다. 늘 참인 필터는 「여기서 소프트 삭제를 거른다」는 보호가 있다고 읽히지만 실제 보호는 39행 한 곳에 있다.

> **문서화된 결정을 건드린다** — roster.plan.ts:25의 「예전 deletedAt 표시. 새 명단 삭제 경로는 이 값을 만들지 않는다」 — 주석이 이미 죽은 값임을 인정하고 있다
>
> 검증: roster.repo.ts:39의 where가 `user: { role: "STUDENT", deletedAt: null }`이므로 81행의 `deleted`는 어떤 행에서도 true가 될 수 없고, roster.service.ts:118의 필터는 한 건도 걸러 내지 못한다 — repo 주석과 service 주석이 스스로 그 사실을 적어 두었다(「새 명단 삭제 경로는 이 값을 만들지 않는다」·「listExisting()에서 이미 빠진다」). 잃는 것이 없음을 확인했다: 진짜 보호인 where 절은 tests/modules/enrollment/roster.repo.listExisting.test.ts:45-54가 「WHERE에 deletedAt: null을 넣는다」로 직접 못 박고 있어, 나중에 where가 …

---

#### dead-09 · 선언만 있고 파일 안에서도 밖에서도 쓰이지 않는 타입 별칭 넷을 지운다

**조건부** · 삭제 · 위험 안전 · **-10줄**

`src/modules/community/community.repo.ts` · `src/modules/invites/invite.schema.ts` · `src/modules/pass/pass.schema.ts`

`PostWithCounts`(community.repo.ts:146), `StudentInviteMeta`·`NamedInviteMeta`(invite.schema.ts:106-107), `VerifyCodeInput`(pass.schema.ts:159) 네 줄을 지운다.

**왜:** 기계 후보 132개 중 「선언 줄 말고는 자기 파일 안에서도 등장하지 않는」 타입은 이 넷뿐이다(나머지는 파일 안에서 실제로 쓰이거나 테스트가 쓴다). 쓰이지 않는 `z.infer` 별칭은 스키마를 고칠 때 함께 고쳐야 하는 것처럼 보여 손이 한 번 더 가고, 실제로는 아무 데도 안 닿는다.

**조건:** community.repo.ts:146의 PostWithCounts를 지울 때 바로 위 JSDoc(140-145)을 함께 처리한다 — 선언 한 줄만 지우면 그 6줄이 아래 countPosts에 붙어 「댓글 수까지 붙은 조회 결과」라는 엉뚱한 설명이 된다. community.view.ts의 PostRow와 이름을 가르라는 취지를 남기려면 listPosts 위로 옮긴다.

---

#### dead-04 · 던져지지 않는 PASS_NOT_ACTIVE와 쓰이지 않는 transitionUnexpired의 _observedAt 인자를 지운다

**조건부** · 삭제 · 위험 안전 · **-8줄**

`src/modules/pass/pass.error.ts` · `src/app/(app)/pass/actions.ts` · `src/modules/pass/pass.repo.ts` · `src/modules/pass/request.service.ts` · `src/modules/pass/decision.service.ts`

(1) pass.error.ts:23의 오류표에서 `PASS_NOT_ACTIVE` 줄과 pass/actions.ts:46의 MESSAGES 항목을 지운다. (2) `transitionUnexpired(passId, from, _observedAt, data, db)`의 셋째 인자를 없애고 호출부(request.service·decision.service)와 테스트 목의 인자도 함께 줄인다.

**왜:** 오류 코드↔MESSAGES 두 방향 대조를 전수로 돌린 결과 던져지지 않는 코드는 PASS_NOT_ACTIVE 하나뿐이다. 오류표는 스스로 「이 모듈이 쓰는 코드는 아래가 전부다」라고 선언하므로, 없는 코드가 표에 있으면 그 선언이 거짓이 되고 다음 사람이 「어디서 던지지?」를 찾게 된다. _observedAt은 이름 앞의 밑줄과 함수 안 주석이 「서비스가 읽은 now를 만료 기준으로 믿지 않는다」고 이미 설명하는데, 인자로 남아 있으면 호출부는 그 값이 쓰인다고 읽는다.

**조건:** _observedAt 제거 시 제안이 파일 목록에서 빠뜨린 통합 테스트 두 호출부(tests/integration/pass.flow.integration.test.ts:329·370)와 위치 인덱스를 쓰는 단언(tests/modules/pass/decision.service.test.ts:218의 `mock.calls[0]?.[3]` → `[2]`)까지 같은 커밋에서 고친다 — 통합 테스트는 verify:unit에 안 들어가 놓치면 `npm run verify`에서만 터진다.

> **문서화된 결정을 건드린다** — pass.repo.ts의 transitionUnexpired 내부 주석 「서비스가 읽은 now는 오류 메시지와 감사 시각을 결정할 뿐, UPDATE의 만료 기준으로 믿지 않는다」 — 인자를 지우는 것은 이 결정을 되돌리는 것이 아니라 서명에 반영하는 것이다
>
> 검증: PassError 전수 추출 결과 PASS_NOT_ACTIVE를 던지는 곳이 없다(decision·request·pass.window의 new PassError 전부 확인). 남은 두 참조는 pass.error.ts:23의 표와 actions.ts:46의 MESSAGES뿐이라 표가 스스로 선언한 「이 모듈이 쓰는 코드는 아래가 전부」가 거짓인 상태다. _observedAt은 pass.repo.ts:476-479 주석이 「서비스가 읽은 now를 UPDATE 만료 기준으로 믿지 않는다」고 적은 것과 정확히 일치하는 방향의 변경이며, 인자를 빼면 같은 파일의 transition(419)과 서명이 대칭이 된다. 잠금(SELECT … 별도 문장)·clock_timestamp 판정은 그대로다.

---

#### dead-10 · 채워지기만 하고 아무도 읽지 않는 화면 상태 필드 셋(targetId·isSelf·RuleRow.active)을 지운다

**채택** · 삭제 · 위험 안전 · **-8줄**

`src/app/(app)/admin/users/action-state.ts` · `src/app/(app)/admin/users/actions.ts` · `src/app/(app)/admin/users/user-table.tsx` · `src/app/(app)/admin/users/panel.tsx` · `src/app/(app)/admin/merit/rules/rule-table.tsx` · `tests/app/(app)/admin/users/actions.test.ts`

(1) `UserActionState.targetId`(action-state.ts:19·26)와 그것을 채우는 actions.ts 네 자리(56·99·120), 그리고 그 값을 단언하는 테스트(actions.test.ts:86·408)를 지운다. (2) user-table.tsx의 `UserRow.isSelf`(26행)와 그것을 계산하는 panel.tsx:46을 지운다 — 같은 이름을 쓰는 user-forms.tsx의 필드는 실제로 읽으므로 건드리지 않는다. (3) rule-table.tsx의 `RuleRow.active`(33행)를 지운다.

**왜:** 셋 다 만들어지기만 하고 읽는 곳이 없다. isSelf가 특히 위험한 모양이다 — 상세 화면(user-forms.tsx)에서는 「자기 계정은 못 끈다」를 실제로 막는 값인데 목록 표에서는 이름만 같고 아무 일도 하지 않아, 표를 고치는 사람이 그 보호가 여기에도 걸려 있다고 오해하기 쉽다.

---

#### dead-11 · 전역 headers()에 덮여 사라지는 첨부 라우트의 CSP·nosniff 줄과 반대로 적힌 주석을 지우고, 같은 응답을 내는 catch 둘을 합친다

**조건부** · 삭제 · 위험 안전 · **-8줄**

`src/app/api/community/attachments/[...attachment]/route.ts` · `tests/app/api/community/attachments/route.test.ts`

라우트 응답 헤더에서 `Content-Security-Policy`(그리고 「이 응답에만 건다 … 전역 CSP를 여기서 덮어쓴다」는 반대로 적힌 주석 두 줄)와 `X-Content-Type-Options`를 지운다 — 둘 다 next.config.ts의 ATTACHMENT_HEADERS가 이미 같은 값으로 다시 건다. 이어서 `ForbiddenError`와 `CommunityError`가 글자까지 같은 404를 내는 catch 두 블록을 하나로 합친다. 그 헤더가 라우트에서 온다고 단언하는 테스트도 next.config 쪽을 보게 고친다.

**왜:** 주석이 사실과 반대다 — next.config.ts:113-115가 「뒤에 오는 규칙이 같은 이름의 헤더를 덮는다」고 적고 첨부 규칙을 일부러 전역 뒤에 두었으므로, 라우트가 건 값은 실제로는 한 번도 나가지 않는다. 반대로 적힌 주석은 다음 사람이 next.config의 첨부 규칙을 「중복이니 지우자」고 판단하게 만들 수 있고, 그러면 사용자가 올린 바이트가 페이지용 느슨한 CSP로 나간다.

**조건:** (1) 라우트에서 헤더를 빼는 자리에 「CSP·nosniff는 next.config.ts의 ATTACHMENT_HEADERS가 소유한다」는 한 줄을 남긴다. (2) 테스트를 그냥 지우지 말고 next.config.ts의 ATTACHMENT_HEADERS 값을 직접 단언하도록 옮긴다 — 「사용자가 올린 바이트에 default-src 'none'; sandbox가 붙는다」는 회귀 검사가 사라지면 안 된다. (3) catch 둘을 합칠 때 「권한 없음과 없음을 가르지 않는다」 주석을 유지한다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「첨부 응답의 CSP는 next.config.ts가 소유한다 — 라우트 핸들러가 응답에 직접 건 CSP는 전역 headers()에 덮인다」. 문서는 이미 맞게 적혀 있고 코드 주석만 반대다
>
> 검증: next.config.ts:110-121의 순서(전역 /:path* → 첨부 /api/community/attachments/:id*)와 113-115 주석 「뒤에 오는 규칙이 같은 이름의 헤더를 덮는다 … 실제로 확인했다」를 읽어 라우트가 건 값이 나가지 못함을 확인했다. CLAUDE.md도 같은 방향으로 적혀 있어 반대로 적힌 것은 라우트 주석과 테스트 주석뿐이다. nosniff는 전역 SECURITY_HEADERS(next.config.ts:52)에도 있어 이중이다. 헤더를 남겨도 방어가 되지 않는다 — next.config의 첨부 규칙이 사라지면 전역 페이지용 CSP가 라우트 값을 덮으므로 「벨트」로 기능하지 못한다. ForbiddenError·CommunityError 두 catch는 본문·상태가 …

---

#### dead-18 · 읽는 코드가 없고 그 화면이 쓰는 제목과도 다른 EXTRA_TITLES의 /scan 항목을 지운다

**채택** · 삭제 · 위험 안전 · **-6줄**

`src/components/app-shell/nav.ts` · `tests/components/app-shell/nav.test.ts` · `CLAUDE.md`

nav.ts:181-183의 `{ href: "/scan", label: "QR 스캔" }`과 그 위 주석 두 줄을 지우고, nav.test.ts:129의 `titleForPath("/scan")` 단언도 지운다. CLAUDE.md의 「판독(/scan)은 … 앱 셸 밖에 사는 화면이라 제목은 nav.ts의 EXTRA_TITLES가 소유한다」를 「제목은 scan/page.tsx의 metadata가 소유한다」로 고친다.

**왜:** titleForPath를 부르는 곳은 topbar.tsx 하나이고, topbar는 (app) 레이아웃 안에서만 그려진다. /scan은 앱 셸 밖에 있어(CLAUDE.md가 그렇게 두는 이유까지 적어 두었다) 이 값이 화면에 닿는 경로가 없다. 게다가 실제로 보이는 제목은 scan/page.tsx:11의 `metadata: { title: "학생증 확인" }`이라 이름까지 다르다 — 지금 상태는 「제목의 소유자가 nav.ts다」라는 문서를 믿고 nav.ts를 고친 사람이 화면이 안 바뀌는 것을 보게 되는 함정이다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「판독(/scan)은 메뉴에 없다 … 앱 셸 밖에 사는 화면이라 제목은 nav.ts의 EXTRA_TITLES가 소유한다」 — 이 문장이 사실이 아니므로 코드가 아니라 문장을 코드에 맞춘다. 「메뉴에서 뺐다고 이름까지 없어지면 안 된다」는 nav.ts 주석의 취지는 page.tsx의 metadata가 이미 지키고 있다
>
> 검증: titleForPath의 운영 호출자는 topbar.tsx:113 하나뿐이고 Topbar는 app/(app)/layout.tsx:21에서만 그려진다. /scan은 src/app/scan/ 아래 (app) 밖 라우트이고 그 디렉터리에 layout.tsx가 없어 Topbar를 거치지 않는다 — 실제 제목은 scan/page.tsx:11의 metadata `학생증 확인`이다. 문서화된 이유(CLAUDE.md 「제목은 nav.ts의 EXTRA_TITLES가 소유한다」)가 있으나 전제가 무너진 경우다: 그 문장이 사실이 아니고, nav.ts 주석의 취지(「메뉴에서 뺐다고 이름까지 없어지면 안 된다」)는 page.tsx의 metadata가 이미 지킨다. nav.test.ts:129는 화면에 닿지 않는 값을 단언하는 …

---

#### dead-07 · 클라이언트 번들에서 도달할 수 없는 adminClient 플러그인과 안 쓰는 signIn·useSession 재수출을 뺀다

**채택** · 삭제 · 위험 안전 · **-5줄**

`src/core/auth/auth-client.ts`

auth-client.ts를 `createAuthClient()` 한 줄로 줄인다 — `adminClient` import와 플러그인 인자, `ac`/`adminRoles` import(3·5·9행), 그리고 아무도 쓰지 않는 `export const { signIn, signOut, useSession }`(12행)을 지운다. 남는 유일한 소비자는 sign-out-button.tsx의 `authClient.signOut()`이다.

**왜:** adminClient가 다는 메서드는 전부 Better Auth admin 엔드포인트를 부르는데, api/auth/[...all]/route.ts의 SAFE_ENDPOINTS가 get-session·sign-in/email·sign-out 셋만 통과시키고 나머지를 404로 막는다 — 즉 이 플러그인으로는 성공할 수 있는 호출이 하나도 없다. 게다가 이 import 때문에 접근제어 표(permissions.ts)가 브라우저 번들로 함께 실려 나간다. signIn·useSession 재수출도 참조가 0이다.

---

#### dead-21 · 호출부가 먼저 걸러 도달할 수 없는 분기 셋(빈 목록 안내·중복 문서 주석·명시적 폼 리셋)을 지운다

**조건부** · 삭제 · 위험 테스트필요 · **-5줄**

`src/app/(app)/merit/stats/views/teacher-chart.tsx` · `src/components/merit/charts.tsx` · `src/app/(app)/community/[slug]/[postId]/comment-form.tsx`

(1) teacher-chart.tsx:79-80의 `rows.length === 0 ? <EmptyState …> : …` 삼항을 없애고 else 쪽만 남긴다(EmptyState import도 뺀다). (2) charts.tsx:185의 한 줄짜리 문서 주석을 지운다 — 바로 아래 블록 주석과 겹쳐 있고 앞의 것은 어디에도 안 쓰인다. (3) comment-form.tsx의 formRef·useEffect·`ref={formRef}`와 그 주석을 지운다 — React 19가 액션 뒤 폼을 스스로 reset하고, 이 칸들은 defaultValue를 쓰지 않는 비제어 칸이다.

**왜:** teacher-chart의 빈 목록 안내는 호출부(teachers.tsx:67-69)가 `rows.length === 0`을 먼저 잡아 EmptyState를 그리고 돌아가므로 절대 렌더되지 않는다 — 같은 문구가 두 곳에 있는데 하나만 실제로 보이는 상태다. comment-form의 명시적 reset은 React가 이미 하는 일을 되풀이하며, 의존성 배열이 `[state.ok]`라 두 번째 연속 성공에서는 값이 안 바뀌어 돌지도 않는다(즉 「그래서 필요하다」는 근거도 성립하지 않는다).

**조건:** 세 항목 중 (1)(2)만 진행한다. comment-form.tsx의 formRef·useEffect 삭제는 뺀다 — 바로 위 주석이 「React 19가 폼을 리셋하지만 defaultValue를 안 쓰므로 여기서 명시적으로 비워야 다음 댓글을 바로 칠 수 있다」로 그 코드가 있는 이유를 적어 두었고, 제안의 반박은 추론일 뿐 확인이 아니다. 지우려면 먼저 브라우저에서 「댓글 두 번 연속 작성 시 칸이 비는가」를 직접 보거나 그 동작을 붙드는 테스트를 먼저 넣는다. 단위 테스트로는 안 잡히고 실패해도 조용한 UX 회귀다.

---

#### dead-05 · globals.css의 @theme 토큰 중 실사용 0곳인 --text-display 3줄과 --color-green-press를 지운다

**조건부** · 삭제 · 위험 안전 · **-4줄**

`src/app/globals.css`

@theme에서 `--text-display`·`--text-display--line-height`·`--text-display--letter-spacing`(75-77행)과 `--color-green-press`(51행)를 지운다.

**왜:** @theme의 50개 토큰을 전수로 훑어(색은 bg/text/border… 유틸 이름, 크기는 text-, 모서리는 rounded-로 환산) 유틸 사용 0곳이면서 globals.css 안에서 var()로도 안 쓰이는 것은 이 넷뿐이다. --text-display는 이미 한 번 「쓰는 데가 0곳이라 지운다」는 주석과 함께 삭제됐다가 대시보드 개편이 되살렸고, 값(28/1.15/-0.5)까지 디자인 스펙(28/1.2/-0.42)에서 벗어나 있다. 쓰이지 않는 크기 토큰은 두면 언젠가 아무 데나 쓰인다 — 그것이 지운 이유였다.

**조건:** docs/design/2026-08-17-redesign-spec.md의 색 표(:85 green-press)와 크기 표(:95 text-display) 두 줄을 같은 커밋에서 지운다 — 토큰만 지우면 「기준 문서」와 globals.css가 갈린다. docs/reviews/README.md:77의 「삭제됐다」는 그때 비로소 사실이 된다. plans 문서 §6이 이 항목을 「다음에 사람이 정할 일」로 남겼으므로 사용자 확인을 한 번 받는다.

> **문서화된 결정을 건드린다** — docs/design/2026-08-17-responsive-audit.md P3-5의 「text-display 토큰은 지운다」와 docs/reviews/README.md:62의 「삭제됐다」 — 문서가 두 곳에서 삭제를 기록했는데 코드에 살아 있다. 지우는 쪽으로 맞춘다
>
> 검증: globals.css:75-77·51 네 토큰이 유틸 이름(text-display/bg-green-press…)으로도 var()로도 0건임을 확인했다. dead-13과 달리 여기 문서화된 결정은 「지운다」쪽이다 — responsive-audit P3-5가 「두면 언젠가 아무 데나 쓰인다」로 삭제를 확정했고 그 전제(실사용 0곳)가 지금도 살아 있다. 다만 globals.css:73-74의 「페이지 대표 숫자 하나에만 쓴다」 주석과 redesign-spec의 토큰 표가 아직 이 토큰을 살아 있는 규격으로 적고 있어 문서 동반 수정이 필수다. 값(28/1.15/-0.5)이 스펙(28/1.2/-0.42)과 어긋난 것도 확인했다.

---

#### dead-14 · 쓰기만 하고 읽는 곳이 없는 커뮤니티 삭제 메타 컬럼(deletedByUserId·deletedReason)을 스키마에서 지운다

**조건부** · 스키마 · 위험 테스트필요 · **-4줄**

`prisma/schema.prisma` · `src/modules/community/community.repo.ts`

CommunityPost·CommunityComment의 `deletedByUserId`·`deletedReason`(schema.prisma:671-672·698-699)을 지우고, community.repo.ts:243·350의 소프트 삭제 update에서 두 필드를 뺀다(`deletedAt`만 남는다). 배포 이력이 없으므로 마이그레이션은 새로 만들지 말고 초기 마이그레이션에서 함께 접는다.

**왜:** 두 컬럼은 삭제할 때 채워지기만 하고 화면·API·서비스 어디에서도 읽히지 않는다. 게다가 저장소의 「사람 참조」 규약(외래키 + onDelete: SetNull + 이름 스냅샷 — MeritThreshold.updatedBy, MeritAward.cancelledBy, Pass의 네 자리가 전부 그렇다)을 이 둘만 따르지 않는다: userId만 String으로 들고 관계가 없어 계정이 지워져도 끊기지 않는 고아 id가 남는다. 「누가 왜 지웠나」는 이미 recordAudit이 남기므로 이 두 열은 감사로그의 열등한 사본이다.

**조건:** 기존 마이그레이션(20260827155115_community)을 고쳐 「접지」 않는다 — 마이그레이션이 20개 쌓여 있고 테스트 서버에 이미 적용된 DB가 있어(docs/deploy.md의 migrate 서비스) 체크섬이 깨지면 `prisma migrate deploy`가 그 자리에서 멈춘다. DROP COLUMN 마이그레이션을 새로 만들고, 생성된 SQL을 눈으로 확인한다(CLAUDE.md의 부분 유니크 인덱스 주의와 같은 이유).

---

#### dead-16 · 서비스가 계산해 돌려주지만 그리는 화면이 없는 PostPage.total을 지운다

**조건부** · 삭제 · 위험 안전 · **-3줄**

`src/modules/community/post.service.ts`

post.service.ts의 `PostPage` 타입에서 `total`(120행)과 반환 객체의 `total`(149행)을 지운다. 같은 이름의 지역 변수는 148행에서 pageCount를 계산하는 데 계속 쓰이므로 그대로 둔다.

**왜:** 게시판 목록 화면이 `total`을 읽지 않는다. 형제 목록 셋(상벌점 최근 부여·출입증 이력·감사로그)은 모두 「총 N건」을 그리므로, 서비스가 값을 내주는데 화면이 안 그리는 이 자리는 「화면이 빠뜨렸나, 일부러 안 그리나」를 코드만 보고는 알 수 없다. 필드를 지우면 나중에 「총 N건」을 넣기로 할 때 서비스부터 고치게 되어 결정이 한 자리에 남는다.

**조건:** 제안이 빠뜨린 테스트 단언(tests/modules/community/post.service.test.ts:406의 `expect(page.total).toBe(45)`)을 함께 지운다 — 안 그러면 단위 테스트가 곧바로 깨진다. 그리고 「총 N건」을 목록에 넣을지 먼저 정한다: 넣기로 하면 필드를 지우지 않는 것이 맞다.

---

#### dead-22 · 호출부가 없는 인자와 아무도 읽지 않는 select 열, 채워지지 않는 스키마 필드를 정리한다

**채택** · 삭제 · 위험 안전 · **-3줄**

`src/lib/temp-password.ts` · `src/modules/admin-users/admin-user.repo.ts` · `src/modules/invites/invite.schema.ts`

(1) `generateTempPassword(length = TEMP_PASSWORD_LENGTH)`의 인자를 없애고 루프가 상수를 직접 보게 한다(19-21·24행). (2) admin-user.repo.ts:43의 `findById` select에서 세 호출자가 아무도 읽지 않는 `email`·`status`를 뺀다. (3) invite.schema.ts:72의 `createParentInviteSchema.expiresInDays`를 지운다.

**왜:** generateTempPassword의 length는 호출부가 없을 뿐 아니라 3보다 작은 값을 주면 요청한 길이를 조용히 무시한다(앞 세 자리를 무조건 채운 뒤 while로 늘리기만 한다) — 쓰이지 않는 인자가 동시에 틀린 인자다. createParentInviteSchema의 expiresInDays는 학부모 코드 액션이 값을 실어 보내지 않아 학생이 만든 코드가 늘 무기한이 되는데, 스키마에 필드가 있으면 「유효기간을 받는다」고 읽힌다 — 지우면 무기한이 코드에 드러나고, 유효기간을 실제로 받기로 하면 그때 화면과 함께 넣는다.

---

#### dead-12 · 거짓이 될 수 없는 삼항·참이 될 수 없는 호스트 가지·부르는 사람이 없는 npm 스크립트를 지운다

**조건부** · 삭제 · 위험 안전 · **0줄**

`playwright.config.ts` · `scripts/seed-demo.ts` · `package.json`

(1) playwright.config.ts:54의 `...(databaseUrl ? { DATABASE_URL: databaseUrl } : {})`를 `DATABASE_URL: databaseUrl`로 편다 — 바로 위 `resolveE2eDatabaseUrl`이 값이 없으면 던지므로 이 삼항은 늘 참이다(바로 아래 authSecret 줄은 실제로 undefined가 될 수 있어 그대로 둔다). (2) seed-demo.ts:61의 `host === "::1" ||`를 지운다 — `new URL().hostname`은 IPv6를 늘 대괄호째 `[::1]`로 주므로 이 가지는 참이 될 수 없고, 같은 줄의 `"[::1]"` 검사가 그 경우를 이미 잡는다. (3) package.json에서 `test:watch`와 `db:deploy`를 지운다.

**왜:** 늘 참인 삼항은 「이 값이 없을 수도 있다」고 말하지만 그럴 수 없다 — 바로 아래 줄과 모양이 같아서 둘 다 방어처럼 읽히고, 실제로 방어가 필요한 쪽이 어느 것인지 흐려진다. npm 스크립트 둘은 CI·Dockerfile·docker-compose·docs·README 어디에서도 불리지 않고 문서에도 없다(db:studio는 README:203에 있으므로 남긴다).

**조건:** npm 스크립트 둘(test:watch·db:deploy)은 남긴다 — test:watch는 개발자 편의 명령이라 지워서 얻는 것이 없고, db:deploy는 compose 밖에서 손으로 마이그레이션할 때의 유일한 진입점이다(docs/deploy.md가 migrate 컨테이너 실패를 다루는 절차를 여러 곳에 둔다). 삭제 범위는 playwright.config.ts:54와 seed-demo.ts:61 둘로 좁힌다.

---

#### dead-20 · 두 파일에 따로 박힌 명단 2000줄 상한을 상수 하나로 모은다

**조건부** · 통합 · 위험 안전 · **+2줄**

`src/modules/enrollment/roster.schema.ts` · `src/modules/enrollment/roster.parse.ts`

roster.parse.ts:47의 `MAX_ROSTER_ROWS = 2000`을 export하고, roster.schema.ts:93의 `.max(2000, "한 번에 2000줄까지 반영할 수 있습니다.")`와 99행의 `.max(2000)`이 그 상수를 쓰게 한다(문구도 상수에서 조립한다).

**왜:** 같은 한계가 세 자리에 리터럴로 박혀 있다. 파서(미리보기)와 스키마(확정)가 서로 다른 값을 갖게 되면 「미리보기는 되는데 확정만 막히는」 구간이 생기고, 그 실패는 파일 크기에 따라만 나타나므로 재현이 어렵다. 상수 하나로 모으면 한쪽만 올리는 실수가 성립하지 않는다.

**조건:** 상수를 roster.parse.ts에서 export해 roster.schema.ts가 가져다 쓰면 순환 import가 된다 — roster.parse.ts:21이 이미 roster.schema.ts의 ROSTER_FILE_MAX_BYTES를 가져다 쓴다. 방향을 뒤집어 상수를 roster.schema.ts에 두고 roster.parse.ts가 import한다(ROSTER_FILE_MAX_BYTES와 같은 모양). 범위는 파서와 rosterRowsSchema(:93) 둘로 좁힌다 — confirmedDeletionIdsSchema(:99)는 「파일에 없는 기존 학생 수」라 업로드 행 수와 다른 수량이고, 같은 상수로 묶으면 두 한계가 잘못 결합된다.

---

### DB — 스키마·마이그레이션 (5건)

#### db-03 · SchoolClass 테이블을 없애고 grade·classNo를 Enrollment 컬럼으로 인라인한다

**조건부** · 통합 · 위험 테스트필요 · **-35줄**

`prisma/schema.prisma` · `src/modules/registration/registration.repo.ts` · `src/modules/admin-users/admin-user.repo.ts` · `src/modules/enrollment/enrollment.repo.ts` · `src/modules/enrollment/roster.repo.ts` · `src/modules/merit/merit.repo.ts` · `src/modules/pass/pass.repo.ts` · `src/modules/invites/invite.repo.ts` · `src/app/(app)/admin/users/panel.tsx` · `src/app/(app)/admin/users/[userId]/page.tsx` · `src/app/(app)/pass/admin-view.tsx`

`model SchoolClass`(14줄)를 지우고 `Enrollment.classId String?` + `schoolClass` 관계를 `grade Int?` · `classNo Int?` 둘로 바꾼다. `@@unique([classId, number])`는 `@@unique([year, grade, classNo, number])`가 된다 — Postgres가 NULL을 서로 다르게 보므로 **비재학(반·번호 null) 행끼리 걸리지 않는다는 성질이 그대로 유지된다**(현 주석이 설명하는 바로 그 동작). 네 곳의 `schoolClass.upsert` 블록이 통째로 사라진다: registration.repo:129-140, admin-user.repo:190-195, enrollment.repo:173-185, roster.repo:206-225(반을 모아 한 번씩만 부르는 배치 루프까지). 조회부는 `schoolClass: { select: { grade: true, classNo: true } }` 15곳이 `grade: true, classNo: true`로, `orderBy: { schoolClass: { grade: "asc" } }`가 `orderBy: { grade: "asc" }`로, 독자 `e.schoolClass?.grade`가 `e.grade`로 바뀐다. `roster.repo:94`의 `where: { …

**왜:** `SchoolClass`는 `id · year · grade · classNo · createdAt` 다섯 칸뿐이고 그중 정보는 뒤의 셋인데, 그 셋을 얻으려고 (a) 학생 배정 경로 네 곳이 매번 upsert를 돌고, (b) 명단 반영은 「학생마다 upsert하면 300번 왕복한다」를 피하려고 반을 모으는 Map 두 개와 루프를 따로 갖고 있으며(roster.repo:206-225), (c) `onDelete: Restrict`가 왜 SetNull이 아닌지 6줄짜리 주석으로 설명돼야 하고, (d) 인덱스가 둘(`@@unique([year,grade,classNo])`, `@@index([year])`) 붙는다. 학년·반은 **값이지 개체가 아니다** — 「1학년 3반」에 붙는 속성이 하나도 없고(담임도 교실도 없다), 해마다 새 행이 생기며, 참조는 Enrollment 하나뿐이다. 인라인하면 (c)의 논쟁이 성립하지 않는다: 지울 별도 행이 없으니 「반이 지워져도 지난 학년도 기록은 남아야 한다」가 저절로 참이 된다. 조회 쪽은 관계 select가 스칼라 select로 바뀌면서 15곳이 한 줄씩 늘지만, upsert 네 블록·배치 루프·모델 정의가 사라지는 쪽이 훨씬 크다.

**조건:** (1) 신규 설치만이 아니라 **이미 데이터가 있는 DB(로컬 dev · gbsw_test · 운영 중인 테스트 서버)용 백필 마이그레이션**을 함께 쓴다 — `UPDATE "Enrollment" e SET grade=sc.grade, classNo=sc."classNo" FROM "SchoolClass" sc WHERE sc.id=e."classId"`를 먼저 돌린 뒤 classId를 떨어뜨리고 새 유니크를 건다. (2) merit·pass·roster의 학년·반 그룹핑을 검증하는 통합 테스트(merit.removed-student · pass.list-window · roster 계열)를 **먼저** 돌려 기준선을 잡고 변경 후 같은 결과를 확인한다. (3) 새 `@@unique([year, grade, classNo, number])`가 `Enrollment @@index([year])`의 접두사를 덮으므로 db-07과 함께 정리한다. (4) db-01이 기각됐으므로 스쿼시를 …

> **문서화된 결정을 건드린다** — prisma/schema.prisma:277-279의 `Enrollment.schoolClass onDelete: Restrict` 근거 주석(「반이 지워져도 지난 학년도 소속 기록은 남아야 한다」) — 별도 행이 없어지면 그 위험 자체가 사라지므로 주석과 함께 걷는다. schema.prisma:250의 「학년도마다 별개의 행이다」도 같다.
>
> 검증: 방향은 옳다. `SchoolClass`에 걸린 문서화된 근거는 schema.prisma:277-279의 `onDelete: Restrict` 설명뿐인데 별도 행이 사라지면 그 위험 자체가 성립하지 않아 전제가 자기소멸한다. 설계 문서(2026-08-13-academic-year-and-roster-design.md:36-43)가 세운 논거는 「기록마다 소속을 복사하지 말고 Enrollment 한 줄로 모아라」와 「@@unique([studentProfileId, year])를 DB가 막게 하려면 Enrollment에 year가 있어야 한다」로, 둘 다 SchoolClass를 별도 테이블로 두는 근거가 아니라 Enrollment를 두는 근거다 — 인라인해도 그대로 산다. `@@unique([classId, …

---

#### db-02 · 「다음 migrate dev가 AcademicYear_single_current를 DROP한다」는 경고를 다섯 곳에서 걷는다 — Prisma 7.9.1에서 재현되지 않는다

**채택** · 단순화 · 위험 안전 · **-24줄**

`CLAUDE.md` · `README.md` · `docs/deploy.md` · `prisma/schema.prisma` · `src/modules/academic-year/academic-year.repo.ts`

CLAUDE.md 「주의점」의 5줄, README.md:285-287의 3줄, docs/deploy.md:422-426의 5줄, schema.prisma:221-239의 19줄 주석, academic-year.repo.ts:33-36의 setCurrent 주석에서 **DROP 공포 부분만** 걷고, 남길 사실을 한 줄로 줄인다 — 「`AcademicYear_single_current`는 Prisma가 표현하지 못해 초기 마이그레이션 SQL에만 있다. Prisma 7.9.1에서 `migrate diff`가 이것을 드리프트로 보지 않는 것을 확인했다(빈 마이그레이션). **메이저 업그레이드 때 다시 확인한다.**」 `setCurrent`의 「먼저 전부 내리고 나서 올린다」 순서 근거와 `FOR UPDATE` 설명은 **그대로 둔다** — 잠금 순서 논거는 DROP 여부와 무관하다. `docs/superpowers/plans/**`·`specs/**`의 같은 문구는 **건드리지 않는다** — 그때 그 작업의 기록이지 지금의 지시가 아니다.

**왜:** 이 경고는 다섯 곳에 퍼져 있고 새 마이그레이션을 만들 때마다 사람이 SQL을 눈으로 훑게 만드는데, 근거가 사실이 아니다. 섀도 DB에 마이그레이션 전량을 적용한 뒤 스키마와 diff하면 빈 마이그레이션이 나오고, **AcademicYear 테이블 자체에 컬럼을 추가해 새 마이그레이션이 반드시 나오게 강제해도** `ALTER TABLE "AcademicYear" ADD COLUMN "probeField" TEXT;` 한 줄뿐 DROP INDEX가 없다. Prisma의 diff 엔진이 부분 인덱스를 **표현하지 못하는 것과 같은 이유로 드리프트로도 보지 않기** 때문이다. 게다가 `git log --all -S 'DROP INDEX "AcademicYear_single_current"'`는 마이그레이션 파일에서 그 줄을 한 번도 찾지 못한다 — 21개 내내 실제로 생긴 적이 없다. 틀린 경고를 다섯 곳에 두면 진짜 경고(같은 문단의 `next dev` 재시작, 부분 인덱스의 존재 자체)까지 함께 흘려 읽힌다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「주의점」의 부분 유니크 인덱스 항목 · prisma/schema.prisma:221-239 · docs/deploy.md 「알아둘 것」 · academic-year.repo.ts:33-36 — 넷 다 이 경고를 근거로 쓴 문장이다
>
> 검증: 문서화된 이유가 다섯 곳(CLAUDE.md:259-263 · README.md:285-287 · docs/deploy.md:422-426 · schema.prisma:221-239 · academic-year.repo.ts:33-36)에 있지만 **그 전제가 무너진 경우**라 예외에 해당한다. 두 갈래로 직접 재현했다 — (1) 마이그레이션 20개를 전량 적용한 probe DB(부분 인덱스 실재 확인)를 schema.prisma와 diff하니 `-- This is an empty migration.`, (2) AcademicYear 테이블에 컬럼을 하나 더해 마이그레이션이 반드시 나오도록 강제해도 출력은 `ALTER TABLE "AcademicYear" ADD COLUMN "probeField" …

---

#### db-05 · 쓰기만 하고 아무도 읽지 않는 컬럼 5개를 지운다 — 커뮤니티 삭제 표시 4개와 Invite.usedAt

**조건부** · 삭제 · 위험 테스트필요 · **-17줄**

`prisma/schema.prisma` · `src/modules/community/community.repo.ts` · `src/modules/community/post.service.ts` · `src/modules/community/comment.service.ts` · `src/modules/registration/registration.repo.ts` · `tests/modules/community/post.service.test.ts` · `tests/modules/community/comment.service.test.ts` · `tests/integration/registration.atomicity.integration.test.ts`

`CommunityPost.deletedByUserId` · `CommunityPost.deletedReason` · `CommunityComment.deletedByUserId` · `CommunityComment.deletedReason` · `Invite.usedAt`을 지운다. `deletedAt`은 넷 다 남는다(실제로 읽는다). `markPostDeleted`/`markCommentDeleted`의 `actorUserId`·`reason` 인자가 없어져 `(id, db)` 두 개가 되고, 두 서비스의 호출부와 그 목 단언 6곳이 함께 줄어든다. `consumeInvite`의 `data`에서 `usedAt: new Date()`가 빠진다(`status: "USED", usedById`는 남는다).

**왜:** 다섯 컬럼 모두 **쓰는 자리는 있고 읽는 자리가 0**이다. 커뮤니티 넷은 게다가 스키마 자신의 사람 참조 규약을 혼자 어긴다 — `deletedByUserId`는 관계도 없는 맨 `String?`이라 계정이 지워지면 아무 데도 안 닿는 id가 남고, 이름 스냅샷도 없어 나중에 읽으려 해도 누구인지 알 수 없다. 같은 사실은 이미 **더 나은 모양으로** 감사로그에 있다: `post.service.ts:381`과 `comment.service.ts:121`이 `actorUserId`·`actorName`(스냅샷)·`reason`·`byModerator`를 함께 남긴다. `Invite.usedAt`은 `status = "USED"`와 `registration:complete` 감사로그가 이미 답하는 「언제 쓰였나」의 셋째 사본이다. 지금 상태의 실제 비용은 줄 수가 아니라 **다음 사람이 이 컬럼을 읽어도 되는 자료로 착각하는 것**이다 — 화면에 「삭제 사유」를 붙이려고 이 컬럼을 select하면 계정 삭제 후 빈 값이 나오는데, 감사로그를 봤다면 남아 있었을 값이다.

**조건:** (1) 제안의 파일 목록에 없는 **`tests/integration/roster.repo.apply-roster.integration.test.ts:125`가 픽스처에서 `usedAt: new Date()`를 쓴다** — 컬럼을 지우면 타입 검사에서 깨지므로 함께 고친다(`status: "USED"`로 충분하다). `tests/integration/registration.atomicity.integration.test.ts:142`의 `usedAt: null` 단언도 status 단언으로 옮긴다. (2) `markPostDeleted`/`markCommentDeleted`에서 인자를 뺄 때 **호출부의 `recordAudit`에서 actorUserId·actorName·reason이 빠지지 않는지 확인한다** — 사실이 옮겨 가는 게 아니라 감사로그에 이미 있다는 것이 이 제안의 전제다. (3) db-01이 기각됐으므로 독립 마이그레이션으로 낸다.

---

#### db-04 · Invite.createdBy를 Restrict에서 SetNull + createdByName 스냅샷으로 바꿔 스키마의 나머지 스무 곳과 규약을 맞춘다

**조건부** · 스키마 · 위험 동작변화 · **-6줄**

`prisma/schema.prisma` · `src/modules/admin-users/admin-user.repo.ts` · `src/modules/enrollment/roster.repo.ts` · `src/modules/invites/invite.repo.ts` · `src/modules/invites/invite.service.ts` · `src/app/(app)/admin/invites/panel.tsx`

`createdById String` + `onDelete: Restrict`를 `createdById String?` + `onDelete: SetNull`로 바꾸고 `createdByName String`을 더한다(AuditLog.actorName·MeritAward.awardedByName·Pass.requestedByName과 같은 규약). `insertInvite`가 `createdByName`을 함께 받고 서비스가 `actor.name`을 넘긴다. 목록(`listAll`)의 `include: { createdBy: { select: { name: true } } }`는 스냅샷 읽기로 바뀐다. `admin-user.repo.deletePermanently:308-309`의 `invite.deleteMany({ where: { createdById } })` 한 줄과 그 주석이 사라진다 — **`usedById` 쪽 deleteMany는 남긴다**(그쪽은 metadata의 이름·생년월일 PII를 지우는 별개 근거다). `roster.repo:174-196`의 초대 수집·삭제 OR 세 갈래에서 `createdById` 갈래가 빠지고 그것을 설명하는 주석 4줄이 사라진다.

**왜:** 지금 교사 계정을 완전 삭제하면 **그 교사가 발급한 모든 초대가 함께 지워진다** — 아직 가입하지 않은 다른 학생의 PENDING 코드까지. 그 학생은 다음에 가입하러 와서 「쓸 수 없는 가입코드입니다」를 보고, 왜인지는 어디에도 안 남는다(초대 행이 사라져 감사로그의 targetId가 가리킬 것이 없다). 이것은 업무 판단이 아니라 **`Restrict`를 피하려는 우회로**다 — 코드 주석이 스스로 그렇게 말한다(admin-user.repo:308 「createdById는 Restrict + non-null이라 먼저 지우지 않으면 user.delete가 막힌다」, roster.repo:170-173 「Invite.createdBy가 Restrict라, … 이미 소진된 것까지 지워야 그 계정이 지워진다」). 스키마의 나머지 사람 참조 스무 곳(AuditLog·MeritAward 둘·MeritThreshold·Pass 넷·Community 셋·Invite.usedBy)은 전부 SetNull이고, 그중 이름이 필요한 곳은 예외 없이 스냅샷을 함께 둔다. `Invite.createdById`만 다르고, **그 예외에 적힌 근거가 저장소 어디에도 없다.** 규약에 맞추면 「계정을 지워도 누가 발급했는지 남는다」가 다른 곳과 같은 방식으로 성립하고, 삭제 경로 두 곳의 우회 코드가 사라진다.

**조건:** (1) `createdByName String`은 NOT NULL이므로 **마이그레이션에서 기존 행을 먼저 백필한 뒤** 제약을 건다 — `ADD COLUMN ... TEXT` → `UPDATE "Invite" i SET "createdByName"=u.name FROM "user" u WHERE u.id=i."createdById"` → 남은 행에 '(알 수 없음)'(AuditLog 20260813101955의 선례와 같게) → `SET NOT NULL`. (2) 삭제된 교사가 발급한 PENDING 초대의 metadata(피초대자 이름·생년월일)가 이제 살아남으므로, 폐기·만료 경로가 그 행을 실제로 정리하는지 확인하고 안 하면 함께 정한다. (3) `deletePermanently`에서 `createdById` deleteMany만 빼고 `usedById` deleteMany는 남기는 범위를 지킨다. (4) seed-demo --clean이 같은 FK로 죽던 data-R01이 …

> **문서화된 결정을 건드린다** — 건드리는 것은 `Restrict` 쪽이 아니라 그 반대다 — schema.prisma:396-398·476-478·521-523이 세운 「과거의 사실이 살아 있는 외래키에 기대면 안 된다」 규약에 **맞추는** 변경이다. 동작 변화: 교사 계정을 지워도 그가 발급한 PENDING 초대가 살아남는다(그것이 목적). 지금까지 함께 지워지던 것에 기대는 코드는 없다.
>
> 검증: 확인 결과 제안의 진단이 맞다. schema.prisma의 onDelete 30개를 전수로 뽑아 보니 Restrict는 AcademicYear(4)·SchoolClass(1)·MeritRule(1)·Invite.createdBy(1)뿐이고, 사람 참조 중 Restrict는 `Invite.createdBy` 하나다 — 나머지(AuditLog.actor·MeritAward 둘·MeritThreshold·Pass 넷·Community 셋·Invite.usedBy)는 전부 SetNull이고 이름이 필요한 곳은 예외 없이 스냅샷을 둔다. **그 예외를 정당화하는 문서는 없다.** 반대로 설계 문서(2026-08-13-academic-year-and-roster-design.md:288-292)는 「과거의 사실이 …

---

#### db-07 · 질의가 한 번도 닿지 않는 인덱스 4개를 지운다

**채택** · 삭제 · 위험 안전 · **-4줄**

`prisma/schema.prisma`

`SchoolClass @@index([year])` · `Enrollment @@index([studentProfileId])` · `Invite @@index([status])` · `VerificationCode @@index([expiresAt])` 네 줄을 지운다. 앞의 둘은 **접두사 중복**이다 — `SchoolClass`에는 `@@unique([year, grade, classNo])`가, `Enrollment`에는 `@@unique([studentProfileId, year])`가 이미 있어 Postgres가 같은 접두사 조회를 그 인덱스로 처리한다. 뒤의 둘은 **그 컬럼 하나로 좁히는 질의가 없다** — Invite의 `status` 조건은 예외 없이 `id`(PK) 또는 `studentId`와 함께 오고, VerificationCode의 `expiresAt` 조건은 항상 `channel+target` 또는 `id`와 함께 온다. `db-03`이 먼저 들어가면 `SchoolClass @@index([year])`는 그쪽에서 이미 사라지므로 여기서 한 줄이 겹친다.

**왜:** 인덱스는 쓰기마다 갱신되고 스키마를 읽는 사람에게 「이 컬럼으로 찾는 질의가 있다」고 말한다. 네 줄 다 그 말이 거짓이다. 특히 `Invite @@index([status])`는 값이 세 개(PENDING/USED/REVOKED)뿐이라 단독으로는 플래너가 고르지도 않고, `Enrollment @@index([studentProfileId])`는 바로 위 줄의 유니크 인덱스가 이미 같은 접두사를 덮는다 — 스키마만 읽으면 두 개가 서로 다른 접근 경로를 뒷받침하는 것처럼 보인다. 비-PK 인덱스 41개 중 넷을 줄이는 것 자체보다, **남은 37개가 전부 실제 질의를 가리킨다는 사실**이 다음 사람에게 의미가 있다.

---

### 보안 (7건)

#### sec-01 · Better Auth 화이트리스트에서 `sign-in/email`을 빼, 감사로그를 남기지 않는 둘째 로그인 문을 닫는다

**채택** · 보안 · 위험 테스트필요 · **+3줄**

`src/app/api/auth/[...all]/route.ts` · `tests/app/api/auth/route.test.ts`

`SAFE_ENDPOINTS.POST`(route.ts:11)의 `"sign-in/email"`을 뺀다. 화면 로그인은 `/login/submit`이 처리하고 그 라우트는 `auth.handler(new Request(new URL("/api/auth/sign-in/email", origin), …))`로 **핸들러를 직접** 부르므로(submit/route.ts:213-221) 이 화이트리스트를 지나지 않는다 — 즉 정상 로그인은 영향이 없다. 라우트 주석(18-24행)의 「로그인·세션조회·로그아웃만 쓴다」를 「세션조회·로그아웃만. 로그인은 /login/submit이 유일한 문이고 감사로그가 그 자리에 있다」로 좁혀 적는다. 테스트는 `preserves…` 케이스에서 sign-in 단언을 빼고 「sign-in/email 직접 POST는 404」로 뒤집고, `passes allowed endpoints through` 케이스의 경로를 `sign-out`으로 바꾼다.

**왜:** 로그인 성공·실패 감사로그(`auth:login`·`auth:login-failed`)는 `/login/submit`의 `recordLoginAttempt`에만 있다(submit/route.ts:118-136). 화이트리스트가 `/api/auth/sign-in/email`을 그대로 통과시키므로, 그 주소로 직접 POST하면 세션 쿠키가 정상 발급되면서 감사로그는 한 줄도 안 남는다 — **비밀번호 대입 시도 전체가 로그인 기록에서 보이지 않는다.** 감사로그를 시각으로 대조하는 것이 익명 게시판 추적의 유일한 수단이라고 CLAUDE.md가 적어 둔 시스템에서, 세션이 생기는 순간만 기록 밖에 있다. 그 경로는 EMAIL_MAX_LENGTH·PASSWORD_MAX_LENGTH 사전 검사와 이메일 마스킹, LOGIN_EMAIL_HINT_COOKIE 정리도 함께 건너뛴다. 이 문이 필요해서 열려 있는 것도 아니다 — 클라이언트에서 이 엔드포인트를 부르는 코드가 하나도 없다.

> **문서화된 결정을 건드린다** — src/app/api/auth/[...all]/route.ts:18-24 「이 앱은 로그인·세션조회·로그아웃만 Better Auth 라우트로 쓴다」 — 로그인이 이 라우트를 안 지난다는 사실이 그 문장에 반영돼 있지 않다. 문장을 좁힌다.
>
> 검증: 화이트리스트 항목이 정말로 아무도 안 쓴다는 것을 네 방향에서 확인했다 — (1) src 전체에서 `/api/auth/sign-in/email` 문자열을 쓰는 자리는 `login/submit/route.ts:214`(auth.handler 직접 호출)와 `auth.ts:59`(주석)뿐, (2) `authClient.signIn`은 `auth-client.ts:12`에서 재수출만 되고 호출부 0건(감사 문서 core-1-C04도 같은 결론), (3) 가입 자동 로그인은 `auth.api.signInEmail`(서버 API)이라 라우트를 안 지난다, (4) `isAllowedAuthEndpoint`의 참조는 라우트 자신과 `tests/app/api/auth/route.test.ts`뿐이다. …

---

#### sec-02 · 감사로그의 접속 IP를 x-forwarded-for의 **마지막** 항목에서 읽어, 덧붙임 모드 프록시에서의 위조를 닫는다

**조건부** · 보안 · 위험 동작변화 · **+8줄**

`src/core/audit/request-context.ts` · `tests/core/audit/request-context.test.ts`

`request-context.ts:24-26`의 `forwarded?.split(",")[0]?.trim()`을 마지막 항목으로 바꾼다 — `const hops = forwarded?.split(",").map((v) => v.trim()).filter(Boolean) ?? []` 뒤에 `hops[hops.length - 1] || h.get("x-real-ip")?.trim() || null`. 18-23행 주석을 「앱이 127.0.0.1에만 묶여 프록시가 정확히 한 홉이므로 마지막 항목이 프록시가 실제로 본 상대다. 첫 항목은 클라이언트가 지어 보낼 수 있다」로 바꾼다. 테스트 30·35·46·70행의 「첫 항목」 케이스 넷을 마지막 항목 기준으로 다시 쓰고, 「덧붙임 모드에서 지어낸 첫 항목을 무시한다」 케이스를 하나 더 넣는다.

**왜:** 지금은 클라이언트가 마음대로 보낼 수 있는 헤더의 **첫** 항목을 그대로 감사로그의 `ip`로 쓴다. 그 값이 진짜인 유일한 조건은 「프록시가 헤더를 덮어쓴다」인데, docs/deploy.md:133-137이 **Caddy는 기본이 덧붙임이고 2026-08-27 테스트 배포에서 실제로 위조 헤더가 첫 항목으로 들어오는 것을 눈으로 봤다**고 적어 두었다. 즉 이 코드는 실제로 한 번 일어났던 오설정에 대해 아무 방어가 없다. 새는 것이 감사로그만도 아니다 — `verification.service`의 IP별 시간당 60회 제한(`countRecentSendsByIp`)이 같은 값을 버킷 키로 쓰므로, 첫 항목을 매 요청 바꾸면 그 한도가 통째로 무의미해진다. 같은 프로세스 안의 다른 해석기와도 어긋난다: Better Auth의 `getIp`는 `trustedProxies` 없이는 **항목이 하나가 아니면 아예 IP를 못 읽은 것으로 친다**(`@better-auth/core/dist/utils/ip.mjs`의 `getIPFromHeader`). 마지막 항목은 문서가 지시하는 두 설정(덮어쓰기 → 항목 하나)에서 지금과 값이 같고, 덧붙임 오설정에서만 위조값 대신 프록시가 본 실제 상대를 준다. **다만 프록시가 헤더를 아예 손대지 않고 흘려보내는 오설정은 이 변경으로도 못 가른다** — 그건 `trustedProxies` 설정 …

**조건:** 다음 다섯을 **한 커밋에** 함께 한다. (1) `docs/deploy.md`의 「앱은 그 헤더의 첫 항목을 접속 IP로 믿으므로」 두 군데(Caddyfile 주석 블록·nginx 아래 경고 문단)를 마지막 항목 기준으로 고쳐 적는다. (2) 그러면서도 **프록시 덮어쓰기(`header_up X-Forwarded-For {remote_host}` · `proxy_set_header X-Forwarded-For $remote_addr`)는 그대로 필수로 남긴다** — 마지막 항목 읽기는 둘째 방어선이지 설정을 빼도 된다는 뜻이 아니라고 문서에 명시한다. (3) `request-context.ts:18-23` 주석을 「프록시가 정확히 한 홉이므로 마지막 항목이 프록시가 실제로 본 상대다. 첫 항목은 클라이언트가 지어 보낼 수 있다」로 바꾸되, 「프록시가 헤더를 아예 손대지 않는 오설정은 이 코드로도 못 가른다」는 한계도 함께 적는다. (4) 테스트 4건(첫 항목 규약)을 다시 쓰고 …

> **문서화된 결정을 건드린다** — src/core/audit/request-context.ts:18-23 주석(「프록시가 이 헤더를 자기 값으로 덮어쓰는 것이 그 전제다」) · docs/deploy.md:212 · tests/core/audit/request-context.test.ts:30 「x-forwarded-for의 첫 항목이 원 IP다 — 뒤 항목은 프록시 자신이다」. 전제(프록시 한 홉·127.0.0.1 바인딩)는 그대로 두되, 그 전제가 깨졌을 때 앱이 위조값을 믿지 않게 한다. 테스트가 못 박은 「첫 항목」 규약이 바뀌는 것이 이 제안의 핵심이다.
>
> 검증: 삭제 제안이 아니라 really_unused는 true. no_documented_reason은 **false**다 — `request-context.ts:18-23`이 「프록시가 이 헤더를 자기 값으로 덮어쓰는 것이 그 전제다」라고 이유를 적어 두었고 `docs/deploy.md:133-137`과 nginx 문단이 그 전제를 설정으로 강제한다. 그럼에도 기각하지 않는 근거: **그 전제는 첫 항목과 마지막 항목을 가르지 못한다.** 덮어쓰기가 지켜지면 항목이 정확히 하나라 두 해석의 값이 같고(그래서 nothing_lost=true), 두 해석이 갈리는 유일한 상황은 항목이 둘 이상 도착하는 덧붙임 오설정인데 — 그 상황에서 첫 항목은 바로 공격자가 지어 보낸 값이다. 즉 「첫 항목」을 선택으로 못 박은 …

---

#### sec-03 · `getMyStudentQr`에 `assertCan(actor, "pass:request")`를 넣어, pass 모듈에서 유일하게 권한 표 밖에 있는 발급 경로를 닫는다

**조건부** · 보안 · 위험 테스트필요 · **+10줄**

`src/modules/pass/request.service.ts`

`request.service.ts:301`의 함수 첫 줄에 `await assertCan(actor, "pass:request")`를 넣는다. 함께, 프로필이 없을 때 부르는 `recordDenied`(332-345)가 **사용자 id를 `targetType: "Pass"`의 targetId로** 넣고 있어 학생증 갈래는 `targetType: "StudentProfile"`로 남기게 가른다 — 지금은 감사로그가 「출입증 <사용자id>에 대한 pass:request 거부」라고 읽힌다. PARENT·ADMIN에게 나가는 오류 자체는 그대로 `ForbiddenError`라 화면 동작은 안 바뀐다; 바뀌는 것은 거부 기록의 모양과 판정 근거의 자리다.

**왜:** 이 파일의 다른 열두 서비스 함수는 전부 `assertCan`으로 시작하는데 이 하나만 아무 `can()`도 부르지 않는다. 학생증 코드는 정문에서 「이 학생이 지금 나가도 되는가」를 그 자리에서 판정하게 하는 자격증명인데, 발급 조건이 `StudentProfile` 행 하나 있느냐로만 서 있다. 그래서 이 동작이 `RULES` 표에 존재하지 않고 `tests/core/authz/can.test.ts`의 전수 대조가 덮지 못한다 — 권한 판정 경로를 `can()` 하나로 모은다는 CLAUDE.md 규칙 밖에 있는 유일한 pass 함수다. 함수 자신의 주석(291-296)이 「학생 본인만 받는다. 교사·보호자는 못 받는다」라고 규칙을 적어 두었는데 그 규칙을 강제하는 코드가 어디에도 없다.

**조건:** `assertCan(actor, "pass:request")`는 그대로 넣되, **거부 기록의 targetType은 `"StudentProfile"`이 아니라 `"User"`로 한다.** assertCan을 앞에 세우면 그 아래 `recordDenied` 갈래에 닿는 것은 「STUDENT인데 프로필 행이 없는」 경우뿐이고, 그때 가리킬 StudentProfile은 **존재하지 않는다** — 없는 대상 종류에 사용자 id를 넣으면 지금(`targetType: "Pass"`에 사용자 id)과 똑같은 종류의 거짓말이 된다. `targetType: "User", targetId: actor.id`가 정직한 기록이다. 함께 `recordDenied`에 targetType 인자를 더할 때 기존 두 호출부(`getPassDetail`·`assertOwnStudent`)의 `"Pass"`는 그대로 유지한다. 그리고 …

> **문서화된 결정을 건드린다** — src/modules/pass/request.service.ts:290-299 주석이 「학생 본인만」을 규칙으로 적어 두었으나 코드가 없다. can.ts의 `pass:request` 항목(STUDENT)이 이 동작을 표에 담을 자리다.
>
> 검증: 삭제가 아니므로 really_unused는 true. 문서화된 반대 이유는 없다 — `request.service.ts:290-299` 주석은 「학생 본인만 받는다」는 **규칙**을 적었을 뿐 can()을 빼 둔 **이유**가 아니고, CLAUDE.md는 반대로 「can()은 서비스 안에서도 호출한다(defense-in-depth)」·「권한 판정 경로는 can.ts 하나뿐」이라고 못 박는다. 코드로 재확인했다: 이 파일의 export 함수 중 …

---

#### sec-06 · 가입 직후 자동 로그인(`signInSilently`)이 만드는 세션도 감사로그에 남긴다

**조건부** · 보안 · 위험 테스트필요 · **+14줄**

`src/app/(auth)/register/actions.ts`

`register/actions.ts:250-258`의 `signInSilently`가 `auth.api.signInEmail`에 성공하면 `recordAudit({ actorUserId: <새 계정 id>, action: "auth:login", targetType: "User", targetId: <같은 id>, metadata: { via: "registration" } })`를 남긴다. 지금 이 함수는 실패를 통째로 삼키므로(가입 자체는 성공이라는 판단, 그대로 둔다) 성공 갈래에만 붙인다. 행위자 id는 `completeRegistration`/`createInitialAdmin`이 이미 만든 계정 id를 반환하게 하거나, `auth.api.signInEmail`의 응답에서 받는다 — `/login/submit`의 `signedInUserId`가 같은 일을 한다(submit/route.ts:100-107).

**왜:** 이 경로는 부트스트랩(최초 교사)과 초대코드 가입 둘에서 불리고, **그 계정의 첫 세션을 만드는 자리**다. 그런데 그 세션만 `auth:login` 없이 생긴다 — 감사로그를 로그인 기록으로 읽으면 모든 계정의 첫 로그인이 통째로 비어 있다. `registration:complete`·`account:bootstrap`은 「계정이 만들어졌다」를 말할 뿐 세션이 생겼다는 사실과 그때의 IP·UA를 남기지 않는다(둘 다 recordAudit이라 IP·UA는 들어가지만, 그 줄은 계정 생성 사실이고 로그인 기록으로 조회되지 않는다). 최초 교사 계정은 이 시스템에서 가장 권한이 큰 계정이고, 그 계정의 첫 세션이 어느 주소에서 열렸는지가 지금 어디에도 없다.

**조건:** (1) metadata를 **기존 `auth:login` 행과 같은 모양**으로 맞춘다 — `auth:login`에는 `METADATA_FORMATTERS` 항목이 없어(labels.ts:486-511 확인) 모르는 키가 그대로 「via registration」처럼 영문으로 화면에 찍힌다. 최소한 `/login/submit`이 쓰는 `maskEmail`과 같은 규칙의 마스킹 이메일을 함께 싣고, `via`를 남기려면 `METADATA_FORMATTERS["auth:login"]` 포맷터를 같이 넣거나 `FIELD_LABELS`가 아는 키를 쓴다. (2) 행위자 id는 **`auth.api.signInEmail`의 응답에서 받는다** — `completeRegistration`·`createInitialAdmin`이 id를 반환하게 고치는 쪽은 서비스 시그니처와 그 테스트까지 범위가 번진다. (3) 성공 갈래에만 붙이고 기록 실패는 삼킨다(지금 catch가 가입 성공을 지키는 이유가 …

---

#### sec-04 · 미결 첨부의 소유권 거부에도 `authz:denied`를 남긴다 — 첨부 경로의 유일한 IDOR 시도가 기록 밖이다

**조건부** · 보안 · 위험 안전 · **+20줄**

`src/modules/community/attachment.service.ts`

`attachment.service.ts:198-200`의 맨 `throw new ForbiddenError("community:attachment:read")`를, 같은 모듈이 이미 쓰는 모양의 헬퍼로 바꾼다 — `board.service.ts:26-43`의 `denyAccess`, `post.service.ts:30-48`의 `denyOwnership`과 글자 그대로 같은 짜임(try/recordAudit(action:"authz:denied", targetType:"CommunityAttachment", targetId, metadata:{action})/catch 삼킴 → throw). 이 파일에 `denyOwnership(actor, attachmentId)`를 하나 두고 그 자리에서 부른다.

**왜:** 미결 첨부(`postId: null`)는 **글에 붙기 전 상태**라 게시판 읽기 권한으로 가릴 수 없고, 그래서 소유자 대조가 유일한 문이다. 남의 첨부 id를 찍어 보는 것이 이 모듈에서 실제로 시도 가능한 유일한 IDOR인데, 바로 그 거부만 감사로그에 안 남는다. CLAUDE.md 오류 규약이 「`can()`만으로 못 가르는 거부(소유권 검사 등)는 `ForbiddenError`를 직접 던지고 같은 방식으로 감사로그를 남긴다」고 못 박은 자리이고, 커뮤니티 모듈의 다른 네 거부(board 읽기·쓰기, post 소유권, comment 소유권)는 전부 그 규약을 지킨다 — 여기 하나만 규약 밖이다. 내려받기 라우트가 403과 404를 일부러 구분하지 않으므로(존재하는 id 열거를 막으려고), 기록이 없으면 이 시도는 서버 어디에도 흔적이 남지 않는다.

**조건:** 거부 기록을 단언하는 테스트를 **함께** 넣는다. `tests/modules/community/`에서 `authz:denied`를 단언하는 곳은 `board.service.test.ts:310` 한 곳뿐이라, 테스트 없이 넣으면 다섯 번째 거부 경로가 또 무검증으로 늘어난다. 최소 두 케이스다 — 「남의 미결 첨부를 요청하면 authz:denied가 targetType `CommunityAttachment`·targetId 첨부id·metadata.action `community:attachment:read`로 남는다」와 「`uploaderUserId`가 null인 첨부(올린 계정이 지워진 경우)도 같은 기록을 남긴다」. 헬퍼 이름은 `post.service.ts`의 `denyOwnership`과 같게 두어 세 파일이 같은 모양으로 읽히게 한다.

---

#### sec-07 · 명단 미리보기가 전교생 개인정보를 브라우저로 보내면서 기록을 안 남긴다 — `roster:preview`를 추가한다

**조건부** · 보안 · 위험 안전 · **+20줄**

`src/modules/enrollment/roster.service.ts` · `src/modules/audit-log/audit-log.labels.ts`

`roster.service.ts:68`의 `previewRoster`가 반환 직전에 `recordAudit({ actorUserId: actor.id, action: "roster:preview", targetType: "AcademicYear", targetId: String(year), metadata: { year, fileRows: rows.length, existing: existing.length, missingFromFile: plan.missingFromFile.length } })`를 남긴다 — `exportRoster`(110-129)가 이미 쓰는 것과 같은 모양이고, 같은 이유로 **이름은 싣지 않는다**(감사로그가 명단 사본이 되면 안 된다). `audit-log.labels.ts`의 `AUDIT_ACTIONS`·`LABELS`·톤 표에 `roster:preview`를 등록한다.

**왜:** `exportRoster`의 주석(102-108)은 자기 자신을 「전교생의 이름·생년월일·학생코드가 한 번에 파일로 나가는 **유일한** 경로」라 부르고 그래서 읽기인데도 감사로그를 남긴다고 적는다. **그 문장이 사실이 아니다.** `previewRoster`는 `repo.listExisting(year)`로 DB의 그 학년도 명단 전체를 읽고, 그중 파일에 없는 학생을 `plan.missingFromFile: ExistingStudent[]`(이름·생년월일·학생코드가 든 행)로 그대로 돌려주며 화면이 학생코드까지 그린다(import-form.tsx:327). 한 줄짜리 파일을 올리면 나머지 전교생이 통째로 `missingFromFile`이 되어 브라우저로 나가는데, 이 경로에는 감사로그가 한 줄도 없다 — 교사 계정 하나가 털렸을 때 「누가 언제 명단을 통째로 받아갔나」를 물으면 export만 답하고 preview는 침묵한다. 아무것도 저장하지 않는 읽기라도 개인정보가 통째로 나가는 자리라 기록이 필요하다는 판단은 이미 export에서 내려져 있다; 같은 판단이 같은 자료에 대해 한쪽에만 적용돼 있다.

**조건:** (1) `roster.service.ts:67`의 「아무것도 저장하지 않는다」와 `102-108`의 「**유일한** 경로」 두 문장을 함께 고쳐 적는다 — 제안이 이미 포함하고 있다. (2) `AUDIT_ACTIONS`·`ACTION_LABELS`·`ACTION_TONES` 셋에 `roster:preview`를 나란히 넣고, `METADATA_FORMATTERS`에도 `exportSummary`와 같은 계열의 포맷터를 붙인다 — 안 붙이면 화면에 `fileRows 1 · existing 312 · missingFromFile 311`처럼 영문 키가 그대로 찍힌다(`formatAuditMetadata`의 폴백 동작을 확인했다). (3) **metadata에 이름·생년월일·학생코드를 절대 싣지 않는다** — export가 count만 남기는 이유(「이름을 실으면 감사로그 자체가 명단 사본이 된다」)가 여기서 더 강하게 적용된다. (4) 서비스 테스트를 함께 넣어 새 감사 행의 …

> **문서화된 결정을 건드린다** — roster.service.ts:67 「미리보기. **아무것도 저장하지 않는다.**」 — 감사로그 한 줄이 이 문장을 글자 그대로 깨뜨리므로 주석을 「업무 데이터를 저장하지 않는다. 누가 명단을 받아갔는지는 남긴다」로 고쳐 적는다. 함께 roster.service.ts:102-108의 「유일한 경로」도 바로잡는다.
>
> 검증: 삭제가 아니므로 really_unused는 true. 제안의 핵심 주장인 「export가 유일한 경로가 아니다」를 원본에서 전부 확인했다 — `roster.plan.ts:5-17`의 `ExistingStudent`가 `studentCode`·`name`·`birthDate`를 들고 있고, `RosterPlan.missingFromFile`(50행)이 그 타입 배열 그대로이며, `previewRoster`(68-99)는 `repo.listExisting(year)`로 그 학년도 전체를 읽어 `plan`을 그대로 반환하고, 화면(`app/(app)/admin/students/import/import-form.tsx:319-327)이 `missingFromFile`을 돌며 `s.studentCode`까지 …

---

#### sec-05 · 로그아웃에 감사로그를 남긴다 — 세션이 사라지는 순간만 기록이 없다

**조건부** · 보안 · 위험 테스트필요 · **+30줄**

`src/app/api/auth/[...all]/route.ts` · `src/modules/audit-log/audit-log.labels.ts`

`[...all]` 라우트의 `guarded`에서 `POST sign-out`인 경우에만, Better Auth 핸들러에 넘기기 **전에** `getSessionUser()`로 행위자를 집고(쿠키가 지워지면 누구였는지 알 수 없다) 응답이 2xx면 `recordAudit({ action: "auth:logout", targetType: "User", targetId: user.id })`를 남긴다. 기록 실패는 `/login/submit`의 `recordLoginAttempt`와 같은 이유로 삼킨다 — 세션 삭제는 Better Auth 안에 있어 같은 트랜잭션에 묶을 수 없고, 묶이지 않는 기록 때문에 로그아웃이 실패하면 안 된다. `audit-log.labels.ts`의 `AUDIT_ACTIONS`·`LABELS`·톤 표 셋에 `auth:logout`(「로그아웃」·neutral)을 나란히 등록한다.

**왜:** `auth:login`·`auth:login-failed`는 남기면서 로그아웃만 없다. 그래서 감사로그로 「이 계정의 세션이 언제부터 언제까지 살아 있었나」를 못 읽는다 — 계정이 털렸을 때 확인할 첫 자료가 그것이다. 화이트리스트가 `sign-out`을 Better Auth로 통과시키는 지금 구조에서는 이 라우트가 기록을 걸 수 있는 유일한 자리다(`components/app-shell/sign-out-button.tsx:20`의 `authClient.signOut()`이 유일한 호출부라 다른 진입점이 생길 여지도 없다). 「모든 생성/수정/삭제는 `recordAudit`을 남긴다」에서 verification 모듈만이 명시된 예외인데, 세션 삭제는 그 예외 목록에 없다.

**조건:** (1) 라우트 테스트를 함께 넣는다 — 응답이 2xx일 때만 남는가, 실패 응답이면 안 남는가, `sign-out`이 아닌 허용 엔드포인트에는 안 붙는가, 세션이 이미 없으면 기록 없이 통과하는가. `tests/app/api/auth/route.test.ts`가 `toNextJsHandler`를 목으로 잡고 있어 그대로 붙일 수 있다. (2) 라벨·주석이 **완전한 세션 종료 기록인 척하지 않게** 문구를 좁힌다 — 만료로 죽는 세션과 `account:change-password`가 쓸어 없애는 세션은 여전히 `auth:logout`을 남기지 않는다. `AUDIT_ACTIONS`의 「세션이 생기고 사라지는 순간」 주석도 그 범위에 맞춰 손본다. (3) `getSessionUser()`는 **반드시 핸들러 호출 전**에 부른다(쿠키가 지워진 뒤에는 행위자를 알 수 없다) — 제안대로다. (4) 기록 실패는 `recordLoginAttempt`와 같은 이유로 삼키고 …

> **문서화된 결정을 건드린다** — CLAUDE.md 「verification 모듈은 감사로그 예외다」가 예외를 하나로 못 박는다 — 로그아웃은 그 예외가 아니다.
>
> 검증: 삭제가 아니므로 really_unused는 true. 문서화된 반대 이유는 없다 — 오히려 두 군데가 이 제안 쪽을 가리킨다. `audit-log.labels.ts:22`의 주석이 「**세션이 생기고 사라지는 순간**」이라고 적어 두고는 `auth:login`·`auth:login-failed` 둘만 등록해 두었고, CLAUDE.md는 감사로그 예외를 verification 모듈 하나로 못 박는데 세션 삭제는 거기 없다. 라우트가 유일한 자리라는 것도 확인했다 — `authClient`를 쓰는 화면은 `sign-out-button.tsx` 하나뿐이고 `/api/auth/sign-out`은 `SAFE_ENDPOINTS.POST`로 통과한다. 라우트에 기록을 두는 것이 「라우트는 얇게」 규칙을 깨는가도 …

---

### 복잡성 — 상벌점·전자출입증 (6건)

#### cx-merit-pass-02 · classSummaries를 지우고 listClassRoster 결과를 반별로 접는 순수 함수로 바꾼다

**조건부** · 통합 · 위험 테스트필요 · **-45줄**

`src/modules/merit/merit.repo.ts` · `src/modules/merit/stats.service.ts` · `tests/modules/merit/merit.stats-scope.test.ts` · `tests/modules/merit/stats.ranking.test.ts`

merit.repo.ts:936-1012의 classSummaries(77줄)를 통째로 지운다. 그 자리에 stats.service(또는 새 merit.class.ts)에 `foldClasses(rows)` 순수 함수(약 28줄)를 둔다 — listClassRoster가 이미 학생 한 명당 KindTotals를 주므로 (grade·classNo)로 모아 students·net·avgNet을 계산하면 끝이다. getRankingStats는 지금 scope 유무로 listClassRoster를 두 번 갈라 부르고 classSummaries를 따로 부르는데(질의 4개), listClassRoster 한 번으로 학생 줄과 반 요약을 함께 얻는다(질의 2개). getMeritStats는 scope가 없을 때만 classRoster를 안 부르던 것을 늘 부르고, studentProfileIds는 지금처럼 scope가 있을 때만 넘긴다.

**왜:** 같은 재적 술어(`year·status:"ENROLLED"`)와 같은 groupBy가 repo 안에서 두 번 조립된다. classSummaries 주석 자체가 「listClassRoster와 같은 술어다. 반이 없는 학생만 더 뺀다」고 적어 두 곳이 손으로 맞춰져 있음을 인정한다 — 한쪽만 고치면 머리글 합계와 반별 현황이 다른 학생을 세고, 그것이 이 화면에서 가장 설명하기 어려운 어긋남이다. classSummaries의 `classId: { not: null }`은 접을 때 grade·classNo가 null인 줄을 건너뛰는 것과 같은 결과라 술어가 하나로 줄어도 잃는 것이 없다.

**조건:** (1) getRankingStats는 scope가 있어도 listClassRoster를 **무범위로** 부르고 학생만 걸러야 한다 — 지금 classes는 scope와 무관하게 전교 반 순위를 내므로, 범위를 준 roster를 접으면 「반 순위」가 고른 반 한 줄로 무너지고 rank가 늘 1이 된다. (2) foldClasses는 classSummaries의 avgNet 반올림(Math.round(net/students*10)/10)을 그대로 옮겨야 한다 — rankClasses가 avgNet 동점으로 등수를 가르므로 반올림이 빠지면 반 등수가 조용히 바뀐다. (3) merit.repo.ts:900-913 enrolledStudentScope 주석이 classSummaries를 「모집단을 정하는 기준 술어」로 지목한다 — 지우지 말고 listClassRoster를 가리키도록 다시 쓴다. (4) 제안이 적은 파일 목록이 모자란다. 함께 고쳐야 하는 것: …

> **문서화된 결정을 건드린다** — merit.repo.ts:936-940·948의 classSummaries 주석(「목록과 합계를 따로 질의해 잇는다」·「listClassRoster와 같은 술어다」) — 질의를 따로 두는 이유였던 「기록 없는 반이 빠진다」는 명단을 먼저 읽는 방식이 유지되므로 그대로 지켜진다
>
> 검증: classSummaries의 두 호출부는 stats.service의 getMeritStats·getRankingStats 둘뿐이고 둘 다 이번 재작성 대상이다(그 밖에는 타입 참조와 테스트뿐). 문서화된 이유 — 「목록과 합계를 따로 질의해 잇는다: groupBy만 쓰면 기록 없는 반이 빠진다」 — 는 명단을 먼저 읽는 listClassRoster가 그대로 지킨다. classId not null 제외분도 grade·classNo가 null인 줄을 건너뛰는 것과 결과가 같고, 「반 미배정은 머리글에 들고 반별 표에는 없다」는 성질이 유지된다. 권한·감사로그·트랜잭션은 건드리지 않는다. 다만 반 순위와 avgNet 반올림, 그리고 제안이 빠뜨린 다섯 개 테스트 파일이 조건이다.

---

#### cx-merit-pass-03 · topRules와 ruleStats를 규정별 집계 하나로 합치고 currentRuleNames를 지운다

**조건부** · 통합 · 위험 테스트필요 · **-35줄**

`src/modules/merit/merit.repo.ts` · `src/modules/merit/stats.service.ts`

merit.repo.ts:1005-1049(topRules)와 1051-1062(currentRuleNames)를 지우고, ruleStats(1101-1134)에 studentScope 한 줄을 더해 `awardsByRule(params)` 하나로 만든다 — 두 함수는 `groupBy(["ruleId","label","kind"])` + 같은 where + 규정 행 조회로 완전히 같다. 서비스의 foldTopRules는 지금 repo가 붙여 준 label을 쓰는데, getRuleStats가 이미 하는 것과 같은 방식(`rules`로 만든 Map에서 현재 이름을 집는다)으로 바꾼다.

**왜:** 같은 질의가 repo에 두 벌 있고, 「부여 기록의 label은 스냅샷이므로 규정의 현재 이름으로 바꾼다」는 규칙이 두 계층에 각각 구현돼 있다 — repo의 currentRuleNames와 stats.service:518-521의 `rule?.label ?? row.label`이 같은 문장을 두 번 적는다. 규칙이 두 곳이면 규정 이름 수정 뒤의 표시가 화면마다 갈릴 수 있다.

**조건:** (1) 두 호출부의 모집단을 지금 그대로 둔다 — getRuleStats는 scope를 넘기지 않고, getMeritStats만 rosterYear·studentProfileIds를 넘긴다. (2) merit.repo.ts:1005-1013의 「ruleId로 묶고 자르지 않는다」 주석은 남기고, 「보여줄 이름은 규정의 현재 이름이다」 주석은 stats.service의 foldTopRules 자리로 옮겨 적는다(그쪽에 이미 같은 문장이 있으므로 한 번만 남게 합친다). (3) **01과 함께 채택할 수 없다** — 01이 studentScope의 rosterYear를 필수로 만들면 합쳐진 awardsByRule의 호출부인 getRuleStats도 rosterYear를 넘겨야 하고, 그 순간 규정별 화면이 졸업·퇴학생 부여분을 빼고 세게 된다. 사람이 정할 동작 변경이지 리팩터링의 부산물이 되어선 안 된다. (4) 테스트 여섯 파일을 함께 고친다: …

> **문서화된 결정을 건드린다** — merit.repo.ts:1005-1013 topRules 주석(「ruleId로 묶고 자르지 않는다 — 접는 일도 자르는 일도 서비스가 한다」)은 그대로 유지된다. 다만 「보여줄 이름은 규정의 현재 이름이다」를 repo가 맡던 것을 서비스로 옮기는 것이라 그 주석은 함께 옮겨 적어야 한다
>
> 검증: topRules의 호출부는 stats.service.ts:312, ruleStats는 488 하나씩이고 둘 다 재작성 대상이다. 다만 제안의 「두 함수는 완전히 같다」는 사실이 아니다 — topRules에는 studentScope가 있고 ruleStats에는 없으며, 규정 select도(category·active) 반환 모양도 다르다. 그 차이가 곧 모집단 차이라 합치는 순간 「어느 화면이 누구를 세는가」가 인자 하나에 걸린다. 성질(권한·감사로그)은 잃지 않고 이름 해석 규칙이 한 곳으로 모이는 이득은 실재하므로, 모집단 고정·주석 이전·01과의 배타를 조건으로 붙인다.

---

#### cx-merit-pass-09 · 통계 페이지의 네 갈래 분기를 갈래표 하나로 접는다

**조건부** · 단순화 · 위험 테스트필요 · **-35줄**

`src/app/(app)/merit/stats/page.tsx`

page.tsx:88-166의 네 개 `if (view === …)` 블록(각 18줄, 로더·Hint·Body·Skeleton 이름만 다르고 Suspense·boundaryKey·Layout 배선이 똑같다)을 갈래별 항목 하나짜리 표로 바꾼다. 약속 타입이 갈래마다 달라 제네릭 렌더 함수(`renderView<T>(load, Hint, Body, Skeleton, ctx)`)로 묶고, 표의 각 항목은 그 함수를 부르는 세 줄이 된다.

**왜:** 같은 배선이 네 번 복사돼 있고, 그 배선 중 하나라도 빠지면 화면이 조용히 틀린다 — 파일 안 주석이 바로 그 함정을 적어 둔다(「key가 없으면 탭을 눌러도 안 바뀐 것처럼 보인다」). 다섯째 갈래를 넣을 때 네 줄이 아니라 열여덟 줄을 복사하게 되는 구조다.

**조건:** (1) 제네릭이 갈래별 prop 타입을 지우면 안 된다 — 넷은 이름만 다른 게 아니다: loadRanking·loadOverview만 scope를 받고, RulesHint는 track이 없으며, Body의 prop이 각각 {track, href}·{ }·{track}·{track, statsHref}이고 RankingSkeleton만 scoped를 받는다. 표 항목은 이 차이를 클로저로 담되 `any`·캐스트 없이 각 약속 타입 T가 Hint·Body에 그대로 이어져야 한다(그러지 못하면 지금의 명시 분기가 낫다). (2) Suspense key(boundaryKey)를 두 경계 모두에 유지한다 — 주석이 적어 둔 함정이다. (3) 표를 컴포넌트 참조와 로더 호출로만 채워 page.tsx:50-55의 「아무것도 await 하지 않는다」를 깨지 않는다. (4) 갈래 넷을 도는 화면 테스트가 없으므로 최소한 갈래별 전환에서 옛 내용이 남지 않는지 확인하고 넘어간다.

> **문서화된 결정을 건드린다** — page.tsx:50-55의 「아무것도 await 하지 않는다 — 한 번이라도 멈추면 이 함수 전체가 서지 못한다」. 갈래표는 컴포넌트 참조만 담고 로더는 호출만 하므로 이 성질은 유지된다
>
> 검증: 삭제가 아니라 배선 정리이고, 문서화된 성질(await 금지, boundaryKey) 둘 다 유지된다. 다만 제안의 「이름만 다르다」는 사실이 아니라서 제네릭 하나로 묶으려면 갈래별 prop 차이를 타입으로 살려야 하고, 그 대가로 줄 이득도 제안의 -48보다 작다(81줄이 45줄쯤이 된다). 권한 검사는 페이지 맨 위 requirePermission 한 줄이라 이 변경에 닿지 않는다.

---

#### cx-merit-pass-05 · 상벌점·출입증의 죽은 코드 여덟 조각을 지운다

**채택** · 삭제 · 위험 안전 · **-30줄**

`src/modules/merit/merit.repo.ts` · `src/modules/merit/threshold.service.ts` · `src/modules/pass/pass.error.ts` · `src/app/(app)/pass/actions.ts` · `src/app/(app)/admin/merit/rules/rule-table.tsx` · `src/app/(app)/merit/stats/views/teacher-chart.tsx` · `src/components/merit/charts.tsx`

(1) merit.repo.ts:267-280 upsertThreshold — 호출부 0. (2) merit.repo.ts:233-241 isThresholdCreateConflict의 첫 조건은 둘째 조건(P2002)에 완전히 흡수되므로 헬퍼를 지우고 P2002 검사만 남긴다(isUniqueViolation import도 함께 빠진다). (3) merit.repo.ts:1097 findUserNames의 email select — 아무도 읽지 않는다. (4) threshold.service.ts:73 listThresholdSettings의 isMeritTrack 필터 — MERIT_TRACKS를 돌며 만드므로 아무 일도 하지 않는다. (5) rule-table.tsx:33 RuleRow.active. (6) teacher-chart.tsx:79 도달할 수 없는 빈 상태 분기. (7) charts.tsx:185 ClassNetChart 위에 겹친 옛 문서 주석. (8) pass.error.ts:23의 PASS_NOT_ACTIVE 행과 actions.ts:46의 같은 MESSAGES 항목 — 아무 데서도 던지지 않는다.

**왜:** 여덟 조각 모두 직전 감사가 확정한 죽은 코드이고, 그중 셋은 그 전 감사에서도 「기존-미처리」로 넘어온 것이다. upsertThreshold는 @deprecated가 붙은 채 남아 있어 다음 사람이 낙관적 잠금을 건너뛰는 길로 쓸 수 있고, PASS_NOT_ACTIVE는 오류표가 실제 코드 목록이라고 선언해 둔 표에 없는 코드를 싣고 있다.

---

#### cx-merit-pass-01 · 통계 집계 9개가 각자 조립하는 where를 activeAwardWhere(scope) 하나로 모은다

**조건부** · 단순화 · 위험 테스트필요 · **-10줄**

`src/modules/merit/merit.repo.ts`

`track` + `status:"ACTIVE"` + 학년도 삼항 + 모집단 술어를 조립하는 `activeAwardWhere(params)` 하나를 만들고, totals·listClassRoster·teacherTotals·awardsByRule·unusedRules·trackTotals·demeritTotalsByStudent·listAwardsForChart·trackTotalsBetween의 where를 그것으로 바꾼다. enrolledStudentScope와 studentScope는 그 안으로 접어 넣고, studentScope의 `rosterYear === undefined ? {} : …` 갈래는 지운다 — rosterYear를 필수로 만든다. listAwardsForChart의 인자 이름 `year`도 `totalsYear`로 맞춘다.

**왜:** `...(params.totalsYear === null ? {} : { year: params.totalsYear })`가 파일 안에 11번 있고 `status:"ACTIVE"`가 12번 있다. 「합계를 셀 학년도」라는 한 규칙이 아홉 군데에 복사돼 있어, 한 곳을 빠뜨려도 타입 검사도 lint도 잡지 못한다(직전 감사 merit-5-R02가 8개 집계 중 둘만 검증된다고 적었다). 더 나쁜 것은 studentScope의 undefined 갈래다 — 운영 호출부가 전부 rosterYear를 넘기므로 지금은 죽은 갈래인데, 새 호출부가 rosterYear를 빠뜨리면 조건이 통째로 사라져 졸업생까지 세는 집계가 조용히 만들어진다.

**조건:** (1) trackTotalsBetween은 제외한다 — merit.repo.ts:1176-1186 주석이 「학년도로 자르지 않는 게 핵심이다. 함께 걸면 2월 며칠치가 소리 없이 빠져 "이번 주는 조용했다"로 읽힌다」고 그 부재의 이유를 못 박는다. 학년도를 다루는 헬퍼에 태우면 나중에 기본값이 하나 생기는 순간 그 결함이 되살아난다. (2) unusedRules도 제외한다 — where가 MeritRule의 중첩 `awards: { none: … }`이라 모양이 다르고, 거기에 모집단 조건을 넣으면 「졸업생만 쓴 규정」이 안 쓰인 규정으로 분류된다. (3) rosterYear를 필수로 만들면 지금 rosterYear 없이 부르는 repo 단위테스트를 함께 고쳐야 한다 — tests/modules/merit/merit.repo.totals.test.ts의 CASES(trackTotals·topRules·listAwardsForChart를 인자 없이 부른다). (4) …

> **문서화된 결정을 건드린다** — merit.repo.ts:927-933 studentScope 주석의 「둘 다 없으면 조건이 없다 — 학년도가 없는 옛 호출부가 그대로 돌아간다」. 그 옛 호출부가 이제 없으므로 전제가 무너졌다(아래 근거)
>
> 검증: 운영 호출부는 stats.service.ts:310·312·313 셋뿐이고 모두 rosterYear를 넘긴다 — studentScope 주석이 말하는 「학년도가 없는 옛 호출부」는 src/에 남아 있지 않으므로 그 갈래를 지우자는 전제는 실제로 무너졌다(남은 무인자 호출부는 repo 단위테스트뿐이라 함께 고치면 된다). 죽은 갈래를 지우는 쪽이 안전한 것도 맞다: 새 호출부가 rosterYear를 빠뜨리면 조건이 통째로 사라져 졸업생까지 세는 집계가 조용히 만들어진다. 다만 아홉을 다 한 헬퍼에 태우려는 범위가 넓다 — 학년도 필터의 **부재**가 문서화된 trackTotalsBetween과 술어 모양이 다른 unusedRules를 빼야 문서화된 이유를 지우지 않는다. 줄 이득도 제안의 -30보다 훨씬 …

---

#### cx-merit-pass-08 · 출입증 상태 집합을 pass-type.ts 한 곳으로 모은다

**조건부** · 경계 · 위험 안전 · **+4줄**

`src/core/authz/pass-type.ts` · `src/modules/pass/pass.repo.ts` · `src/modules/pass/decision.service.ts`

`LIVE_STATUSES = ["REQUESTED","CONSENTED","APPROVED"]`를 pass-type.ts에 DECIDABLE_STATUSES 옆에 두고, pass.repo의 세 리터럴(listForVerify·listLiveForStudent·findOverlapping)과 decision.service의 CANCELLABLE 상수를 그것으로 바꾼다. pass.repo의 listPendingForAdmin이 손으로 적어 둔 `["REQUESTED","CONSENTED"]`는 DECIDABLE_STATUSES로 바꾼다(주석이 이미 「끝난 것은 결재할 수 없어 뺀다」고 같은 말을 한다).

**왜:** 상태 기계의 절반은 pass-type.ts에 상수로 있고 나머지 절반은 repo와 서비스에 문자열 리터럴로 흩어져 있다. 같은 세 상태 묶음이 네 곳에, 결재 가능한 두 상태가 두 곳에 각각 적혀 있어 상태를 하나 더하는 날 다섯 곳을 손으로 찾아야 한다 — 한 곳을 빠뜨리면 겹침 검사에 안 걸리는 출입증이나 결재 목록에 안 뜨는 신청이 생긴다.

**조건:** (1) decision.service.ts:33의 CANCELLABLE은 같은 상수로 갈아끼우지 말고 제 이름·제 주석으로 남긴다 — 「아직 끝나지 않은 상태」와 「취소할 수 있는 상태」는 오늘 값이 같을 뿐 같은 개념이 아니고, 하나로 묶으면 취소 정책을 바꾸는 날 findOverlapping의 겹침 검사가 함께 흔들린다(제안이 막겠다는 실패의 정반대 방향이다). CANCELLABLE = [...LIVE_STATUSES]처럼 값만 잇는 것도 같은 이유로 하지 않는다. (2) pass-type.ts의 isRevocable 주석이 「서비스의 CANCELLABLE보다 좁다」로 서비스를 가리키므로, 상수 자리를 옮기지 않는다면 이 문장은 그대로 두고 LIVE_STATUSES 주석에 「취소 가능과는 다른 개념」을 한 줄 적는다. (3) 타입: DECIDABLE_STATUSES·LIVE_STATUSES가 `readonly PassStatus[]`라 `status: { in: [...] …

> **문서화된 결정을 건드린다** — pass-type.ts:isRevocable 주석의 「서비스의 CANCELLABLE(REQUESTED·CONSENTED·APPROVED)보다 좁다」 — CANCELLABLE이 pass-type.ts로 옮겨 오면 이 문장의 「서비스의」를 고쳐 적어야 한다
>
> 검증: repo 전체를 훑어 리터럴이 넷(pass.repo.ts:92·144·296과 decision.service.ts:33)과 둘(pass.repo.ts:160, pass-type.ts:64)뿐임을 확인했다. 앞 셋(listForVerify·listLiveForStudent·findOverlapping)은 「아직 끝나지 않은 출입증」이라는 한 개념이라 상수 하나로 모으는 것이 옳고, listPendingForAdmin의 [REQUESTED, CONSENTED]는 DECIDABLE_STATUSES와 개념이 같다(주석도 「끝난 것은 결재할 수 없어 뺀다」로 같은 말을 한다). 값이 바뀌지 않으므로 리터럴을 배열로 단언하는 테스트들(decision.service.test.ts:145·192·361·493, …

---

### 복잡성 — 커뮤니티·명단·계정 (9건)

#### cx-comm-roster-06 · 글·댓글의 deletedByUserId·deletedReason 네 열을 지운다 — 쓰기만 하고 읽는 곳이 없다

**채택** · 스키마 · 위험 테스트필요 · **-20줄**

`prisma/schema.prisma` · `src/modules/community/community.repo.ts` · `src/modules/community/post.service.ts` · `src/modules/community/comment.service.ts` · `tests/modules/community/post.service.test.ts` · `tests/modules/community/comment.service.test.ts`

CommunityPost·CommunityComment에서 deletedByUserId·deletedReason을 지운다(마이그레이션 하나). markPostDeleted·markCommentDeleted가 받던 actorUserId·reason 인자를 뺀다 — 서비스는 그 값을 감사로그에 넣는 일만 계속한다. deletedAt은 그대로 둔다(글이 안 보이게 하는 근거다).

**왜:** 네 열 모두 쓰기만 되고 읽는 코드가 없다. 「누가 왜 지웠나」는 같은 트랜잭션이 남기는 감사로그(community:post:delete의 actorUserId·metadata.reason·metadata.byModerator)가 이미 완전하게 답하고, 화면·API 어디서도 이 열을 조회하지 않는다. 게다가 deletedByUserId는 이 스키마가 사람을 참조할 때 지키는 규약(SetNull + 이름 스냅샷)을 혼자 안 따른다 — 관계 선언도 없는 맨 문자열이라, 계정을 물리 삭제하면 존재하지 않는 id를 가리키는 값으로 남는다. 두 갈래가 같은 사실을 저장하는 상태라 나중에 둘이 어긋난다.

> **문서화된 결정을 건드린다** — prisma/schema.prisma:652-653의 「작성자는 SetNull + 이름·역할 스냅샷이다 — 과거의 사실이 살아 있는 외래키에 기대면 안 된다」 규약. 이 제안은 그 규약을 어기는 두 열을 없애 규약을 하나로 되돌린다.
>
> 검증: 셋 다 통과한다. (가): `grep -rn 'deletedByUserId\|deletedReason' src/ tests/ --exclude-dir=generated` 결과가 community.repo.ts:243·350의 쓰기 둘뿐이고 읽기가 하나도 없다 — 화면·API·테스트 어디에도 없어 「테스트 전용」에도 해당하지 않는다. (나): 이 두 열에는 보존 이유가 적혀 있지 않고, 오히려 schema.prisma:652-653의 「작성자는 SetNull + 이름·역할 스냅샷이다 — 과거의 사실이 살아 있는 외래키에 기대면 안 된다」 규약을 이 열들만 어긴다(관계 선언 없는 맨 문자열이라 계정을 물리 삭제하면 없는 id를 가리킨다). 제거가 규약 쪽으로 되돌리는 일이다. (다): 「누가 왜 지웠나」가 …

---

#### cx-comm-roster-08 · 커뮤니티 죽은 코드 셋을 지운다 — 내려받기 라우트의 덮이는 헤더·PostPage.total·댓글 폼 reset()

**조건부** · 삭제 · 위험 안전 · **-12줄**

`src/app/api/community/attachments/[...attachment]/route.ts` · `src/modules/community/post.service.ts` · `src/app/(app)/community/[slug]/[postId]/comment-form.tsx` · `tests/app/api/community/attachments/route.test.ts` · `tests/modules/community/post.service.test.ts`

셋을 한 커밋으로 지운다. ① 내려받기 라우트가 응답에 직접 거는 Content-Security-Policy와 X-Content-Type-Options를 지우고, 「전역 CSP는 페이지용이라 여기서 덮어쓴다」는 거꾸로 적힌 주석을 「이 응답의 CSP는 next.config.ts의 ATTACHMENT_HEADERS가 소유한다」로 고친다. Cache-Control은 전역에 같은 이름이 없으므로 그대로 둔다. ② PostPage.total 필드를 지운다(pageCount 계산에 쓰는 지역 변수는 남는다). ③ 댓글 폼의 명시적 reset() 호출과 그 useEffect를 지운다.

**왜:** 셋 다 아무 일도 하지 않는다. ①은 next.config.ts:110-119가 `/:path*` 뒤에 `/api/community/attachments/:id*`를 두어 같은 이름의 헤더를 덮으므로 라우트가 건 값이 응답에 안 나가고, 주석은 정반대를 말해 읽는 사람이 「여기를 고치면 CSP가 바뀐다」고 믿게 만든다. ②는 서비스가 계산해 돌려주지만 읽는 화면이 하나도 없다 — 형제 목록 셋은 모두 「총 N건」을 그리는데 이 목록만 안 그린다. ③은 React 19가 성공한 액션 뒤에 폼을 이미 reset하는 일을 한 번 더 하는 것이고, 의존성 때문에 두 번째 성공에서는 돌지도 않는다.

**조건:** ① ③(댓글 폼 reset())을 범위에서 뺀다 — 지우려면 실제 브라우저에서 연속 두 번 댓글을 달아 칸이 비는지 확인하고 comment-form.tsx:30-31 주석의 전제가 깨졌음을 근거로 적은 뒤 별도 커밋으로 한다. 지금 고칠 값어치가 있는 것은 useEffect 의존성이지 호출 자체가 아니다. ② ①에서 헤더를 지우면 tests/app/api/community/attachments/route.test.ts:212-214가 아무것도 보증하지 않는 단언이 된다 — next.config.ts의 headers() 규칙 순서를 검증하는 테스트로 옮기거나, 옮기지 않을 것이면 지우면서 그 이유를 테스트 파일에 남긴다. ③ route.ts의 거꾸로 된 주석을 「이 응답의 CSP·nosniff는 next.config.ts의 ATTACHMENT_HEADERS가 소유한다」로 고친다 — Cache-Control은 전역에 같은 이름이 없으므로 그대로 둔다는 사실도 함께 적는다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「첨부 응답의 CSP는 next.config.ts가 소유한다」가 이미 옳은 배치를 적어 두었다. 이 제안은 코드와 그 문장을 맞추는 일이다 — 규칙을 바꾸지 않는다.
>
> 검증: 셋 중 둘은 확인됐고 하나는 범위에서 빼야 한다. **①은 옳다** — next.config.ts:110-119가 전역 `/:path*` **뒤에** `/api/community/attachments/:id*`를 두고 주석에 「뒤에 오는 규칙이 같은 이름의 헤더를 덮는다… 실제로 확인했다」고 적었으며, ATTACHMENT_HEADERS(63-68)가 CSP·nosniff를 모두 포함한다. 그래서 route.ts:44-48이 건 값은 응답에 안 나가고, 그 자리의 주석 「전역 CSP는 페이지용이라 여기서 덮어쓴다」는 정확히 거꾸로다 — CLAUDE.md 「첨부 응답의 CSP는 next.config.ts가 소유한다」와도 어긋난다. **②도 확인됐다** — post.service.ts:120·149의 …

---

#### cx-comm-roster-07 · 글 수정의 첨부 대조(kept·existingIds 산수)를 attachToPost 조건 하나로 접는다

**조건부** · 단순화 · 위험 테스트필요 · **-8줄**

`src/modules/community/community.repo.ts` · `src/modules/community/post.service.ts` · `tests/modules/community/post.service.test.ts`

attachToPost의 where를 `{ id: { in: ids }, uploaderUserId, OR: [{ postId: null }, { postId }] }`로 넓힌다 — 「아직 안 붙은 내 첨부」와 「이미 이 글에 붙은 내 첨부」를 함께 센다. 그러면 updatePost에서 listAttachments 재조회와 existingIds·kept 계산(282-291행)을 통째로 지우고 검사가 `if (attached !== requested.length)` 한 줄이 된다 — createPost와 글자 그대로 같은 줄이다. detachFromPost의 allowAttachments 삼항 가드는 건드리지 않는다.

**왜:** 지금 코드는 「그대로 둔 첨부」와 「사라진 첨부」를 가르려고 트랜잭션 안에서 첨부를 한 번 더 조회해 kept를 세고, attach 결과와 더해 requested 길이와 맞춘다. 주석 스스로 「이 모듈에서 가장 미묘한 산수」라고 적어 둔 자리인데, 그렇게 미묘한 이유는 attachToPost가 `postId: null`만 고르기 때문이지 업무 규칙이 복잡해서가 아니다. 조건 한 줄을 넓히면 세는 개념 하나(kept)와 조회 한 번이 사라지고, 새 글과 수정이 같은 문장을 쓰게 된다. 막으려던 것(고아 정리가 그 사이 지운 첨부가 섞여 「일부만 사라진 글」이 조용히 저장되는 것)은 그대로 막힌다 — 지워진 행은 어느 조건에도 안 걸리므로 개수가 모자란다. 남의 첨부와 다른 글에 붙은 첨부도 그대로 막힌다.

**조건:** ① 먼저 테스트를 채운다 — tests/modules/community/post.service.test.ts가 늘 attachmentIds: []를 쓰므로, (그대로 둔 첨부만) · (새로 추가) · (일부 제거) · (고아 정리가 지운 id 섞임) · (남의 첨부 id) 다섯 갈래를 붙이고 나서 산수를 접는다. ② 감사로그 metadata의 attachmentsAdded 의미를 명시적으로 정한다 — 「새로 붙인 개수」를 유지하려면 넓힌 조건과 별개로 그 값을 따로 세거나, 이름을 attachments로 바꾸고 뜻이 바뀐 사실을 주석에 적는다. 소리 없이 바뀌게 두지 않는다. ③ Postgres에서 updateMany가 같은 값으로 갱신되는 행도 count에 넣는지 통합 테스트로 확인한다 — 이 제안의 개수 비교가 그 성질에 통째로 기댄다. ④ post.service.ts:282-291 주석을 지우고 attachToPost의 새 조건을 설명하는 주석으로 갈아 끼운다.

> **문서화된 결정을 건드린다** — post.service.ts:282-291의 「붙어 있던 것을 먼저 세어 둔다」 주석이 이 산수의 근거다. 그 주석이 설명하는 제약(attachToPost가 postId: null만 고른다)을 없애는 제안이므로 주석도 함께 지운다.
>
> 검증: 방향은 옳다 — attachToPost의 `postId: null` 제약이 kept 산수의 원인이고, where를 넓히면 createPost와 같은 한 줄이 된다. 남의 첨부·다른 글의 첨부·고아 정리가 지운 첨부는 그대로 막힌다는 논증도 맞다. 그러나 **제안이 놓친 것이 하나 있다**: post.service.ts:318의 감사로그 metadata `attachmentsAdded: attached`가 지금은 「새로 붙인 개수」인데, where를 넓히면 kept까지 세어 조용히 「이 글의 총 첨부 수」로 뜻이 바뀐다. 감사로그 필드의 의미가 코드 변경에 묻혀 달라지는 것은 (다)에 걸린다. (나)도 부분적으로 걸린다 — post.service.ts:282-291의 「붙어 있던 것을 먼저 세어 둔다」 …

---

#### cx-comm-roster-05 · 명단 조회(listExisting)에서 내보내기 전용 전교 스캔과 늘 false인 deleted 필드를 뺀다

**조건부** · 단순화 · 위험 테스트필요 · **0줄**

`src/modules/enrollment/roster.repo.ts` · `src/modules/enrollment/roster.service.ts` · `src/modules/enrollment/roster.plan.ts` · `tests/modules/enrollment/roster.repo.listExisting.test.ts` · `tests/modules/enrollment/roster.export.test.ts`

roster.repo에 listForExport(year)를 새로 두고, entrySeats(입학반·입학번호를 위해 Enrollment를 grade:1 조건으로 전부 훑는 조회)를 거기로 옮긴다. listExisting은 Promise.all을 버리고 StudentProfile 조회 하나만 남긴다. 결과에서 entryClassNo·entryNumber와 deleted를 뺀다. roster.plan.ts의 ExistingStudent.deleted 선택 필드도 지운다. exportRoster는 listForExport를 부르고 `existing.filter((s) => !s.deleted)` 한 줄을 버린다.

**왜:** 두 가지가 섞여 있다. 첫째, 입학반·입학번호는 내보내기 파일의 참고 열에만 쓰는데 그 조회가 미리보기와 확정에서도 돈다 — 확정 쪽은 AcademicYear에 FOR UPDATE를 걸고 120초까지 쥐는 트랜잭션 안이라, 전교의 상벌점 부여가 멈춰 있는 동안 아무도 안 쓸 Enrollment 전체 스캔이 한 번 더 돈다. 둘째, deleted는 같은 함수의 where가 이미 `user: { deletedAt: null }`로 걸러 낸 뒤 계산하므로 언제나 false이고, exportRoster의 필터는 아무도 못 거른다. 「내보내기용 열」과 「미리보기·확정용 명단」이 한 함수에 붙어 있는 것이 원인이다.

**조건:** ① schema.prisma의 User.deletedAt 주석에서 독자 #3의 「`deleted` 표시」 항목을 지운다 — 안 고치면 문서가 없는 독자를 가리킨다. ② roster.plan.ts:25의 ExistingStudent.deleted를 지우면 tests/modules/enrollment/roster.plan.test.ts:316의 「예전 deletedAt 표시가 남아 있는 입력」 블록이 함께 죽으므로 같은 커밋에서 정리한다. ③ tests/modules/enrollment/roster.repo.listExisting.test.ts:45(where 고정)는 남기고 60·82의 deleted 단언만 걷는다 — where 조건 자체가 이 제안의 안전 근거다. ④ listForExport의 유일한 호출자가 exportRoster임을 테스트로 고정하고, createRosterFingerprint의 출력이 변하지 않음을 확인한다(미리보기 토큰이 깨지면 진행 중이던 모든 확정이 …

---

#### cx-comm-roster-13 · 명단 2000줄 상한이 두 파일에 따로 박힌 것을 한 곳으로 모은다

**채택** · 경계 · 위험 안전 · **0줄**

`src/modules/enrollment/roster.parse.ts` · `src/modules/enrollment/roster.schema.ts`

roster.parse.ts:47의 `const MAX_ROSTER_ROWS = 2000`을 지우고 roster.schema.ts에서 export한 상수를 import한다. roster.schema.ts의 `.max(2000, …)`과 문구도 그 상수로 조립한다(파일 크기 상한 ROSTER_FILE_MAX_BYTES가 이미 그렇게 공유되고 있다).

**왜:** 같은 숫자가 파서와 스키마에 따로 적혀 있다. 한쪽만 올리면 「미리보기는 되는데 확정만 막히는」 구간이 생기고, 그 상태에서 교사가 보는 것은 파일을 아무리 고쳐도 안 되는 화면뿐이다. 바로 옆 XLSX_PREFLIGHT_LIMITS.maxCompressedBytes는 이미 roster.schema에서 가져오면서 「액션의 file.size 검사와 같은 값이어야 한다」고 주석까지 달아 두었는데, 줄 수만 그 규약 밖에 있다.

> **문서화된 결정을 건드린다** — roster.parse.ts:58-62의 「액션의 file.size 검사와 같은 값이어야 한다」 주석이 이미 상수 공유를 규약으로 삼았다. 줄 수를 그 규약에 편입한다.
>
> 검증: 셋 다 통과한다. 사실관계를 확인했다 — roster.parse.ts:47의 `MAX_ROSTER_ROWS = 2000`(66행 maxSheetRows가 쓴다)과 roster.schema.ts:93의 `.max(2000, …)`이 서로를 모르는 같은 숫자다. (나): 따로 두어야 할 이유가 적힌 곳이 없고, 오히려 바로 옆 roster.parse.ts:59-62가 「액션의 file.size 검사와 같은 값이어야 한다 (roster.schema의 ROSTER_FILE_MAX_BYTES)」는 주석과 함께 상수 공유를 이미 규약으로 삼았다 — 줄 수만 그 규약 밖에 있다. (다): 잃는 것이 없다. 값이 안 바뀌고 검사도 그대로다. 순환 위험도 없음을 확인했다 — roster.parse.ts:21이 이미 …

---

#### cx-comm-roster-11 · 학생이 만드는 학부모 초대코드가 무조건 무기한인 것을 고친다

**채택** · 보안 · 위험 동작변화 · **+2줄**

`src/modules/invites/invite.schema.ts` · `src/modules/invites/invite.service.ts` · `src/app/(app)/parent-invite/actions.ts` · `tests/modules/invites/invite.service.test.ts`

createParentInviteSchema에서 죽어 있는 expiresInDays를 뺀다. createParentInvite가 toExpiresAt(입력값) 대신 고정 만료(명단 반영이 쓰는 것과 같은 90일)를 쓰게 한다. 교사가 발급하는 세 경로(student·admin·parentFor)의 expiresInDays는 폼이 실제로 보내므로 그대로 둔다.

**왜:** 학생 화면의 액션은 `createParentInviteSchema.safeParse({ name: formData.get("name") })`로 이름만 넘긴다. 그래서 스키마에 선언된 expiresInDays는 언제나 undefined이고, toExpiresAt(undefined)는 null을 돌려주며, 학생이 만든 학부모 코드는 예외 없이 무기한이 된다. 같은 저장소가 명단 반영의 초대코드에는 「종이로 나눠주는 코드다. 무기한이면 잃어버린 종이가 영원히 유효하다」는 주석과 함께 90일을 건다. 종이로 나가는 코드가 학생 손을 거칠 때만 영원히 유효한 상태다.

> **문서화된 결정을 건드린다** — roster.service.ts:24-25의 INVITE_EXPIRES_DAYS 주석(「종이로 나눠주는 코드다. 무기한이면 잃어버린 종이가 영원히 유효하다」)이 이 값의 근거다. 같은 근거를 학부모 코드에도 적용한다.
>
> 검증: 셋 다 통과한다. (가): createParentInviteSchema의 소비자를 전수 확인했다 — app/(app)/parent-invite/actions.ts:32(학생 화면)와 invite.service.ts:115(타입만)뿐이다. 교사가 발급하는 세 경로는 각자 별도 스키마(createStudentInviteSchema·createAdminInviteSchema·createParentInviteForSchema)에서 expiresInDays를 따로 선언하므로 학생 쪽 하나에서 빼도 교사 폼은 영향이 없다. 제안의 「그대로 둔다」 주장이 사실이다. (나): 학부모 코드가 무기한이어야 한다는 이유는 어디에도 없다 — 액션이 `{ name: formData.get("name") }`만 파싱해 …

---

#### cx-comm-roster-10 · 고아 첨부 정리가 지운 파일마다 감사로그를 남기고, 거짓인 주석을 고친다

**조건부** · 보안 · 위험 안전 · **+18줄**

`src/modules/community/attachment.service.ts` · `src/modules/community/community.repo.ts` · `tests/modules/community/attachment.service.test.ts`

sweepMyOrphans가 걷어 낸 행마다 community:attachment:delete를 recordAuditMany로 한 번에 남긴다(명단 반영이 쓰는 것과 같은 방식이다). 정리 실패를 삼키는 성질은 그대로 두되 recordAudit을 같은 try 안에 둔다. attachment.service.ts:158의 「남의 행은 건드리지 않는다」와 community.repo.ts의 listStalePending 주석을 사실에 맞게 고친다 — 주인이 없어진 남의 미결 첨부도 함께 지운다고 적는다. 업로드 실패 보상 삭제(repo.deleteAttachments([id]))도 같은 액션으로 남긴다.

**왜:** 이 경로는 DB 행과 디스크 파일을 되돌릴 수 없이 지우면서 감사로그를 한 줄도 안 남긴다. CLAUDE.md는 감사로그 예외를 bootstrap·verification·seed-merit-rules 셋으로 못 박았고 여기는 그중 어느 것도 아니다. 게다가 listStalePending은 uploaderUserId가 null인 행(계정이 물리 삭제된 사람의 첨부)까지 함께 걷으므로, A가 파일 하나를 올리는 순간 B가 남긴 파일이 아무 기록 없이 사라진다. 같은 파일의 형제 경로(post.service.updatePost)는 파일 한 건마다 community:attachment:delete를 남기며 그 자리를 「이 모듈에서 되돌릴 수 없는 유일한 삭제」라고 주석에 적어 두었는데, 실제로는 되돌릴 수 없는 삭제가 둘이고 하나만 기록된다.

**조건:** ① listStalePending의 주석은 이미 정확하므로 건드리지 않는다 — 고칠 곳은 attachment.service.ts:158 한 줄이다. ② uploaderUserId가 null이라 걷힌 남의 고아 행과 내 것을 감사로그 metadata에서 구분한다(예: orphaned: true) — 구분이 없으면 「A의 업로드가 B의 파일을 지웠다」가 기록에서 안 읽힌다. ③ recordAuditMany를 sweepMyOrphans의 같은 try 안에 두어 「청소 실패가 본 일을 막지 않는다」는 성질을 유지하되, 감사로그가 행 삭제보다 **먼저** 실패했을 때 파일만 사라지는 순서가 되지 않게 한다. ④ community:attachment:delete는 audit-log.labels.ts:71·126·176에 이미 등록돼 있으므로 추가 등록은 필요 없다 — 다만 metadata 포맷터가 postId 없는 항목을 견디는지 확인한다.

> **문서화된 결정을 건드린다** — CLAUDE.md의 감사로그 예외 목록(bootstrap·verification). 이 제안은 예외를 늘리지 않고 규칙 쪽으로 되돌린다 — 임시 데이터라 일부러 뺀 것이었다면 그 판단이 코드·문서 어디에도 없다는 것이 문제다.
>
> 검증: 규칙 쪽으로 되돌리는 제안이라 (가)는 해당 없고 (다)는 얻는 쪽이다. (나)도 통과한다 — attachment.service.ts:160-162의 주석은 「실패해도 삼킨다」는 성질만 설명하고 감사로그를 일부러 뺐다는 판단은 코드·문서 어디에도 없다. CLAUDE.md의 감사로그 예외는 bootstrap·verification·seed-merit-rules 셋으로 못 박혀 있고 여기는 그중 무엇도 아니다. 사실관계도 확인했다: sweepMyOrphans(155-172)는 repo.deleteAttachments와 디스크 삭제를 하면서 recordAudit이 하나도 없고, 업로드 실패 보상 삭제(147행)도 무기록이며, 대조군인 post.service.ts:328-347은 파일 한 건마다 남기며 그 자리를 …

---

#### cx-comm-roster-12 · 명단 미리보기에도 내보내기와 같은 감사로그를 남긴다

**조건부** · 보안 · 위험 안전 · **+20줄**

`src/modules/enrollment/roster.service.ts` · `tests/modules/enrollment/roster.service.test.ts`

previewRoster가 rows·plan을 돌려주기 직전에 recordAudit을 남긴다 — action은 roster:preview, targetType은 AcademicYear, metadata는 학년도와 건수만(파일 줄 수·기존 명단 인원). exportRoster와 같은 모양으로 맞추고 이름·생년월일·학생코드는 넣지 않는다.

**왜:** 미리보기는 전교생의 이름·생년월일·학생코드를 브라우저로 그대로 내보내는 경로인데 기록이 하나도 없다. 바로 옆의 exportRoster는 같은 데이터가 나간다는 이유로 「교사 계정 하나가 털렸을 때 누가 언제 명단을 통째로 받았나에 답할 자료가 여기밖에 없다」는 주석과 함께 감사로그를 남긴다. 두 경로가 내보내는 개인정보의 양이 같은데 한쪽만 기록되면, 명단을 조용히 빼내려는 사람은 기록이 없는 쪽을 쓴다 — 파일 하나만 올리면 된다.

**조건:** ① audit-log.labels.ts 네 자리에 "roster:preview"를 등록한다 — AUDIT_ACTIONS 배열(47행 부근)·한글 라벨(103행 부근, 예: 「명단 미리보기」)·severity(151행 부근, info)·metadata 포맷터(492행 부근, exportSummary 재사용). 문자열 키 사전이라 타입 검사가 안 잡아 준다. ② previewRoster의 「**아무것도 저장하지 않는다.**」 주석을 「명단은 저장하지 않는다. 감사로그만 남긴다」로 고치고, exportRoster 주석의 「나가는 유일한 경로」도 사실에 맞춘다. ③ metadata에 이름·생년월일·학생코드를 절대 넣지 않는다 — 학년도와 건수(파일 줄 수·기존 명단 인원)뿐. exportRoster와 같은 모양을 지킨다. ④ tests/modules/enrollment/roster.service.test.ts에 미리보기가 감사로그를 남기는지와 metadata에 개인정보가 없는지를 함께 …

> **문서화된 결정을 건드린다** — roster.service.ts:102-109의 exportRoster 주석이 「읽기지만 기록을 남긴다」는 판단과 그 이유를 이미 적어 두었다. 같은 판단을 형제 경로에 적용한다.
>
> 검증: 방향이 옳다. previewRoster(roster.service.ts:67-100)에 recordAudit이 하나도 없음을 확인했고, 바로 아래 exportRoster(102-131)는 「**읽기지만 기록을 남긴다.** 전교생의 이름·생년월일·학생코드가 한 번에 파일로 나가는 유일한 경로라… 남기는 것은 학년도와 건수뿐이다 — 이름을 실으면 감사로그 자체가 명단 사본이 된다」는 판단을 이미 적어 두었다. 미리보기가 화면으로 내보내는 개인정보의 양이 같으므로 같은 판단이 형제 경로에도 든다. 다만 「유일한 경로」라는 exportRoster 주석의 서술이 이 제안으로 사실이 아니게 되고, previewRoster 자신의 「**아무것도 저장하지 않는다.**」 주석도 거짓이 된다 — 문서를 함께 고치지 않으면 …

---

#### cx-comm-roster-02 · 반대안 — 인증 발송을 실제로 켜고 email·phone이 소유가 증명된 값이 되게 한다

**조건부** · 보안 · 위험 동작변화 · **+120줄**

`src/modules/registration/registration.service.ts` · `src/modules/registration/registration.repo.ts` · `src/modules/verification/verification.sender.ts` · `src/app/(auth)/register/verified-field.tsx` · `docs/deploy.md` · `CLAUDE.md`

requestVerification이 createTemporaryVerifiedProof 대신 requestCode를 부르게 한다(초대코드 확인은 그대로 앞에 둔다). EMAIL 채널은 운영에 발송기가 없어 emailSender가 던지므로 둘 중 하나를 정한다 — SMTP 발송기를 sender에 하나 더 넣거나, 이메일을 인증 대상에서 빼고 전화번호만 인증한다(그러면 verified-field는 PHONE에만 붙고 이메일은 평범한 입력칸이 된다). registration.repo.ts:87의 `emailVerified: true` 하드코딩을 실제 확인 결과로 바꾼다. CLAUDE.md의 「지금 인증은 실제로 발송하지 않는다」 문단과 docs/deploy.md의 SMS_* 설명을 사실에 맞춘다. **cx-comm-roster-01과 배타다.**

**왜:** 지금은 유효한 초대코드와 사전등록 이름(학생은 생년월일까지)을 아는 사람이면 남의 이메일 주소로 가입해 그 주소를 선점할 수 있고, 그러면 emailExists 검사가 나중에 진짜 소유자를 거부한다. CLAUDE.md가 그 대가를 이미 글로 적어 두었는데 코드는 그대로다. 지우는 쪽(01)과 켜는 쪽(02) 중 하나를 고르지 않으면 「절반만 살아 있는 인증」이 계속 남는다.

**조건:** ① EMAIL 채널을 어떻게 할지 먼저 정한다 — SMTP 발송기를 verification.sender.ts에 추가하거나, 이메일을 인증 대상에서 빼고 PHONE만 인증한다(그러면 verified-field는 PHONE에만 붙는다). ② 알리고 자격증명·발송 비용·실패 시 가입 차단 정책을 운영자가 승인한 뒤 켠다. ③ registration.repo.ts:87의 emailVerified 하드코딩을 실제 확인 결과에 연동한다. ④ CLAUDE.md의 「지금 인증은 실제로 발송하지 않는다」 문단, verification 모듈의 감사로그 예외 설명(「발송 사실은 콘솔 로그가 남긴다」), docs/deploy.md의 SMS_* 설명을 함께 사실로 되돌린다. ⑤ verified-field.tsx의 인증번호 입력칸·confirm() 경로가 실제로 살아나므로 tests/app/(auth)/register/actions.test.ts에 도달 가능한 경로로 테스트를 붙인다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「지금 인증은 실제로 발송하지 않는다」가 지목한 재검토 항목 둘(emailVerified 하드코딩, 콘솔 로그가 발송 사실을 남긴다는 서술)을 그대로 실행하는 안이다.
>
> 검증: 삭제 제안이 아니라 성질을 되찾는 제안이라 (가)는 해당 없고, (다)는 오히려 얻는 쪽이다 — registration.repo.ts:87의 `emailVerified: true` 하드코딩과 소유 미증명 email·phone이 CLAUDE.md가 이미 대가로 적어 둔 바로 그 구멍이다. (나)도 통과한다: CLAUDE.md는 이 두 항목을 「실제 발송을 켜는 날 함께 재검토할 것」으로 지목했을 뿐 지금 모양을 옳다고 하지 않는다. 다만 코드만으로 끝나지 않는다 — verification.sender.ts:50-57이 운영 EMAIL에서 throw하므로 채널 결정이 선행돼야 하고, 알리고 자격증명·발송 비용은 저장소 밖의 운영 판단이다. 01과 배타이며 이쪽을 택하는 것이 옳다. 줄 수는 SMTP 발송기를 …

---

### 복잡성 — core·lib·UI·화면 계층 (7건)

#### cx-core-app-03 · pass/error.tsx와 merit/error.tsx는 서로의 복사본이자 (app)/error.tsx가 이미 덮는 자리다 — 둘을 지우고 앱 오류 화면을 하나로 만든다

**조건부** · 삭제 · 위험 동작변화 · **-96줄**

`src/app/(app)/pass/error.tsx` · `src/app/(app)/merit/error.tsx` · `src/app/(app)/error.tsx`

pass/error.tsx(50줄)와 merit/error.tsx(50줄)를 지운다. 둘이 갖고 있고 (app)/error.tsx에는 없는 것 하나 — `useEffect(() => console.error(error), [error])` — 를 (app)/error.tsx로 올린다(주석 포함 4줄). 그러면 세 화면이 아니라 한 화면이 되고, 클라이언트 오류 콘솔 기록이 상벌점·출입증뿐 아니라 앱 전체에 걸린다.

**왜:** `diff`를 돌리면 두 파일의 차이는 세 줄뿐이다 — 주석의 「출입증」/「상벌점」, 함수 이름, 제목 문자열. 그리고 두 파일이 제 존재 이유로 적어 둔 「이 파일이 없으면 앱 셸까지 사라진다」는 사실이 아니다: error.tsx는 같은 세그먼트의 layout **안쪽**에 놓이므로, 이 파일들을 지우면 오류는 (app)/error.tsx로 올라가고 그것은 (app)/layout.tsx 안쪽이라 사이드바·상단바가 그대로 남는다. (app)/error.tsx 자신이 첫 줄에 「`(app)/layout.tsx` 안쪽이라 앱 셸이 그대로 남는다」고 적어 두었다. 지금 세 화면은 생김새도 셋으로 갈렸다 — (app)은 카드 없이 왼쪽 정렬에 console.error가 없고, pass·merit은 `cardClass("page")` 가운데 정렬에 console.error가 있다. (app)/error.tsx의 주석 「막다른 화면의 「대시보드」는 어디서나 같은 모양이다 — 403·404·오류 네 화면이 초록 버튼·흰 버튼·맨 글자 링크로 제각각이었다」가 바로 이 통합을 요구하는 문장이다.

**조건:** (1) 남는 한 화면의 문구를 의도적으로 정하고, 그 김에 미처리 지적 shell-R03(`(app)/error.tsx:25` — 교사에게도 「선생님께 알려 주세요」라고 말한다)을 같이 처리한다. 이제 그 화면이 앱 전체의 유일한 오류 화면이 되므로 나중이 없다. (2) 지우고 나서 /pass와 /merit에서 실제로 오류를 내 사이드바·상단바가 남는지 눈으로 확인한다 — 지금 근거는 Next 문서뿐이고, 이 저장소가 next.config.ts 주석에 「실제로 확인했다」라고 적어 두는 기준을 이 변경에도 적용한다. (3) `(auth)/error.tsx`에도 같은 거짓 전제가 있는지 함께 본다.

> **문서화된 결정을 건드린다** — pass/error.tsx·merit/error.tsx의 「이 파일이 없으면 앱 셸까지 사라진다」 — 이 전제가 틀렸음을 근거로 지운다. 반대로 (app)/error.tsx의 「막다른 화면의 「대시보드」는 어디서나 같은 모양이다」는 지키는 쪽이다. 두 화면 문구가 「출입증을 불러오지 못했습니다」·「상벌점을 불러오지 못했습니다」에서 「화면을 열지 못했습니다」로 바뀌는 것이 눈에 보이는 변화다.
>
> 검증: (가)를 false로 적은 것은 제안이 틀렸다는 뜻이 아니다 — 두 파일은 App Router 규약 파일로 **지금 실제로 렌더되고 있고**, 이것은 죽은 코드 삭제가 아니라 조상 경계로의 교체다(제안 스스로 「동작변화」로 붙였다). 교체가 실제로 덮는지는 1차 출처로 확인했다: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:96 「error.js wraps loading.js, not-found.js, page.js, and nested layout.js files … It does **not** wrap the layout.js or template.js above it in the same …

---

#### cx-core-app-02 · sidebar.tsx와 mobile-nav.tsx가 따로 그리는 메뉴 나무(Rail·ChevronDown·잎 링크·펼침 묶음)를 인자 둘 받는 공용 컴포넌트 하나로 합친다

**조건부** · 통합 · 위험 테스트필요 · **-95줄**

`src/components/app-shell/sidebar.tsx` · `src/components/app-shell/mobile-nav.tsx` · `src/components/app-shell/nav-tree.tsx`

새 파일 nav-tree.tsx에 Rail·ChevronDown·NavItemLink·NavItemGroup을 한 벌만 둔다. 두 화면이 실제로 다른 것은 둘뿐이므로 그 둘만 prop으로 받는다 — (1) density: "sidebar"(px-3 py-2 / py-1.5) | "drawer"(px-3 py-2.5), (2) expand: "in-group"(사이드바 — 그 묶음 안일 때만 펴고 inGroup 변화를 본다) | "always"(서랍 — 펼친 채 뜨고 pathname 변화를 본다). sidebar.tsx에는 Sidebar 껍데기(로고·교사 섹션·계정 블록)만, mobile-nav.tsx에는 MobileNav 껍데기(<dialog> 열고 닫기·이동 시 닫기)만 남는다.

**왜:** 두 파일 504줄 가운데 약 250줄이 서로의 복사본이다. Rail은 8줄이 두 벌, ChevronDown은 18줄이 두 벌로 똑같고, 묶음 머리글 버튼·펼쳐진 하위 목록·aria-controls id 만들기·activeChild로 하나만 켜기가 전부 두 번씩 적혀 있다. 이미 갈라진 흔적도 있다 — 사이드바의 하위 링크는 `active && <Rail />`로 한 번만 계산하는데 서랍은 `child.href === current?.href`를 세 번 되짚어 쓴다. 서랍 주석이 「예전에는 사이드바를 그대로 베껴 useState(inGroup)으로 시작했고, 그래서 폰에서 서랍을 열면 「상벌점」·「출입증」이 접힌 채 화살표만 옆을 보고 있었다」고 적고 있는데, 이것이 바로 복사본 두 벌을 두었을 때 나는 사고다. 한 벌로 만들면 다음 메뉴 규칙 변경이 한 곳에서 끝난다.

**조건:** (1) ChevronDown을 세 번째 사본으로 만들지 말고 감사 ui-1-R07이 지목한 대로 icons.tsx의 ChevronDownIcon을 쓴다 — 다만 지금 지역 사본은 14px·strokeWidth 2이고 ChevronDownIcon은 Icon 기본 크기·1.9라 size={14}로 맞추고 굵기 차이를 눈으로 확인한다. (2) 두 파일에 **렌더 테스트가 하나도 없다**(tests/components/app-shell/nav.test.ts는 순수 함수만 본다). 합치기 **전에** expand 두 값의 단언을 넣는다 — 「서랍은 펼친 채로 뜬다」·「사이드바는 묶음 밖에서 접힌 채 뜨고 들어가면 펴진다」·「서랍은 pathname이 바뀌면 다시 편다」. drawer 주석이 적어 둔 사고(사이드바를 베껴 useState(inGroup)으로 시작해 폰에서 접힌 채 떴다)가 정확히 검사 없는 병합이 되살릴 것이다. (3) DrawerItem·NavGroup의 주석 블록을 요약하지 …

> **문서화된 결정을 건드린다** — mobile-nav.tsx DrawerItem 주석 —「하위 메뉴는 펼친 채로 뜬다 — 사이드바와 갈리는 자리다」와 「`inGroup`이 아니라 `pathname`을 본다. 서랍은 화면을 옮겨도 다시 마운트되지 않으므로…」. 이 두 차이는 지우지 않고 expand prop 두 값으로 그대로 옮긴다. sidebar.tsx의 「머리글은 펴고 접기만 한다 — 눌러도 화면이 바뀌지 않는다」도 공용 컴포넌트가 이어받는다.
>
> 검증: 중복은 감사가 이미 확정했다 — 2026-09-01-vertical-full-read.md의 ui-1-R07(`sidebar.tsx:148`, 「사이드바와 모바일 서랍이 icons.tsx의 ChevronDownIcon 대신 같은 화살표를 각자 다시 그렸다(Rail·로고 블록도 같다)」, 기존-미처리 · full-read RL-12 · deep DL-92). 두 파일을 직접 읽어 확인: Rail은 클래스 문자열까지 같고 ChevronDown도 width/height/viewBox/strokeWidth/path가 같다. 갈리는 것은 제안이 말한 둘이 맞다 — 여백(sidebar ITEM은 py-2·하위 py-1.5, drawer는 py-2.5, drawer ITEM에만 `relative`가 붙어 있다)과 펼침 …

---

#### cx-core-app-04 · 공용 UI·아이콘·nav의 죽은 코드 여섯 자리를 지운다 (아이콘 3개 · Badge tone 2개 · SectionCard headerAlign · Select rows 갈래 · EXTRA_TITLES의 /scan)

**조건부** · 삭제 · 위험 안전 · **-60줄**

`src/components/icons.tsx` · `src/components/ui/badge.tsx` · `src/components/ui/section-card.tsx` · `src/components/ui/select.tsx` · `src/components/app-shell/nav.ts` · `tests/components/app-shell/nav.test.ts` · `CLAUDE.md`

(1) icons.tsx에서 ScanIcon·InviteIcon·SettingsIcon 삭제. (2) badge.tsx의 BadgeTone에서 read·unread 삭제, TONES에서 두 줄 삭제, WITH_DOT을 `new Set(["pending"])`로. (3) section-card.tsx의 headerAlign prop과 그 삼항 삭제 — 남는 값 items-center를 문자열에 박는다. (4) select.tsx의 rows prop과 목록형 갈래 삭제(fieldBase import도 함께). (5) nav.ts의 EXTRA_TITLES에서 `{ href: "/scan", label: "QR 스캔" }`과 그 위 주석 삭제, tests/components/app-shell/nav.test.ts:129의 그 단언 한 줄과 위 주석 삭제. (6) CLAUDE.md의 「판독(`/scan`)은 메뉴에 없다 … 제목은 `nav.ts`의 `EXTRA_TITLES`가 소유한다」에서 마지막 문장을 고친다 — 그 화면은 제 metadata와 <h1>이 제목을 갖는다.

**왜:** 넷은 부르는 곳이 하나도 없어 타입 검사도 lint도 잡아 주지 않는 선택지다. Select의 rows는 위험한 종류다 — 주면 `fieldClass`가 아니라 `fieldBase()`로 갈아타 크기 눈금 밖으로 나가는데, 그 갈래를 쓰는 곳이 없으니 아무도 그 모양을 본 적이 없다. EXTRA_TITLES의 /scan은 죽었을 뿐 아니라 틀렸다: 그 값을 읽는 유일한 곳이 topbar.tsx인데 /scan은 (app)/layout 밖이라 상단바를 아예 안 그리고, 화면이 스스로 쓰는 이름은 「학생증 확인」이라 이름도 다르다. 두 이름이 같은 화면을 가리키면 다음 사람이 어느 쪽을 고쳐야 하는지 알 수 없다.

**조건:** (1) nav.ts:85의 주석 「제목은 EXTRA_TITLES가 맡는다.」도 함께 고친다 — 제안은 CLAUDE.md와 nav.test.ts:129만 적었는데, 코드 옆의 이 한 줄이 남으면 CLAUDE.md만 고친 의미가 없다. (2) SlidersIcon 주석(icons.tsx:120-123)의 「톱니바퀴(SettingsIcon)를 다시 쓰지 않는다 — 교사 섹션에서 이미 "사용자 관리"가 그 그림을 쓰고 있어」를 함께 고친다. nav.ts를 확인하니 계정 관리는 UsersIcon을 쓰고 있어 이 주석은 이미 사실이 아니며(감사 ui-1-R05가 같은 것을 적었다), SettingsIcon을 지우면 존재하지 않는 심볼을 가리키는 주석이 된다. (3) ScanIcon과 함께 지워지는 5줄 주석(「출입증(QrIcon)의 그림을 다시 쓰지 않는다」)은 /scan이 메뉴에 없어진 뒤 근거를 잃은 기록이므로 지워도 되지만, 커밋 메시지에 그 사실을 남긴다.

> **문서화된 결정을 건드린다** — CLAUDE.md 주의점 —「판독(`/scan`)은 메뉴에 없다 … 앱 셸 밖에 사는 화면이라 제목은 `nav.ts`의 `EXTRA_TITLES`가 소유한다」. 이 문장이 사실이 아니게 된 지 오래다(제목은 scan/page.tsx의 metadata와 <h1>이 갖는다). 메뉴에 없다는 앞부분은 그대로 두고 소유 문장만 고친다.
>
> 검증: 여섯 자리 전부 직접 확인했고 감사도 같은 것을 확정해 두었다 — ui-1-R05(icons.tsx:119, 기존-미처리) · ui-1-R06(badge.tsx:29) · ui-2-R08(section-card.tsx:32) · ui-2-C03(select.tsx:27) · ui-1-C03(nav.ts:183, 기존-미처리). 동적 참조도 훑었다: Badge의 read·unread는 문자열 키로 tone을 고르는 다섯 사전(invite-table STATUS_TONE · parent-invite STATUS · kind-badge TONES · pass.labels의 두 표 · audit-log.labels ACTION_TONES) 어디에도 값으로 없다(다른 "read" 히트는 community의 읽기 …

---

#### cx-core-app-01 · 서버 액션 열 개가 저마다 복사해 둔 「오류→화면 문구」 껍데기(toMessage·messageFor·text·firstIssue)를 공용 파일 하나로 모은다

**조건부** · 통합 · 위험 동작변화 · **-35줄**

`src/app/(app)/admin/settings/actions.ts` · `src/app/(app)/admin/users/actions.ts` · `src/app/(app)/admin/merit/rules/actions.ts` · `src/app/(app)/admin/community/actions.ts` · `src/app/(app)/admin/invites/actions.ts` · `src/app/(app)/community/[slug]/actions.ts` · `src/lib/action-message.ts`

새 파일 src/lib/action-message.ts에 셋을 둔다 — (1) actionMessage(ErrorClass, MESSAGES, prefix)가 「ForbiddenError면 권한 문구 · 해당 오류 클래스면 MESSAGES[code] ?? 폴백 · 그 밖이면 console.error(prefix) 후 폴백」을 하는 함수를 돌려준다, (2) text(formData, name), (3) firstIssue(error, fallback). 여섯 파일에서 같은 몸통을 지우고 파일마다 `const toMessage = actionMessage(CommunityError, MESSAGES, "[community]");` 한 줄로 바꾼다. MESSAGES 사전은 지금 자리에 그대로 둔다 — 문구는 모듈마다 다르고 그것이 액션의 일이다. pass/actions.ts의 toState는 옮기지 않는다(모르는 오류를 삼키지 않고 다시 던져서 갈래가 다르다). merit/actions.ts의 toState도 옮기지 않는다(AcademicYearError·P2028 갈래가 더 있다) — 공용 함수를 감싸는 지역 wrapper로만 바꾼다. pass의 firstIssue는 「한글이 아니면 폴백」 검사가 붙은 변종이라 그대로 둔다.

**왜:** 여섯 파일이 같은 12줄을 글자 하나까지 복사해 갖고 있다. 「예상 못 한 오류는 서버 콘솔에 남긴다. 화면에는 일반 문구만 나가므로 여기서 안 남기면 원인이 어디에도 없다」는 두 줄짜리 주석이 아홉 파일에 그대로 있고, 「권한 거부를 일반 폴백에 섞지 않는다 — 화면이 「처리하지 못했습니다」라고 하면…」도 다섯 파일에 있다. 규칙이 여섯 벌이면 새 모듈이 그중 하나를 베끼고, 어느 한 벌만 고쳐도 나머지 다섯은 옛 규칙을 계속 지킨다. 실제로 이미 갈라져 있다 — settings·rules·community는 `toMessage(error)`로 폴백을 함수 안에 박고, users·invites는 `messageFor(error, fallback)`로 인자로 받는다. 액션을 통째로 감싸는 withAction() 껍데기는 제안하지 않는다: requireAuth와 safeParse가 눈에서 사라지면 「액션은 얇다」가 지켜지는지 읽어서 확인할 수 없게 되고, 이 저장소의 3계층 규칙은 그 확인 가능성 위에 서 있다. 기계적으로 같은 부분만 모으고 흐름은 파일에 남긴다.

**조건:** (1) ForbiddenError 문구를 의도적으로 한쪽으로 정하고 그 결정을 users·invites의 MESSAGES["FORBIDDEN"]·parent-invite:20·pass:49의 FORBIDDEN_MESSAGE까지 한 번에 반영한다 — 모르고 바뀌면 안 되는 사용자 문구다. (2) 공용 함수는 폴백을 **호출마다** 받게 만들고(settings/rules/community는 지역 바인딩으로 기본값을 준다), 「예상 못 한 오류는 서버 콘솔에 남긴다」·「권한 거부를 일반 폴백에 섞지 않는다」 두 주석을 공용 파일에 그대로 옮긴다. (3) firstIssue는 pass의 한글 검사를 포함한 판으로 올리거나(그러면 pass도 그것을 쓴다) 아예 추출하지 않는다 — 지금 제안대로면 약한 판이 표준이 되고 채택자는 users 하나뿐이다.

> **문서화된 결정을 건드린다** — CLAUDE.md 「오류 규약」 — 코드는 서비스가 message에 담고 화면 문구로 옮기는 일은 액션의 MESSAGES 사전이 한다. 이 규약은 그대로 지킨다: 사전은 파일에 남고 사전을 읽는 기계 부분만 모은다.
>
> 검증: 중복은 실재한다 — toMessage 4곳(settings:33·rules:33·admin/community:33·community[slug]:37)·messageFor 2곳(users:45·invites:42)·text(formData) 3곳을 직접 확인했다. CLAUDE.md 「오류 규약」은 MESSAGES 사전이 액션에 있으라고만 하고 기계 부분을 모으지 말라고는 하지 않으므로 (나) 통과. 권한 검사·감사로그·트랜잭션은 이 계층에 없어 (다)도 통과. **그러나 제안이 「글자 하나까지 복사본」이라고 말한 것은 사실이 아니고, 그 차이가 화면 문구를 바꾼다.** ForbiddenError.message는 core/authz/errors.ts에서 항상 "FORBIDDEN"이고, …

---

#### cx-core-app-08 · SkeletonTable에 제목 폭·행 높이·머리글 조작부 인자를 주고, loading.tsx 네 곳이 손으로 다시 그린 「머리글 띠 + 표」 뼈대를 그것으로 접는다

**조건부** · 단순화 · 위험 테스트필요 · **-12줄**

`src/components/ui/skeleton.tsx` · `src/app/(app)/admin/community/loading.tsx` · `src/app/(app)/admin/merit/rules/loading.tsx` · `src/app/(app)/admin/logs/loading.tsx` · `src/app/(app)/merit/rules/loading.tsx`

skeleton.tsx의 SkeletonTable에 세 인자를 더한다 — titleWidth(기본 "w-40"), rowHeight(기본 "h-6"), controls(머리글 띠 안 제목 아래에 오는 칩 줄·검색칸). 그러면 admin/community·admin/merit/rules의 마지막 블록과 admin/logs의 유일한 블록이 각각 `<SkeletonTable rows={5} titleWidth="w-24" rowHeight="h-8" />` 한 줄이 된다. 함께 merit/rules/loading.tsx:6의 `className="rounded-card border border-line bg-surface p-5"`를 `cardClass("panel")`로 바꾼다.

**왜:** SkeletonTable이 이미 있는데도 네 화면이 `cardClass("flush")` + `border-b border-line px-5 py-4` + 제목 뼈대 + `space-y-3 px-5 py-4` + 행 반복을 손으로 다시 적는다. 이유는 제목 폭과 행 높이가 SkeletonTable의 고정값(w-40·h-6)과 달라서인데, 그래서 지금 뼈대 규격이 셋으로 갈렸다 — 어떤 화면은 행이 h-6, 어떤 화면은 h-8이다. 뼈대가 실제 행보다 낮으면 결과가 도착하는 순간 화면이 통째로 밀리고, 그 어긋남은 화면을 보기 전에는 알 수 없다. skeleton.tsx가 SkeletonTabs·SkeletonField 주석에 「여기 숫자를 손으로 적어 두었더니 실제 칩과 8px까지 어긋난 채 굳어 있었다」·「다섯 화면이 40·40·42·44·44로 제각기 어림잡고 있었다」고 적어 둔 그 사고가 표 뼈대에서 그대로 재현되고 있다. merit/rules/loading.tsx가 카드 껍데기 클래스를 직접 적은 것도 같은 종류다.

**조건:** (1) rowHeight prop을 만들지 말고 SkeletonTable의 행 높이를 table.tsx의 실제 규격에서 한 번만 정한다 — 셀은 `py-2.5` + text-sm(1.5)이라 실제 행이 ≈41px이고, 지금 기본값 h-6(24px, space-y-3과 합쳐 36px 피치)이 오히려 틀린 쪽이며 호출부의 h-8(44px 피치)이 맞다. 고칠 것은 기본값이지 prop 추가가 아니다(FIELD_HEIGHTS가 input.tsx를 따라가듯 주석으로 출처를 적는다). titleWidth와 controls는 SkeletonTabs의 width 선례가 있으므로 받아도 된다. (2) admin/logs는 제안이 적은 대로 한 줄이 되지 않는다 — rows는 5가 아니라 10이고 머리글에 SkeletonTabs(count 14)·SkeletonField가 들어가며 그 위에 「동작 필터는 두 줄까지 간다 — 뼈대에서도 두 줄을 그려야 표가 위로 안 튄다」는 주석이 붙어 있다. …

> **문서화된 결정을 건드린다** — CLAUDE.md 디자인 —「카드 껍데기 클래스는 `cardClass()` 하나가 소유하므로 화면 코드에 직접 적지 않는다 — 토큰을 바꿀 때 열여섯 곳을 손으로 찾게 된다」. merit/rules/loading.tsx:6이 이 규칙 밖에 있다. skeleton.tsx의 SkeletonTabs·SkeletonField 주석이 「뼈대 숫자를 화면마다 어림잡지 않는다」는 같은 결정을 이미 말하고 있고 표만 빠져 있다.
>
> 검증: 네 화면을 다 읽었다. 손그림 「머리글 띠 + 표」가 admin/community:20-29 · admin/merit/rules:39-48 · admin/logs:16-27에 있고 SkeletonTable(skeleton.tsx:122)이 같은 모양을 이미 갖고 있는 것은 사실이다. merit/rules/loading.tsx:6의 `rounded-card border border-line bg-surface p-5`가 cardClass("panel")과 정확히 같은 문자열임도 card.tsx를 열어 확인했고, CLAUDE.md 「카드 껍데기 클래스는 cardClass() 하나가 소유하므로 화면 코드에 직접 적지 않는다」에 그 한 줄이 어긋나 있다 — 이 부분은 이론의 여지가 없다. (다) 무관. **문제는 …

---

#### cx-core-app-06 · globals.css의 죽은 토큰을 지운다 — 쓰는 곳이 0곳인 --text-display 세 줄과 --color-green-press

**조건부** · 삭제 · 위험 안전 · **-6줄**

`src/app/globals.css`

@theme에서 `--text-display: 28px` · `--text-display--line-height: 1.15` · `--text-display--letter-spacing: -0.5px` 세 줄과 `--color-green-press: #0a6144` 한 줄을 지운다.

**왜:** 토큰은 쓰이지 않아도 아무 신호를 내지 않는다 — 타입 검사도 lint도 CSS 변수를 세지 않으므로, 남겨 두면 언젠가 아무 화면에서나 쓰이고 그때는 스펙에 없는 크기·색이 하나 늘어난 뒤다. text-display는 이미 한 번 이 경로를 밟았다: 지운다는 결정과 처리 기록이 문서 두 곳에 남아 있는데도 되살아났고, 되살아난 값(28/1.15/-0.5)은 원래 스펙값(28/1.2/-0.42)과도 다르다. green-press는 pri-press·rose-press와 짝을 이루라고 만들었는데 초록 계열에는 눌림 상태를 쓰는 컴포넌트가 없다.

**조건:** docs/design/2026-08-17-redesign-spec.md:95의 글자크기 표에서 `text-display` 행을 함께 지우거나 「삭제됨」으로 표시한다. **이것이 재발의 실제 경로다** — 그 문서는 README가 「현재 유효한 규격」이라고 못 박은 살아 있는 스펙이고, 표에 행이 남아 있는 한 다음 개편이 토큰을 세 번째로 되살린다(1f63660 도입 → 250268c 삭제 → 974914e 부활). 표만 남기고 토큰만 지우면 이 제안은 이미 한 번 실패한 수정을 그대로 반복하는 것이 된다. --text-display 위 2줄 주석도 함께 지운다.

> **문서화된 결정을 건드린다** — docs/reviews의 responsive-audit P3-5 —「`text-display`(28px) 토큰은 실사용 0곳 … 지운다(두면 언젠가 아무 데나 쓰인다)」와 docs/reviews/README.md:62 —「`text-display` 토큰은 삭제됐다.」. 이 결정이 무효화된 채 값까지 스펙에서 벗어난 상태이므로 되돌리는 것이다. 직전 감사(2026-09-01-vertical-full-read.md)가 재발로 기록했다.
>
> 검증: 둘 다 죽었다 — `grep -rn text-display src`는 globals.css:75-77뿐이고 `--color-green-press`도 globals.css:51 정의 한 줄뿐이며 어떤 유틸리티 형태로도 화면 코드에 없다. globals.css 자신이 var()로 쓰는 --color-bg·placeholder·scrollbar·track을 제안이 가려낸 것도 맞다. (나)는 통과를 넘어 **삭제 쪽이 문서화된 결정**이다: responsive-audit P3-5가 「지운다(두면 언젠가 아무 데나 쓰인다)」로 확정했고 reviews/README.md:77이 「text-display 토큰은 삭제됐다」로 처리까지 기록했는데 코드에 28/1.15/-0.5로 살아 있다(스펙값 28/1.2/-0.42와도 …

---

#### cx-core-app-07 · 첨부 내려받기 라우트가 응답에 직접 거는 CSP 헤더는 전역 headers()에 덮여 한 번도 선 적이 없다 — 지우고 거짓 주석을 정정한다

**조건부** · 보안 · 위험 테스트필요 · **-4줄**

`src/app/api/community/attachments/[...attachment]/route.ts` · `tests/app/api/community/attachments/route.test.ts`

라우트 응답 헤더에서 `"Content-Security-Policy": "default-src 'none'; sandbox"` 한 줄과 그 위 두 줄짜리 주석을 지운다. 그 자리에 「첨부 CSP는 next.config.ts의 ATTACHMENT_HEADERS가 소유한다 — 여기서 걸면 전역 규칙에 덮인다」는 한 줄 주석을 남긴다. 테스트에서도 이 헤더를 단언하는 세 줄을 지운다(라우트 단위 테스트는 next.config.ts의 headers()를 통과하지 않으므로 지금 초록인 이 단언이 운영에서 참인지를 아무것도 보증하지 않는다).

**왜:** 두 파일의 주석이 서로 정반대를 말한다. 라우트는 「next.config.ts의 전역 CSP는 페이지용이라 여기서 덮어쓴다」고 적었고, next.config.ts는 「첨부 응답에 라우트 핸들러가 직접 건 CSP는 위의 전역 규칙에 밀려 사라진다 — 실제로 확인했다」고 적었으며 CLAUDE.md도 후자 편이다. 사용자가 올린 바이트가 나가는 유일한 경로의 방어선이 어디 있는지를 두고 코드가 두 가지를 말하고 있다는 뜻이다. 지금은 next.config.ts 쪽이 실제로 서 있어 안전하지만, 라우트 주석을 믿은 사람이 next.config.ts의 ATTACHMENT_HEADERS를 「중복이니 지운다」고 판단하면 그 순간 첨부 응답의 CSP가 통째로 사라진다. 죽은 헤더가 아니라 죽은 헤더에 붙은 거짓 주석이 위험한 것이다.

**조건:** tests/app/api/community/attachments/route.test.ts:206-219의 CSP 단언을 지우기만 하지 말고 **진짜 소유자를 지키는 검사로 바꾼다** — next.config.ts의 `headers()`를 불러 `/api/community/attachments/:id*` 항목이 `default-src 'none'; sandbox`를 담고 전역 규칙 **뒤에** 오는지 단언하는 단위 테스트를 넣는다(미처리 지적 shell-R08 「첨부 왕복 e2e가 정작 깨지기 쉬운 CSP 헤더를 확인하지 않는다」와 같은 방향이다). 사용자가 올린 바이트가 나가는 유일한 경로의 유일한 CSP가 아무 검사 없이 남는 상태를 만들지 않는다. 라우트에는 「첨부 CSP는 next.config.ts의 ATTACHMENT_HEADERS가 소유한다 — 여기서 걸면 전역 규칙에 덮인다」 한 줄을 반드시 남긴다(그 한 줄이 없으면 다음 사람이 헤더를 다시 넣는다).

> **문서화된 결정을 건드린다** — CLAUDE.md 주의점 —「첨부 응답의 CSP는 `next.config.ts`가 소유한다. 라우트 핸들러가 응답에 직접 건 CSP는 전역 `headers()`에 덮인다 — 첨부 전용 규칙을 전역 규칙 뒤에 두어야 선다」. 이 결정을 코드에 맞춰 반영하는 것이고, 다른 결정을 건드리지 않는다.
>
> 검증: 두 주석이 정반대를 말하는 것을 코드에서 확인했다 — route.ts:45-49는 「next.config.ts의 전역 CSP는 페이지용이라 여기서 덮어쓴다」이고, next.config.ts:113-115는 「뒤에 오는 규칙이 같은 이름의 헤더를 덮는다 … 라우트 핸들러가 직접 건 CSP는 위의 전역 규칙에 밀려 사라진다 — 실제로 확인했다」이며 CLAUDE.md 주의점도 후자 편이다. headers()가 `/:path*` 다음에 `/api/community/attachments/:id*`를 두므로 ATTACHMENT_HEADERS가 실제로 서는 쪽이고 라우트의 한 줄은 죽었다. 감사가 세 번 기록했다(community-1-R09 = deep DL-04 = full-read RL-11). (나)는 「거짓 …

---

### 테스트 층 (1건)

#### tests-01 · tests/helpers/에 세션 사용자 픽스처와 core 목(recordAudit·withTransaction·txClient)을 모아 43개 파일의 복제를 지운다

**조건부** · 통합 · 위험 테스트필요 · **-300줄**

`tests/helpers/session.ts` · `tests/helpers/core-mocks.ts` · `tests/modules/merit/award.service.test.ts` · `tests/modules/merit/rule.service.test.ts` · `tests/modules/merit/threshold.service.test.ts` · `tests/modules/merit/merit.offset.test.ts` · `tests/modules/merit/merit.stats-scope.test.ts` · `tests/modules/merit/merit.stats-breakdown.test.ts` · `tests/modules/merit/merit.watch-list.test.ts` · `tests/modules/merit/stats.ranking.test.ts` · `tests/modules/enrollment/roster.service.test.ts` · `tests/modules/enrollment/roster.repo.test.ts` · `tests/modules/enrollment/enrollment.service.test.ts` · `tests/modules/enrollment/enrollment.repo.test.ts` · `tests/modules/pass/decision.service.test.ts` · `tests/modules/pass/request.service.test.ts` · `tests/modules/pass/verify.service.test.ts` · `tests/modules/community/board.service.test.ts` · `tests/modules/community/post.service.test.ts` · `tests/modules/community/comment.service.test.ts` · `tests/modules/community/attachment.service.test.ts` · `tests/modules/invites/invite.service.test.ts` · `tests/modules/admin-users/admin-user.service.test.ts` · `tests/modules/admin-users/admin-user.repo.test.ts` · `tests/modules/academic-year/academic-year.service.test.ts` · `tests/modules/academic-year/academic-year.repo.test.ts` · `tests/modules/account/account.service.test.ts` · `tests/modules/audit-log/audit-log.service.test.ts` · `tests/modules/bootstrap/bootstrap.service.test.ts` · `tests/modules/registration/registration.service.test.ts` · `tests/modules/registration/registration.repo.test.ts` · `tests/modules/verification/verification.service.test.ts` · `tests/modules/verification/mock-mode.test.ts` · `tests/core/auth/session.test.ts` · `tests/core/auth/credential-session-boundary.test.ts` · `tests/core/authz/errors.test.ts` · `tests/app/api/pass/qr/route.test.ts` · `tests/app/api/community/attachments/route.test.ts` · `tests/integration/pass.list-window.integration.test.ts` · `tests/integration/dashboard.parent-scope.integration.test.ts` · `tests/integration/invite.student-ownership.integration.test.ts` · `tests/integration/invite.parent-cap.integration.test.ts` · `tests/integration/community.pagination.integration.test.ts` · `tests/integration/community.attachment-cap.integration.test.ts` · `tests/integration/registration.atomicity.integration.test.ts`

tests/helpers/session.ts에 `user(role, id, over)` 하나를 두고, 28개 파일이 각자 갖고 있는 `function user(role, id): SessionUser { ... }`(대개 글자까지 같은 11줄)와 `const admin: SessionUser = { ... }` 블록 327줄을 지운다. tests/helpers/core-mocks.ts에는 `coreMocks(tag)`를 두어 recordAudit·recordAuditMany·txClient·withTransaction과 그 위에서 세 파일이 따로 만든 `auditEntries()`·roster의 `noAudit()`을 한 벌로 돌려준다 — 29개 파일의 상수·헬퍼 117줄이 파일당 2줄(import + 구조분해)로 바뀐다. `vi.mock("@/core/audit/audit", () => ({ recordAudit }))` 같은 vi.mock 줄 자체는 각 파일에 그대로 남긴다(무엇을 목했는지가 파일 머리에서 보여야 한다). txClient에 파일별 `tag`를 넣는 지금 관행은 유지한다 — 서비스가 prisma가 아니라 넘겨받은 tx로 썼는지를 단언하는 근거다.

**왜:** tests/에 공용 헬퍼 파일이 하나도 없다. 그래서 같은 SessionUser가 28벌, 같은 withTransaction 목이 25벌, 같은 recordAudit 목이 21벌, txClient가 16벌 있다. 값이 조금씩 갈라져 있어(name이 "테스트"·"이정민"으로 나뉘고 email이 파일마다 다르다) 어느 것이 표준인지 알 수 없고, 픽스처를 고쳐야 할 때 28곳을 손으로 찾게 된다. 서두가 두꺼운 것 자체가 값이다 — 단위 141개 파일의 첫 describe 앞이 6,199줄로 단위 스위트의 19%이고, 그 대부분이 이 두 덩어리다. 지금은 새 서비스 테스트를 쓸 때 40줄을 복사해 붙이는 것이 출발점이라, 직전 감사가 요구하는 「빠진 단언 119건」을 채우는 일도 그만큼 비싸다.

**조건:** (1) 대기 중인 `docs/superpowers/plans/2026-09-01-implementation-plan.md`의 Phase A(결함 49건)가 먼저 착지한 뒤에 하거나 그 위로 리베이스한다 — 이 제안의 43개 파일 중 roster.service.test.ts(:544 roster-3-R02, :259 roster-3-C03)·decision.service.test.ts(:298)·request.service.test.ts(:495)·post.service.test.ts(:230,:307)·account.service.test.ts(:49)·merit.watch-list.test.ts(:232)가 그 배치의 수정 대상이다. (2) `coreMocks(tag)`는 withTransaction을 **두 모양으로** 내보내야 한다 — 지금 25곳 중 pass·community·merit 계열은 `vi.fn(async fn => …

> **문서화된 결정을 건드린다** — CLAUDE.md 「폴더 구조」의 `tests/ core/ · modules/ — 구조를 src/와 맞춘다`. tests/helpers/는 src/에 짝이 없는 디렉터리라 이 규칙에서 벗어난다 — 사람이 의식하고 받아들여야 하는 예외다. 대신 vitest.config.mts의 unit include는 `tests/**/*.test.ts`라 helpers/*.ts는 스위트에 잡히지 않고, 커버리지 include도 `src/**`뿐이라 지표에 영향이 없다.
>
> 검증: (가) 삭제 제안이 아니라 이동·통합이라 true. (나) CLAUDE.md에 관련 기술이 있으나 **금지가 아니다** — 「구조를 src/와 맞춘다」는 test 파일의 배치 규칙이지 공용 픽스처 금지가 아니고, vitest.config.mts의 unit include가 `tests/**/*.test.ts`라 helpers/*.ts는 스위트에 안 잡히며 커버리지 include도 `src/**`뿐이라는 제안자의 확인이 맞다. 그래도 문서에 예외를 적는 것을 조건으로 단다. (다) recordAudit·assertCan·트랜잭션 경계를 **더 촘촘히** 만드는 방향이다 — 목을 만드는 자리만 옮기고 `vi.mock(...)` 선언은 각 파일에 남기므로 무엇을 목했는지가 파일 머리에서 그대로 보인다. …

---

---

## 5. 기각 16건

**이 절이 이 문서에서 가장 값이 큰 부분일 수 있다.** 기각 사유가 곧 「이 저장소가 왜 지금 모양인가」의 목록이기 때문이다.

**cx-merit-pass-04 · 상벌점 표의 점수 네 열(상점·벌점·상쇄·순점수)을 열 생성기 하나로 모은다**

`src/components/merit/kind-badge.tsx` · `src/app/(app)/merit/stats/views/overview.tsx` · `src/app/(app)/merit/stats/views/ranking.tsx` · `src/app/(app)/merit/stats/views/teachers.tsx` · `src/app/(app)/merit/class-roster.tsx` · 제안했던 증감 -100줄

전제가 사실과 다르고, 제안이 「복사 사고」라 부른 차이 중 둘은 그 자리에 이유가 적혀 있다. (1) 여섯 표의 열 구성이 서로 다르다 — ranking.tsx의 반 순위 표(264-290)에는 상쇄도 순점수도 없고 1인 평균이 대신 있으며, overview의 반별 현황에는 인원·1인 평균이 더 있다. 「같은 네 열」이 아니다. (2) 벌점 칸의 강조 유무는 overview.tsx:313-315와 ranking.tsx:279-281에 같은 문장으로 문서화돼 있다 — 「반 합계에는 강조를 대지 않는다: 기준은 학생 한 명에게 정한 값이라 인원이 많은 반은 예외 없이 넘는다」. charts.tsx:185-190의 ClassNetChart 주석도 같은 판단을 되풀이한다. (3) 폭도 마찬가지다 — ranking.tsx:171·class-roster.tsx:260의 「기준을 넘긴 칸은 테두리가 붙어 18px 넓어진다」가 그 값이 임의가 아님을 적어 둔다. 제안은 이것들을 생성기 옵션(demerit: plain|level, include, net, thresholds, pick)으로 되살리겠다는 것이라, 없앤다는 분기가 호출부에서 옵션으로 그대로 돌아온다. 실제 결함은 상쇄 색 하나뿐이다(ranking.tsx:186의 `text-mut` vs overview·teachers·class-roster의 `text-mut2`/`text-green`) — 그것은 어느 쪽이 옳은지 정해 한 줄 고치면 되는 디자인 결정이고, 217줄짜리 생성기를 정당화하지 못한다. 화면 코드라 감사로그·권한을 잃지는 않지만, 색·폭 통일은 …

**cx-merit-pass-06 · 출입증 성공 안내의 서명 쿠키와 그 전용 미들웨어를 걷어내고 리다이렉트 쿼리 한 칸으로 바꾼다**

`src/modules/pass/pass-flash.ts` · `src/proxy.ts` · `src/app/(app)/pass/actions.ts` · `src/app/(app)/pass/page.tsx` · `tests/modules/pass/pass-flash.test.ts` · `tests/proxy.test.ts` · 제안했던 증감 -240줄

제안이 유지하겠다고 한 성질이 대체안에서 유지되지 않는다. docs/reviews/2026-08-31-functional-uiux-sweep.md:314가 확인된 동작으로 못 박은 것은 「서명된 HttpOnly 일회성 값으로만 표시되고 **새 주소 재방문에서 사라짐**」인데, 쿼리 한 칸 + `history.replaceState`는 JS가 있을 때만 지운다 — 이 저장소는 무JS 경로를 e2e로 검증하고(같은 문서의 최종 검증 표: 「JS/무JS 로그인」) 신청·결재가 전부 서버 액션 폼이라 무JS로 끝까지 도는 경로다. 그 경로에서는 새로 고침마다 배너가 다시 뜨고 주소를 복사하면 남에게 「승인되었습니다」가 그대로 전달된다. 함께 사라지는 것이 또 있다: 지금은 page.tsx:29-30이 `flash.userId === actor.id`로 배너를 발급받은 본인에게만 보이게 묶는데, 쿼리에는 그 결속이 없어 역할별 배너(교사 approved·학생 requested·학부모 consented)를 주소만으로 남의 화면에 띄울 수 있다. 미들웨어가 이 배너 하나를 위해 존재한다는 지적 자체는 사실이나(src/proxy.ts 전체가 PASS_FLASH_*뿐), 지우면 문서가 확인했다고 적은 성질이 깨지므로 「전제가 무너진 경우」에 해당하지 않는다.

**cx-merit-pass-07 · transitionUnexpired의 손으로 쓴 SQL을 Prisma 조건부 갱신으로 되돌린다**

`src/modules/pass/pass.repo.ts` · `src/modules/pass/decision.service.ts` · `src/modules/pass/request.service.ts` · 제안했던 증감 -52줄

문서화된 이유가 살아 있고, 그 이유에 대한 제안의 반박이 성립하지 않는다. pass.repo.ts:451-454·485-489는 「서비스가 읽은 now는 오류 메시지와 감사 시각을 결정할 뿐 UPDATE의 만료 기준으로 믿지 않는다. 행 잠금을 별도 문장으로 먼저 얻은 뒤 clock_timestamp를 평가한다 — 한 UPDATE 안에서 기다리면 WHERE가 잠금 전에 평가될 수 있고 now()·statement_timestamp()도 문·트랜잭션 시작에 고정된다」고 적는다. consentedAt·decidedAt에 앱 시각이 들어가는 것은 사실이지만 그것은 **누가 언제 눌렀나를 남기는 기록 값**이고, 만료 판정(끝난 신청을 CONSENTED·APPROVED로 바꾸지 않는다)의 기준과 다른 값이다 — 「한 행에 두 시계가 섞여 있으니 기준도 앱 시계로 되돌리자」는 전제를 무너뜨리지 못한다. 잃는 것도 있다: FOR UPDATE 행 잠금이 사라져 approvePass의 REQUESTED→(0건)→CONSENTED 두 전이 사이가 열리고, 0건 뒤 findUnique 재조회는 잠금 없이 읽으므로 EXPIRED/ALREADY_DECIDED 판정이 경합에 흔들린다. 살릴 만한 조각은 하나다 — 쓰이지 않는 `_observedAt` 인자(직전 감사 pass-2-C04)는 원시 SQL을 그대로 둔 채 인자만 지우면 되고, 그것은 호출부 넷(request.service.ts:150, decision.service.ts:76·102·111)만 손대는 별개의 작업이다.

**cx-core-app-05 · core/auth/permissions.ts는 Better Auth admin 플러그인의 기본값을 그대로 다시 적은 파일이다 — 파일과 그 130줄짜리 테스트를 지운다**

`src/core/auth/permissions.ts` · `src/core/auth/auth.ts` · `src/core/auth/auth-client.ts` · `tests/core/auth/permissions.test.ts` · 제안했던 증감 -156줄

**제안의 핵심 전제가 1차 출처에서 거짓이다.** 제안 스스로 「확인이 필요한 지점」으로 남긴 것을 node_modules에서 확인했다 — better-auth 1.6.26의 `dist/plugins/admin/has-permission.mjs`는 `const acRoles = input.options?.roles || defaultRoles; for (const role of roles) if ((acRoles[role]?.authorize(...))?.success) return true;`로 **정확한 키 조회**를 하고, `dist/plugins/admin/access/statement.mjs`의 defaultRoles는 키가 소문자 `admin`/`user`다. 우리 user.role은 `ADMIN`/`STUDENT`/`PARENT`이므로 `roles: adminRoles`를 빼면 `defaultRoles["ADMIN"]`이 undefined가 되어 **ADMIN이 계정 관리 API 전부(set-role·create·ban·list·set-password·impersonate…)에서 거부된다.** routes.mjs의 모든 엔드포인트가 이 hasPermission을 탄다. 게다가 admin.mjs:18-19의 adminRoles 검증은 키를 소문자로 비교하므로 시작 시 오류조차 나지 않는다 — 조용히 막힌다. 둘째로 「라이브러리 기본값을 그대로 다시 적었다」도 사실이 아니다: 우리 ADMIN은 `[...defaultStatements.user]`를 받아 `impersonate-admins`를 …

**db-01 · 마이그레이션 21개를 초기 마이그레이션 하나로 다시 만든다 — 부분 유니크 인덱스와 학년도 시드를 손으로 붙여서**

`prisma/migrations/` · `prisma/schema.prisma` · `scripts/setup-test-db.sh` · `docs/deploy.md` · 제안했던 증감 -186줄

DDL 대조와 줄 수는 내가 직접 재현해 사실이었다 — probe_shadow(마이그레이션 20개 전량)와 probe_init(migrate diff --from-empty 535줄)의 컬럼·제약·인덱스를 information_schema/pg_indexes/pg_constraint로 대조하니 차이는 `AcademicYear_single_current`(부분 인덱스)와 AcademicYear 시드 행 1건뿐이었고, 729-535=194줄이라 손으로 붙일 두 문장을 더해 약 -186이 맞다. 그러나 **핵심 전제 「배포 이력이 없다」가 거짓이다.** 사용자 메모리(test-server-deploy)와 docs/deploy.md §6이 가리키는 실제 테스트 서버(platform.yaki.kr · /opt/gbsw)가 돌고 있고, 그 DB의 `_prisma_migrations`에는 옛 20개가 이미 기록돼 있다. 이 상태에서 스쿼시된 폴더로 `migrate deploy`를 돌리면 어떻게 되는지 직접 재현했다: **거부되는 게 아니라 init 마이그레이션을 실제로 적용하려 들다가 `P3018 / 42P07 relation "user" already exists`로 죽고, `_prisma_migrations`에 finished_at이 비어 있는 실패 행을 남긴다.** 그 뒤로는 `migrate resolve` 없이는 어떤 마이그레이션도 못 들어간다 — compose의 migrate 서비스가 그 지점에서 멈춘다. 제안의 수습 절차는 로컬 dev DB와 gbsw_test 둘만 덮고 운영 중인 서버 DB를 다루지 않는다. …

**db-06 · User.deletedAt과 그 인덱스·읽기 경로를 걷어내 삭제를 하드 삭제 하나로 통일한다**

`prisma/schema.prisma` · `src/core/auth/auth.ts` · `src/core/auth/login-eligibility.ts` · `src/core/auth/session.ts` · `src/app/scan/page.tsx` · `src/app/api/pass/qr/route.ts` · `src/app/api/community/attachments/route.ts` · `src/app/api/community/attachments/[...attachment]/route.ts` · `src/app/(app)/admin/users/[userId]/page.tsx` · `src/app/(app)/admin/users/actions.ts` · `src/modules/admin-users/admin-user.repo.ts` · `src/modules/admin-users/admin-user.service.ts` · `src/modules/enrollment/roster.repo.ts` · `src/modules/enrollment/roster.plan.ts` · `src/modules/enrollment/enrollment.repo.ts` · `src/modules/invites/invite.repo.ts` · `src/modules/pass/pass.repo.ts` · `tests/core/auth/login-eligibility.test.ts` · `tests/modules/admin-users/admin-user.service.test.ts` · `tests/app/api/community/attachments/route.test.ts` · 제안했던 증감 -110줄

세 검사 모두 걸린다. **(가)** 값을 채우는 코드가 없다는 것은 사실이지만(쓰기는 roster.repo.ts:262·274의 `deletedAt: null` 둘뿐) 읽는 코드는 src 15곳 이상에 살아 있고, 테스트도 제안이 든 3개 파일이 아니라 15개 이상이 참조한다(session.test.ts · api/pass/qr/route.test.ts · merit.removed-student · pass.flow · pass.list-window · invite.parent-cap · roster.audit-rollback · year-race 등, 대부분 픽스처의 `deletedAt: null`). 「테스트만 쓰는 것은 안 쓰는 것이 아니다」에 정확히 해당한다. **(나)** schema.prisma:42-68이 27줄에 걸쳐 **지금 모양을 명시적으로 결정한다** — 「열과 인덱스는 남긴다… 읽기 경로가 아직 살아 있어 지우면 그쪽이 함께 깨진다… 즉 값을 채우는 날 소프트 삭제는 그대로 동작한다」. 그 전제는 무너지지 않았다: 읽기 경로는 지금도 살아 있고, 제안은 전제가 무너졌다고 말하는 게 아니라 전제를 제거하자고 말한다. 그것은 같은 결정의 재확인이 아니라 **반대 결정**이며, 단순화가 아니라 제품 결정이다. login-eligibility.ts:2-3도 별도의 근거를 적어 둔다 — 「status와 deletedAt을 독립적으로 본다 — 하나만 되돌리는 실수가 생겨도 로그인이 뚫리지 않아야 한다」(defense-in-depth). **(다)** 잃는 것이 있다. 소프트 삭제를 켜는 선택지를 …

**cx-comm-roster-01 · 쓰지 않는 인증 발송 경로(알리고·발송기·requestCode·confirmCode·목업·코드 입력 UI)를 통째로 지운다**

`src/modules/verification/senders/aligo.ts` · `src/modules/verification/verification.sender.ts` · `src/modules/verification/verification.service.ts` · `src/modules/verification/verification.repo.ts` · `src/modules/verification/verification.schema.ts` · `src/instrumentation.ts` · `src/app/(auth)/register/actions.ts` · `src/app/(auth)/register/verified-field.tsx` · `src/lib/masks.ts` · `scripts/seed-demo.ts` · `prisma/schema.prisma` · `docker-compose.yml` · `.env.example` · `README.md` · `tests/modules/verification/aligo.test.ts` · `tests/modules/verification/sender.test.ts` · `tests/modules/verification/mock-mode.test.ts` · `tests/modules/verification/verification.service.test.ts` · `tests/app/(auth)/register/actions.test.ts` · 제안했던 증감 -980줄

셋 다 걸린다. (나)가 결정적이다 — CLAUDE.md 「지금 인증은 실제로 발송하지 않는다」가 「설정은 다시 켤 때를 위해 보존돼 있다(docker-compose.yml의 SMS_*)」와 「실제 발송을 켜는 날 함께 재검토할 것」을 명시적 결정으로 적어 두었고, registration.service.ts:66-73 주석이 그 문단을 다시 가리킨다. 전제(언젠가 켠다)는 무너지지 않았다. (가)도 틀렸다 — scripts/seed-demo.ts:155·411-413이 isMockVerification·requestCode·confirmCode를 실제로 쓰는 운영 스크립트 호출자이고(테스트가 아니다), 제안이 지우겠다는 confirmVerificationAction은 actions.ts:211-227에 code===""일 때 requireVerified를 부르는 살아 있는 분기를 품고 있어 「전부 도달 불가」가 아니다. (다)는 VerificationCode.attempts·codeHash와 MAX_ATTEMPTS를 열째로 지우는 부분이다 — 코드 대조 5회 제한은 발송을 켜는 순간 반드시 되돌아와야 하는 무차별 대입 방어인데, 열을 지우면 재도입이 또 마이그레이션이 된다. 줄 수도 부풀었다: aligo 126 + sender 72 + 테스트 285 + 부분 삭제(service·repo·schema·화면·액션·masks·instrumentation) 약 220 ≈ -700이지 -980이 아니다.

**cx-comm-roster-03 · 한 번도 채워진 적 없는 User.deletedAt 소프트 삭제 흔적을 열까지 지운다**

`prisma/schema.prisma` · `src/core/auth/auth.ts` · `src/core/auth/session.ts` · `src/core/auth/login-eligibility.ts` · `src/modules/admin-users/admin-user.repo.ts` · `src/modules/admin-users/admin-user.service.ts` · `src/modules/enrollment/enrollment.repo.ts` · `src/modules/enrollment/roster.repo.ts` · `src/modules/invites/invite.repo.ts` · `src/modules/pass/pass.repo.ts` · `src/app/(app)/admin/users/[userId]/page.tsx` · `src/app/scan/page.tsx` · `src/app/api/pass/qr/route.ts` · `src/app/api/community/attachments/route.ts` · `src/app/api/community/attachments/[...attachment]/route.ts` · `scripts/seed-demo.ts` · 제안했던 증감 -150줄

(나)에서 정면으로 걸린다. prisma/schema.prisma의 User.deletedAt 주석은 이 저장소에서 가장 길고 명시적인 보존 결정이다 — 「열과 인덱스는 남긴다. 지우려면 마이그레이션이 필요한데, **읽기 경로가 아직 살아 있어** 지우면 그쪽이 함께 깨진다」고 적고 남은 독자를 넷으로 열거한다(로그인 차단·계정 관리·명단/초대·전자출입증). 제안은 그 열거를 「할 일 목록」으로 읽었지만 주석은 그것을 「지우지 않는 이유」로 썼다. 전제도 살아 있다 — 상벌점만 이 열에서 손을 뗐고(merit.repo.ts:420·764가 그 전환을 따로 기록한다), 나머지 넷은 지금도 실행된다. (다)도 걸린다: core/auth/login-eligibility.ts는 status와 deletedAt을 **독립적으로** 보라고 주석에 적혀 있고 tests/core/auth/login-eligibility.test.ts:15-19가 「deletedAt이 찍혀 있으면 status와 무관하게 막는다」를 고정한다. 두 축을 status 하나로 접으면 운영자가 계정을 즉시 막을 수 있는 DB 차원의 두 번째 레버가 사라진다. 「그날이 오지 않았다」는 근거는 결정을 뒤집기에 약하다 — 안 지운 열은 나중에 지울 수 있지만 로그인 차단 축을 하나로 줄인 결정은 되돌리기 어렵다.

**cx-comm-roster-04 · 명단 확정에서 confirmedDeletionIds 왕복과 DELETION_SET_CHANGED 검사를 지운다**

`src/modules/enrollment/roster.service.ts` · `src/modules/enrollment/roster.preview-token.ts` · `src/modules/enrollment/roster.schema.ts` · `src/app/(app)/admin/students/import/actions.ts` · `src/app/(app)/admin/students/import/import-form.tsx` · `tests/modules/enrollment/roster.service.test.ts` · `tests/app/(app)/admin/students/import/actions.test.ts` · `tests/modules/enrollment/roster.preview-token.test.ts` · 제안했던 증감 -105줄

(나)와 (다) 둘 다 걸린다. roster.service.ts:133-137이 「삭제 확인은 둘이 함께 한다 — confirmedDeletionIds는 화면이 본 삭제 대상 집합(동의 표시가 아니다), deletionCountConfirmation은 교사가 적은 인원 수다」로 이 왕복의 역할을 명시하고, roster.preview-token.ts:7-18이 봉인이 무엇을 덮고 무엇을 못 덮는지를 따로 적어 두었다. 제안의 「반드시 통과한다」는 논증은 createRosterFingerprint의 필드 집합 ⊇ planRoster가 existing에서 읽는 필드일 때만 성립하는데, **그 포함관계를 강제하는 것이 코드에 없다.** 지금은 참이지만(fingerprint 11필드 vs plan이 읽는 studentCode·hasGraduatedEnrollment 등) 누군가 planRoster에 새 필드를 물리는 순간 조용히 깨지고, 그때 이 집합 대조가 유일한 그물이다. can()을 서비스 안에서 다시 부르는 저장소 규약(defense-in-depth)과 정확히 같은 성격의 중복이다. 게다가 제안이 요구하는 순서 변경(지문 검사 → planRoster → 토큰 검증)은 지금 가장 앞에 있는 값싼 HMAC 게이트를 getCurrentYear·listExisting(전교 스캔)·planRoster **뒤로** 민다 — 봉인 없는 요청이 전교 명단 조회를 강제할 수 있게 된다. 계정 물리 삭제와 상벌점 Cascade가 걸린 저장소 최다 파괴 경로에서 검사를 걷어낼 이유로는 부족하다.

**cx-comm-roster-09 · 새 글 초안의 난수(nonce)·완료 해시 왕복을 지우고 초안 저장을 네 함수로 줄인다**

`src/app/(app)/community/[slug]/post-draft.ts` · `src/app/(app)/community/[slug]/post-draft-cleanup.tsx` · `src/app/(app)/community/[slug]/post-form.tsx` · `src/app/(app)/community/[slug]/actions.ts` · `src/app/(app)/community/[slug]/[postId]/page.tsx` · `tests/modules/community/post-draft.test.ts` · 제안했던 증감 -150줄

제안자는 「문서화된 결정이 없다」고 했지만 **다섯 자리에 이유가 적혀 있다.** post-draft.ts:29(「제출 뒤 입력에는 새 난수를 붙여 이전 제출의 성공 cleanup과 갈라 놓는다」)·:38(「실패 응답이 돌려준 값보다 제출 뒤 따로 저장된 초안이 최신인지 판별한다」)·:46, post-draft-cleanup.tsx:9·23, 그리고 post-form.tsx:130-135(「보통은 서버 액션 실패가 돌려준 제출값이 최신이다. 다만 제출 뒤 사용자가 더 입력해 난수가 갈린 초안은 그보다 새 것이므로 화면에도 복원한다」). 이 주석들이 함께 말하는 것은 난수가 「성공했을 때만 지운다」 하나가 아니라 **제출이 날아가는 동안 사용자가 계속 타이핑한 경우**를 푼다는 것이다. (다)가 여기서 걸린다 — 제안의 대안(제출 직전에 지우고 오류로 돌아오면 PostFormState.values로 되쓰기)은 비행 중에 더 친 최신 본문을 옛 제출값으로 덮어쓴다. 제안이 적어 둔 손실은 「브라우저가 죽으면 초안이 사라진다」 하나뿐이고 이쪽은 언급조차 없다. post-form.tsx:82-96의 언마운트 동기 저장, :113-125의 pendingDraft 우선 복원도 모두 같은 경쟁을 다루는 장치라 난수만 뽑아낼 수 없다. 사용자가 쓰던 글을 잃는 회귀는 110줄로 살 것이 아니다.

**tests-02 · repo 목을 손으로 적은 팩토리에서 vitest 자동목으로 바꿔, 이름을 두 번 적는 227곳을 없애고 목과 실제 repo가 갈라지는 결함을 닫는다**

`tests/modules/merit/award.service.test.ts` · `tests/modules/merit/rule.service.test.ts` · `tests/modules/merit/threshold.service.test.ts` · `tests/modules/merit/merit.offset.test.ts` · `tests/modules/merit/merit.stats-scope.test.ts` · `tests/modules/merit/merit.watch-list.test.ts` · `tests/modules/merit/stats.ranking.test.ts` · `tests/modules/pass/decision.service.test.ts` · `tests/modules/pass/request.service.test.ts` · `tests/modules/pass/verify.service.test.ts` · `tests/modules/enrollment/roster.service.test.ts` · `tests/modules/enrollment/enrollment.service.test.ts` · `tests/modules/community/board.service.test.ts` · `tests/modules/community/post.service.test.ts` · `tests/modules/community/comment.service.test.ts` · `tests/modules/community/attachment.service.test.ts` · `tests/modules/invites/invite.service.test.ts` · `tests/modules/registration/registration.service.test.ts` · `tests/modules/verification/verification.service.test.ts` · `tests/modules/audit-log/audit-log.service.test.ts` · 제안했던 증감 -355줄

**안전 근거가 사실이 아니다.** 제안은 「`src/modules/*/**.repo.ts`의 런타임 export는 전부 함수이고 non-function export는 전부 `export type`임을 grep으로 확인했다」고 적었으나, 실제로는 **다섯 repo가 런타임 클래스를 내보낸다** — `registration.repo.ts:7 InviteRaceError`, `roster.repo.ts:11 InviteCodeCollisionError`, `academic-year.repo.ts:21 YearTakenError`, `admin-user.repo.ts:108/113 EmailTakenError·UserRevisionConflictError`. 그중 **둘이 이 제안의 20개 대상 파일에 들어 있다**: `tests/modules/registration/registration.service.test.ts`(registration.repo 목, 10개 이름 중 `InviteRaceError` 포함)와 `tests/modules/enrollment/roster.service.test.ts`(roster.repo 목). 서비스는 `registration.service.ts:226 error instanceof repo.InviteRaceError`·`roster.service.ts:393 error instanceof repo.InviteCodeCollisionError`로 그 클래스에 기대고, 테스트는 `new InviteRaceError("ALREADY_USED")`처럼 생성자 인자로 코드를 실어 …

**tests-03 · 통합 테스트 22개 파일이 각자 짠 학생·학년도·반 만들기와 뒷정리를 tests/helpers/db-fixture.ts 하나로 모은다**

`tests/helpers/db-fixture.ts` · `tests/integration/merit.bulk-award.integration.test.ts` · `tests/integration/merit.removed-student.integration.test.ts` · `tests/integration/merit.roster-scope.integration.test.ts` · `tests/integration/pass.flow.integration.test.ts` · `tests/integration/pass.list-window.integration.test.ts` · `tests/integration/dashboard.parent-scope.integration.test.ts` · `tests/integration/enrollment.audit-rollback.integration.test.ts` · `tests/integration/enrollment.unique-constraint.integration.test.ts` · `tests/integration/invite.parent-cap.integration.test.ts` · `tests/integration/invite.student-ownership.integration.test.ts` · `tests/integration/registration.atomicity.integration.test.ts` · `tests/integration/registration.repo.consume-invite.integration.test.ts` · `tests/integration/roster.audit-rollback.integration.test.ts` · `tests/integration/roster.repo.apply-roster.integration.test.ts` · `tests/integration/community.pagination.integration.test.ts` · `tests/integration/community.attachment-cap.integration.test.ts` · `tests/integration/academic-year.single-current.integration.test.ts` · `tests/integration/audit-atomicity.integration.test.ts` · `tests/integration/year-race.import-and-admin.integration.test.ts` · `tests/integration/roster.hard-delete.integration.test.ts` · `tests/integration/account.repo.change-password-race.integration.test.ts` · `tests/integration/verification.rate-limit.integration.test.ts` · 제안했던 증감 -480줄

(나) **옮기려는 픽스처의 모양 자체에 이유가 길게 적혀 있다.** `tests/integration/merit.removed-student.integration.test.ts`의 머리말 29줄(5~33행)이 「예전 판은 `user.deletedAt`을 손으로 세웠는데 그 값을 채우는 코드가 운영에 없다 → 픽스처를 운영이 만드는 상태로 다시 썼다」를 적고, 특히 **「반·번호는 일부러 남겨 둔다 — 반을 비워 두면 조건을 지워도 테스트가 통과한다」**고 못 박는다. 기본값을 든 `makeStudent({...})` 팩토리는 바로 그 함정을 22개 파일에 제도화하는 것이다 — 기본값 한 줄이 바뀌면 여러 파일의 단언이 조용히 무력해진다. 같은 방향은 `docs/reviews/2026-08-31-codebase-audit.md:95-96`(「픽스처를 운영 경로(applyRoster)로 바꿔야 다시 붙든다」)과 `2026-09-01-fix-batch.md:126`에도 있다. 제안은 이 파일을 예외로 두겠다고 하지만, **예외 목록을 안전하게 그을 수 없다** — 필드 선택이 곧 음의 단언인 파일이 이 셋만이 아니다(dashboard.parent-scope의 역할 배선, pass.list-window의 세 사용자, invite.student-ownership의 소유 관계, roster.hard-delete:94-101의 졸업생 방어선 주석). (다) `cleanupFixtures()` 하나가 22개 파일의 손으로 짠 외래키 삭제 순서를 대체하는데, 통합 스위트는 **바로 그 외래키·트랜잭션·유일 제약 불변식을 …

**tests-04 · 거부 경로를 it.each 표로 모으고 「아무것도 쓰지 않았다」 단언을 한 벌로 고정한다 — roster 삭제 가드 13건과 merit 인원 상한 3건**

`tests/modules/enrollment/roster.service.test.ts` · `tests/modules/merit/award.service.test.ts` · 제안했던 증감 -85줄

(나)+대기 작업 충돌: 이 제안이 표로 흡수하겠다는 바로 그 자리가 **대기 중인 수정 배치의 대상**이다 — `roster-3-R02`가 `tests/modules/enrollment/roster.service.test.ts:544`(「확인한 id 집합이 … repo에 넘긴다」, 제안 범위 530~753행 안)에 managedStudentProfileIds·createdById 단언을 넣고, `roster-3-C03`이 같은 파일 :259를 고친다. 표로 접은 뒤에 그 항목을 넣으면 표의 고정 본문과 충돌한다. (다)+실측 오류: merit 쪽이 잘못 세어졌다. `award.service.test.ts:733`의 `describe("인원 상한")`은 **세 건이 아니라 다섯 건**이고(734·744·757·767·777), 그중 순수 거부는 두 건뿐이다 — 757·767은 통과 경로라 `applyRoster` 호출을 단언하고 777은 `toBeInstanceOf(MeritError)` 검사다. 2행짜리 `it.each`는 표 뼈대를 포함하면 지금보다 줄지 않는다. roster 쪽도 마찬가지로, 「인원 대조」 6건 중 3건(741·748의 통과 케이스, 「삭제 대상이 없으면 통과」)은 `applyRoster`가 **불렸음**을 단언하므로 「아무것도 쓰지 않았다」 본문을 공유할 수 없다. 실제 표로 묶을 수 있는 순수 거부는 :531·:547·:677·:686·:697·:710·:729 정도 7건이고 회수분은 약 -40줄이다(-85가 아니다). 그리고 「단언 한 벌이 모든 행에 걸린다」는 것은 곧 지금 …

**dead-08 · 도달할 수 없는 엔드포인트만 설정하는 Better Auth 접근제어 표(permissions.ts)와 그 전용 테스트를 지운다**

`src/core/auth/permissions.ts` · `src/core/auth/auth.ts` · `tests/core/auth/permissions.test.ts` · 제안했던 증감 -149줄

CLAUDE.md가 「Better Auth admin 플러그인의 접근제어(core/auth/permissions.ts)는 계정 관리 API 전용이며 업무 권한과 섞지 않는다」로 이 표의 자리를 명시했고 그 전제는 살아 있다 — 「지금 그 API가 route.ts로 닫혀 있다」는 것은 전제의 붕괴가 아니라 같은 문에 걸린 둘째 자물쇠일 뿐이다. permissions.ts는 STUDENT·PARENT에게 user·session 권한을 명시적으로 0으로 못 박는 deny-by-default 선언이고, 표를 지우면 Better Auth 기본값에 기대게 된다. 이 저장소는 「페이지에서 이미 막았어도 서비스에서 can()을 다시 부른다」는 방어 다중화를 명문 규칙으로 두므로, 제안자 스스로 「나중에 admin 엔드포인트를 여는 커밋이 다시 넣어야 한다」고 적은 이 삭제는 그 규칙에 정면으로 어긋난다. 얻는 19+130줄이 그 위험을 못 산다.

**dead-13 · 지금 아무도 타지 않는 인증코드 발송·대조 경로(알리고 발송기·requestCode·confirmCode·인증번호 입력 UI)를 통째로 지운다**

`src/modules/verification/senders/aligo.ts` · `src/modules/verification/verification.sender.ts` · `src/modules/verification/verification.service.ts` · `src/modules/verification/verification.schema.ts` · `src/instrumentation.ts` · `src/app/(auth)/register/verified-field.tsx` · `src/app/(auth)/register/actions.ts` · `src/lib/masks.ts` · `scripts/seed-demo.ts` · `docker-compose.yml` · `.env.example` · `tests/modules/verification/aligo.test.ts` · `tests/modules/verification/sender.test.ts` · `tests/modules/verification/mock-mode.test.ts` · `tests/modules/verification/verification.service.test.ts` · 제안했던 증감 -930줄

CLAUDE.md가 「지금 인증은 실제로 발송하지 않는다」 절 전체로 이 상태를 설명하면서 「설정은 다시 켤 때를 위해 보존돼 있다」고 보존을 명시했고, docker-compose.yml:97-99와 registration.service.ts:65-73 주석이 같은 결정을 가리킨다. 전제(언젠대 발송을 켠다)는 무너지지 않았다 — 학교 시스템에서 번호·이메일 소유 증명이 필요해지는 날이 오면 그 기계가 그대로 필요하다. 제안 본문 스스로 「사용자가 정해야 한다」로 결정을 미루므로 검증자가 채택할 수 없다. 사실관계는 제안이 맞다(requestVerification이 항상 verified:true를 돌려주고 verified-field.tsx:78이 sent를 참으로 만들 유일한 자리라 confirm 경로가 죽었음을 확인). 다만 이 파일에는 살아 있는 경로도 있다 — createTemporaryVerifiedProof(:150-166)가 insertRateLimitedCode를 부르므로 대상별·IP별 발송 제한이 지금 가입 경로에 실제로 걸린다. 930줄을 이 파일에서 도려내는 일은 그 게이트를 스치므로 위험이 줄 수 이득보다 크다.

**dead-15 · 저장소가 벤더 Prisma 스킬 문서 89개(약 10,800줄)를 추적하는 것을 그만두고 .gitignore로 옮긴다**

`.agents` · `.claude` · `.windsurf` · `.gitignore` · `next.config.ts` · 제안했던 증감 -10860줄

「저장소 코드가 참조하지 않는다」는 것이 「아무도 안 쓴다」가 아니다 — .agents/skills의 Prisma 스킬 아홉(prisma-cli·prisma-client-api·prisma-upgrade-v7·prisma-driver-adapter-implementation 등)은 이 저장소에서 일하는 에이전트 도구가 실제로 읽고 있고, 지금 이 세션의 사용 가능 스킬 목록에도 그대로 올라와 있다. AGENTS.md가 「네가 아는 Next.js가 아니다 — 코드를 쓰기 전에 문서를 읽어라」로 벤더 문서 참조를 규범으로 세운 저장소에서 Prisma 7 문서를 클론에서 빼면, 새로 받은 사람과 CI 에이전트는 그 문서 없이 마이그레이션·드라이버 어댑터를 만지게 된다. skills-lock.json은 해시 매니페스트일 뿐 저장소에 재취득 스크립트가 없어(package.json 27개 스크립트에 없음) 「언제든 다시 받을 수 있다」가 코드로 뒷받침되지 않는다. `git ls-files`가 시끄러운 것은 검색 범위를 제외 패턴으로 좁혀 풀 문제이지 벤더 문서를 버릴 이유가 아니다. 다만 next.config.ts의 outputFileTracingExcludes에 세 디렉터리가 빠져 있는 것은 사실이고(.superpowers·.playwright-mcp만 있다), 그 한 조각은 따로 처리할 값이 있다.

---

## 6. 확인했고 깨끗한 것

보안 감사의 음성 결과도 산출물이다.

- **주입** — `$queryRaw`·`$executeRaw` 15자리 전부 태그드 템플릿. `$queryRawUnsafe`·`$executeRawUnsafe`는 저장소에 없다.
- **의존성** — `npm audit` 취약점 0건. 선언된 30개 전부 실제로 import된다(`@prisma/client`는 `src/generated` 경유, `pretendard`는 `layout.tsx`의 CSS import, `@tailwindcss/postcss`는 `postcss.config`).
- **첨부 응답 헤더** — Next의 path-to-regexp로 `/api/community/attachments/:id*`가 `/<id>/<파일이름>`까지 매치하는 것을 실측했다. 첨부 응답에 전역 CSP가 아니라 `default-src 'none'; sandbox`가 실제로 선다.
- **비밀** — `.env`가 이미지로 넘어가는 경로가 닫혀 있다(`sanitize-standalone`·`check-standalone`이 `npm run build`에 묶이고 Dockerfile builder가 그 뒤 산출물만 복사한다). `NEXT_PUBLIC_` 변수 0개. `BETTER_AUTH_SECRET`을 읽는 세 모듈 중 클라이언트 컴포넌트가 임포트하는 것은 없다.
- **세션 무효화** — 비밀번호 변경·초기화·계정 중지는 같은 트랜잭션에서 `session.deleteMany`를 돌리고, 완전 삭제는 `Session`의 `onDelete: Cascade`가 받는다.
- **권한 표** — 액션 24개를 부르는 서비스 함수를 전수 대조했고 `assertCan`을 빠뜨린 것은 `getMyStudentQr` 하나뿐이었다(sec-03). 세션에서 유도할 수 있는 식별자를 인자로 받는 자리는 없다.
- **역할 상승** — `updateUserSchema`에 `role`이 없고, Better Auth admin 플러그인의 mutation은 `[...all]` 화이트리스트가 전부 404로 떨어뜨린다.
- **토큰 엔트로피** — 학생증 HMAC 96비트에 20초 창, 부트스트랩 256비트·1회성·메모리 전용, 초대코드 39.6비트에 2차 요소 5회 제한, `storageKey` 128비트.
- **업로드 순서** — 권한 → 동시 3건 → 상한까지만 본문 수집 → 확장자로 형식 판정 → EXIF 제거 실패 시 거절.

## 7. 제안으로 내지 않은 관찰

고치려면 한 커밋을 넘거나, 위험이 운영 설정에 달렸거나, 이미 문서가 미뤄 둔 것들이다.

- **`/scan?c=<코드>`가 학생증 코드를 쿼리에 실어** 프록시 접근로그에 남는다. 20~40초짜리 값이라 재사용은 무의미하지만, `studentProfileId`와 시각이 감사 체계 밖에 영구히 쌓이는 이동 기록이 된다. 고치려면 판정 뒤 `?c=`를 털고 결과를 짧은 서명 쿠키로 옮겨야 한다(`pass-flash`가 이미 그 모양이다).
- **`checkInvite`는 로그인 없이 부를 수 있고 횟수 제한도 기록도 없는 오라클**이다. 코드 공간이 31^8≈8.5×10^11이고 2차 요소가 5회로 잠기며, 추측마다 감사로그를 남기면 그쪽이 감사 테이블 범람이라는 더 나쁜 문을 연다.
- **감사로그의 IP는 무기한 보존된다.** 삭제·정리 경로가 코드에도 마이그레이션에도 없고, 스키마 주석이 「감사로그는 삭제 경로가 없어 단조 증가한다」고 스스로 적는다. 보관 기간 정책이 필요해지는 날 함께 볼 자리다.
- **글에 붙은 첨부에는 용량 상한도 글쓰기 속도 제한도 없다.** 설계 문서가 이미 이름을 붙여 미룬 것이다(`2026-08-28-community-design.md:396`).

## 8. 이 문서를 쓰면서 직접 확인한 것

에이전트 보고를 그대로 옮기지 않고 손으로 재현한 둘을 적어 둔다.

**하나 — 다섯 문서가 경고하는 인덱스 DROP은 재현되지 않는다.** `CLAUDE.md:259` · `README.md:285` · `docs/deploy.md:424` · `prisma/schema.prisma:230`과 repo 주석이 「다음 `migrate dev`가 `AcademicYear_single_current`를 군더더기로 보고 `DROP INDEX`를 만들 수 있다」고 적는다. 섀도 DB를 만들어 마이그레이션 21개를 전부 적용한 뒤 현재 스키마와 대조했더니 결과가 **빈 마이그레이션**이었고 인덱스는 그대로 살아 있었다(Prisma 7.9.1).

```
$ prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
-- This is an empty migration.

$ psql -tAc "select indexdef from pg_indexes where indexname='AcademicYear_single_current'"
CREATE UNIQUE INDEX "AcademicYear_single_current" ON public."AcademicYear" USING btree ("isCurrent") WHERE "isCurrent"
```

경고를 지우자는 것이 아니라 **사실 한 줄로 줄이고 「메이저 업그레이드 때 다시 확인한다」를 함께 적자**는 것이 db-02다.

**둘 — `getMyStudentQr`에 `assertCan`이 없다**(sec-03). 프로필 유무만 보고 없으면 `ForbiddenError`를 던진다. 권한 표에서 `pass:request`를 학생에게서 거둬도 이 경로는 계속 학생증을 발급한다 — 뚫린 구멍이 아니라 defense-in-depth의 빈칸이다.

```ts
// src/modules/pass/request.service.ts:301
export async function getMyStudentQr(actor: SessionUser, now: Date = new Date()) {
  const profile = await repo.findStudentProfileByUserId(actor.id);
  if (!profile) { await recordDenied(actor, "pass:request", actor.id); throw new ForbiddenError("pass:request"); }
```
