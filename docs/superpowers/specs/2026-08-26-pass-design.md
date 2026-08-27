# 전자출입증 설계

날짜: 2026-08-26
상태: 승인됨 · **2026-08-27 개정** (아래 「개정」 절)

---

## 개정 — 2026-08-27: QR이 출입증에서 학생증으로 옮겨졌다

**이 문서의 QR 부분은 더 이상 코드와 맞지 않는다.** 아래 본문은 20초마다 갈리는
출입증별 토큰을 전제로 쓰였으나, 지금은 **학생 한 명에 코드 하나가 고정으로 붙는다.**
학생증과 같은 방식이다. 본문을 지우지 않는 이유는, 무엇을 버렸는지가 그 자리에
적혀 있어야 다음 사람이 같은 저울을 다시 달 수 있어서다.

| | 이전 (본문) | 지금 |
|---|---|---|
| 코드가 붙는 곳 | 출입증 한 건 | 학생 프로필 |
| 수명 | 20초(직전 창까지 40초) | 무기한 |
| 서명 대상 | `passId:step` | `studentProfileId` |
| HKDF info | `gbsw-pass-qr-v1` | `gbsw-student-qr-v1` |
| 판정이 답하는 것 | 이 출입증이 유효한가 | **이 학생이 지금 나가도 되는가** |
| 갈래 | VALID·NOT_YET·EXPIRED·NOT_APPROVED·REJECTED·CANCELLED·STALE·UNKNOWN | VALID·NOT_YET·EXPIRED·NOT_APPROVED·**NO_PASS**·UNKNOWN |

**버린 것과 그 대가.** 화면을 찍어 둔 사진이 영원히 통한다. 한 명만 재발급할 길도
없다 — 코드를 갈려면 HKDF info를 올려야 하고 그러면 전교가 한꺼번에 바뀐다.
`StudentProfile`에 회전용 열을 두지 않았다: 지금 쓸 화면이 없는 열은 죽은 열이 되고
(같은 실수가 `User.deletedAt`에 있다), 필요해지는 날 마이그레이션 한 번이면 된다.

**그래도 되는 근거.** 이 코드는 **허가가 아니라 신원**이다. 찍는 순간 서버가
그 학생의 현재 상태를 판정하므로, 사진을 든 사람이 얻는 것은 남의 이름이 뜨는
화면뿐이고 정문에 선 사람은 그 이름의 주인이 아니다. 판독 화면 자체도 로그인을
요구한다. 종이 학생증이 위조를 막는 방식과 같다 — 사람과 이름을 눈으로 맞춘다.

**반려·취소는 판정에서 아예 뺐다.** 학생증은 로그인한 누구나 찍을 수 있어서,
「반려됨」을 띄우면 남의 신청 이력이 샌다. 그런 학생은 `NO_PASS`로 떨어진다.

## 문제

기숙사 학교라 학생이 교문을 나가는 일에 허가가 붙는다. 지금은 종이다 —
학생이 외출증을 받아 들고 나가고, 정문에서 그것을 보인다. 종이는 세 군데서 샌다.

- **위조·재사용.** 어제 것을 오늘 보여도 정문에서는 알기 어렵다.
- **기록이 남지 않는다.** 누가 언제 무엇을 허가했는지가 종이와 함께 사라진다.
- **학부모 동의가 구두다.** 외박은 보호자 확인이 전제인데, 확인했다는 사실이
  어디에도 안 남는다.

전자출입증은 이 셋을 없앤다. **핵심은 「지금 이 화면이 진짜인가」를 정문에서
20초 안에 판정할 수 있게 하는 것**이고, 그래서 QR이 시간에 따라 계속 바뀐다.

## 범위

**만드는 것**

- 외출·외박 두 유형의 출입증
- 학생 신청 → (외박이면) 학부모 동의 → 교사 승인 흐름
- 교사가 신청 없이 바로 부여하는 경로
- 20초마다 바뀌는 QR
- 검증 경로 둘 — 폰 기본 카메라 · 사이트 안의 스캐너. **둘 다 QR을 읽는 길이다**

**만들지 않는 것 (그리고 그래서 잃는 것)**

- **스캔 기록(`PassScan`)을 남기지 않는다.** 검증은 「이 출입증이 지금 유효한가」에만
  답하고 아무것도 쓰지 않는다. 그래서 **「몇 시에 나갔나」와 「아직 안 들어온 학생」을
  물을 자료가 없다.** 그게 필요해지는 날 스캔 기록을 얹으면 되고, 토큰과 QR은 그대로
  쓸 수 있다.
- 외출 중 위치·귀교 알림·지각 집계. 상벌점 모듈이 이미 벌점을 다루므로, 미복귀를
  벌점으로 옮기는 일은 사람이 한다.
- 학부모에게 가는 알림. 이 시스템은 아직 아무것도 발송하지 않는다
  (CLAUDE.md 「지금 인증은 실제로 발송하지 않는다」). 학부모는 로그인해서 본다.

## 위협

이 기능의 본질은 **정문에서 「진짜인가」를 판정하는 것**이라, 막아야 할 것이 분명하다.

| 위협 | 대응 |
|---|---|
| 어제 찍은 스크린샷을 오늘 보여준다 | 토큰이 20초마다 바뀐다. 허용 창은 20~40초 |
| 남의 화면을 사진 찍어 두었다 같은 시간에 쓴다 | 창 안이면 통과한다. **막지 않는다** — 검증자가 눈앞의 학생을 보고 찍기 때문에 이득이 없다 |
| QR 토큰을 손으로 만들어 낸다 | 96비트 HMAC 서명. 비밀은 서버에만 있다 |
| 학생이 남의 사유·행선지를 읽는다 | 검증 화면은 이름·학번·유형·유효 시각까지. 사유·행선지는 `pass:read:any`(교사)에게만 |
| 승인 없이 스스로 출입증을 만든다 | 생성은 서비스가 하고 상태는 항상 서버가 정한다. 클라이언트가 `status`를 주장할 수 없다 |
| 검증 주소를 열기만 해도 기록이 바뀐다 | **GET은 아무것도 쓰지 않는다.** 방문기록 재방문·프리페치가 행을 만들면 안 된다 |
| 학부모 동의를 건너뛴다 | 외박의 `APPROVED` 전이는 `consentedAt`이 있거나 `consentByProxy`일 때만 |

## 설계

### 1. 토큰 — 20초마다 바뀌는 값

```
step   = floor(epochSeconds / 20)
mac    = HMAC-SHA256(비밀, `${passId}:${step}`)          // 32바이트

QR 내용 = https://<호스트>/scan?c=<passId>.<base64url(mac[0..12])>
```

검증은 `step ∈ {지금, 지금−1}` 둘로 시도한다. 즉 **화면에 뜬 값은 20~40초 유효**하다.
앞 step만 허용하는 이유: 미래 step까지 받으면 유효 창이 60초로 늘어나는데, 늘려서
얻는 것은 서버 시계가 검증자 쪽보다 빠를 때뿐이고 그 경우는 없다(둘 다 서버 시계다).

**QR이 가리킬 주소**는 `BETTER_AUTH_URL`에서 읽는다. 앱은 `127.0.0.1`에만 묶이고
공개 주소는 리버스 프록시가 쥐고 있어(`docs/deploy.md`) 요청 헤더로는 알 수 없다.
`BETTER_AUTH_URL`은 **이미 이 시스템의 공개 출처를 정하는 값**이라(어긋나면 로그아웃이
`INVALID_ORIGIN`으로 실패한다) 여기서 새 환경변수를 만들 이유가 없다.

**QR이 가리키는 곳은 판독 화면 자신이다.** 폰 카메라로 찍으면 `/scan?c=<토큰>`이 열리고
그 화면이 `c`를 보고 **그 자리에서 판정을 낸다** — 중간에 다른 주소를 거치지 않는다.
`c`가 없이 들어오면 같은 화면이 카메라 스캐너를 켠다. **검증 경로 둘이 화면 하나로
모인다**(§11).

**손으로 칠 수 있는 짧은 코드는 두지 않는다.** 검증은 QR을 읽는 길 하나뿐이다 —
카메라 스캔이 안 되는 브라우저에서는 폰 기본 카메라로 찍으면 되고 그쪽은 어디서나
된다. 짧은 코드를 두면 그것을 지키느라 대조 범위·충돌 처리·횟수 제한이 따라붙는데,
**얻는 것은 이미 있는 경로의 중복이다.**

**비밀**은 새 환경변수를 만들지 않고 `BETTER_AUTH_SECRET`에서 파생한다.

```ts
hkdfSync("sha256", BETTER_AUTH_SECRET, "", "gbsw-pass-qr-v1", 32)
```

근거: 배포 문서(`docs/deploy.md`)에 손댈 것이 늘지 않고, 이 비밀이 유출되는 경로는
`BETTER_AUTH_SECRET`이 유출되는 경로와 같다(같은 프로세스의 환경변수). 따로 두면
관리 지점만 하나 늘고 안전은 그대로다. `info` 문자열에 `v1`을 넣어 두므로, 나중에
회전이 필요하면 `v2`로 바꾸는 것만으로 그 시각 이후 모든 토큰이 갈린다.

**모듈:** `src/modules/pass/pass.token.ts` — DB를 모르는 순수 함수 셋이다.

```ts
export function issueToken(passId: string, at: Date): { token: string; validUntil: Date }
export function verifyToken(token: string, at: Date): { passId: string } | "STALE" | "MALFORMED"
```

`verifyToken`이 세 갈래인 이유는 화면 문구가 갈리기 때문이다 — 아래 §5.
**이 함수는 DB를 모른다.** `STALE`은 「형식은 맞는데 서명이 이 창의 것이 아니다」일
뿐이고, 그 `passId`가 실재하는지는 `verify.service`가 확인한다.

### 2. QR 그리기

`uqr@0.1.3`을 넣는다. **의존성 0개, ~10KB.** QR 인코딩은 Reed-Solomon 오류정정이라
직접 짜면 안 되는 종류이고, 이 저장소의 다른 의존성처럼 하는 일이 하나뿐인 조각이다.

`encode(text)`가 `{ size, data: boolean[][] }`를 준다. 우리 URL 길이면 **35×35(버전 4)**다.
내장 `renderSVG`는 4KB짜리 문자열을 뱉으므로 쓰지 않고, `data`에서 `<path>`의 `d`
문자열 하나를 만든다.

```ts
// src/modules/pass/pass.qr.ts  (서버 전용)
export function toQrPath(text: string): { size: number; d: string }
```

클라이언트는 `<svg viewBox={`0 0 ${size} ${size}`}><path d={d} /></svg>` 한 줄로 그린다.
**DOM 노드 하나, `dangerouslySetInnerHTML` 불필요, `uqr`이 클라이언트 번들에 안 들어간다.**

### 3. 데이터 모델

```prisma
/// 전자출입증. 외출(당일 복귀)·외박(밤을 밖에서).
model Pass {
  id String @id @default(cuid())

  /// **학생의 영구 식별자에 매단다. Enrollment가 아니다** — MeritAward와 같은 이유.
  studentProfileId String
  studentProfile   StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)

  /// OUTING | OVERNIGHT — src/core/authz/pass-type.ts의 PassType과 일치해야 한다.
  type String
  /// REQUESTED | CONSENTED | APPROVED | REJECTED | CANCELLED — 같은 파일의 PassStatus.
  /// **EXPIRED는 없다.** 만료는 endAt으로 읽을 때 계산한다 (§4).
  status String @default("REQUESTED")

  /// 유효 창. 외출은 시각까지, 외박은 KST 자정 눈금이다 (§4).
  startAt DateTime
  endAt   DateTime

  destination String   // 행선지
  reason      String   // 사유

  /// 이 줄을 만든 사람. 학생 신청이면 학생, 교사 직접 부여면 교사.
  requestedByUserId String?
  requestedBy       User?   @relation("PassRequestedBy", fields: [requestedByUserId], references: [id], onDelete: SetNull)
  requestedByName   String

  // ── 학부모 동의 (외박만)
  consentedByUserId String?
  consentedBy       User?     @relation("PassConsentedBy", fields: [consentedByUserId], references: [id], onDelete: SetNull)
  consentedByName   String?
  consentedAt       DateTime?
  /// true면 교사가 보호자 확인을 대신 기록한 것이다 (전화 확인 등).
  consentByProxy    Boolean   @default(false)
  consentNote       String?

  // ── 교사 결재
  decidedByUserId String?
  decidedBy       User?     @relation("PassDecidedBy", fields: [decidedByUserId], references: [id], onDelete: SetNull)
  decidedByName   String?
  decidedAt       DateTime?
  decisionNote    String?   // 반려 사유

  // ── 취소 (승인 후 무르기 / 학생 철회)
  cancelledByUserId String?
  cancelledBy       User?     @relation("PassCancelledBy", fields: [cancelledByUserId], references: [id], onDelete: SetNull)
  cancelledByName   String?
  cancelledAt       DateTime?
  cancelReason      String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  /// 학생 한 명의 내역 — 최신순.
  @@index([studentProfileId, startAt(sort: Desc)])
  /// 교사의 결재 대기 목록 / 지금 유효한 것 훑기.
  @@index([status, endAt])
}
```

이름 스냅샷(`*ByName`)과 `onDelete: SetNull`은 `MeritAward`와 완전히 같은 규약이다 —
과거의 사실이 살아 있는 외래키에 기대면 안 된다. `User`·`StudentProfile` 쪽에 역관계
필드를 함께 추가한다.

**`year`(학년도)를 넣지 않는다.** 상벌점은 학년도가 곧 집계 범위라 필요했지만,
출입증은 날짜로 묻는 자료다(`startAt` 범위). 학년도를 넣으면 `AcademicYear`에
Restrict FK가 하나 더 생기고 그 잠금을 명단 반영이 쥔다 — 얻는 것 없이 경합만 는다.

### 4. 시각 규약

`src/lib/datetime.ts`는 지금 **KST 자정 눈금 하나뿐**이다(`parseDateInputKst`).
외출은 시각을 받아야 하므로 짝을 하나 더 만든다.

```ts
/** `YYYY-MM-DD` + `HH:MM` → KST 그 시각. parseDateInputKst와 같은 규약이다. */
export function parseDateTimeInputKst(date: string, time: string): Date
/** `<input type="time">`에 넣을 `HH:MM` (KST). */
export function formatTimeInput(value: Date): string
```

유형별 눈금:

| 유형 | `startAt` | `endAt` |
|---|---|---|
| 외출 | 그날 KST 시각 | **같은 KST 날짜**의 더 늦은 시각 |
| 외박 | 시작일 KST 자정 | **종료일 다음 날** KST 자정 (종료일 끝) |

외출이 날짜를 넘으면 그것은 외박이다 — 유형으로 갈린다.

기간 제한 둘:

- **외박은 한 번에 7일까지**(`PERIOD_TOO_LONG`). 그보다 길면 출입증이 아니라 결석
  처리의 영역이고, 그 사이 학년도가 넘어갈 수도 있다.
- **`START_IN_PAST`는 학생 신청에만 걸리고, 눈금이 유형마다 다르다.** 외출은 시각으로
  보되 10분 유예가 있다 — 14:00 외출을 13:59에 적다가 14:01에 내면 그것은 실수가 아니다.
  **외박은 날짜로 본다:** 시각으로 보면 `startAt`이 시작일 자정이라 오늘 밤 외박을 낮에
  신청하는 **가장 흔한 경우**가 「아홉 시간 전에 시작했다」는 이유로 막힌다. 교사 직접
  부여는 `startAt`을 입력받지 않으므로(항상 지금) 이 오류가 나올 자리가 없다.

**교사 직접 부여는 `startAt`을 입력받지 않는다.** 「지금 내보낸다」는 상황이므로
`startAt = 지금`이고, 외출이면 종료 시각만, 외박이면 종료 날짜만 고른다.
폼이 절반으로 줄고, 「과거로 부여」라는 상태가 아예 생기지 않는다.

**만료는 저장하지 않는다.** 이 앱에 크론이 없고 넣지 않는다. `EXPIRED`를 열로 두면
그것을 찍어 줄 무언가가 필요해지고, 안 찍힌 행과 찍힌 행이 섞이는 순간 어느 쪽을
믿을지 모호해진다. 읽을 때 `endAt`과 비교하는 편이 항상 옳다.

### 5. 판정

검증 두 경로가 모두 같은 함수로 떨어진다 — 둘 다 손에 쥔 것은 토큰 하나다.

```ts
// src/modules/pass/verify.service.ts
export type Verdict =
  | "VALID"         // 유효
  | "NOT_YET"       // 아직 시작 전 (startAt이 미래)
  | "EXPIRED"       // 기간이 지났다
  | "NOT_APPROVED"  // 아직 승인 전 (REQUESTED / CONSENTED)
  | "REJECTED"      // 반려됨
  | "CANCELLED"     // 취소됨
  | "STALE"         // 코드가 지났다 — 화면을 새로 고쳐야 한다
  | "UNKNOWN";      // 알 수 없는 코드
```

`verifyToken`의 세 결과가 이렇게 옮겨진다.

| `verifyToken` | 그다음 | `Verdict` |
|---|---|---|
| `{ passId }` | 그 줄을 읽어 상태·시각을 본다 | `VALID` / `NOT_YET` / `EXPIRED` / `NOT_APPROVED` / `REJECTED` / `CANCELLED` |
| `"STALE"` | 그 `passId`가 실재하는지만 확인 | 있으면 `STALE`, 없으면 `UNKNOWN` |
| `"MALFORMED"` | 조회하지 않는다 | `UNKNOWN` |

**`STALE`에서는 사유·행선지를 싣지 않는다.** 이 갈래는 서명이 맞지 않은 채로 들어온
것이라, `passId`만 알면 누구나 도달할 수 있다(그것이 `STALE`의 정의다). 이름·유형·
유효 시각까지는 「김민준 학생, 화면을 새로 고쳐 주세요」를 말하는 데 필요해서 남기고,
그보다 안쪽은 서명이 맞았을 때만 연다 — `pass:read:any`를 가진 교사에게도 그렇다.

**`STALE`과 `UNKNOWN`을 구분한다.** 「passId는 맞다」를 알려주는 셈이지만, 그것을 아는
사람은 이미 그 화면을 본 사람이고 서명은 여전히 만들 수 없다. 반대로 구분하지
않으면 정문에서 **가장 흔한 상황**(학생 화면이 20초 지나 굳었다)에 「알 수 없는
코드」가 떠서, 교사가 위조를 의심하게 된다. 안내 품질이 훨씬 크다.

### 6. 상태 기계

```
외출  학생 신청 ─→ REQUESTED ─교사 승인→ APPROVED ─취소→ CANCELLED
                        ├─교사 반려→ REJECTED
                        └─학생 철회→ CANCELLED

외박  학생 신청 ─→ REQUESTED ─학부모 동의→ CONSENTED ─교사 승인→ APPROVED
                        ├─교사 반려→ REJECTED       (동의 전에도 반려할 수 있다)
                        └─학생 철회→ CANCELLED

교사 직접 부여 ────────────────────────────────────→ APPROVED (즉시)
```

**외출에는 학부모 동의가 없다.** 당일 귀교라 보호자 확인이 관행이 아니고, 넣으면
방과 후 병원 한 번에 세 사람이 붙는다. `CONSENTED`는 외박에서만 나타난다 —
외출에 동의를 시도하면 `CONSENT_NOT_ALLOWED`다.

**보호자 확인 대행이 있다.** 학부모 계정이 없거나 응답이 없으면 교사가
「전화로 보호자 확인함」을 대신 기록하고 승인한다(`consentByProxy = true`,
`consentedByName`에 교사 이름, `consentNote`에 확인 방법). **이것이 없으면 실제
학교에서 외박이 교착된다** — 학부모 계정 보급률이 100%가 되는 날은 없다.
교사 직접 부여도 외박이면 이 표시가 함께 찍힌다(폼에서 필수 체크).

**전이는 읽고 나서 쓰지 않는다 — 조건부 갱신 하나로 한다.**
`repo.updateMany({ where: { id, status: { in: [...] } }, data: ... })`를 쓰고
**갱신 건수가 0이면 `ALREADY_DECIDED`로 떨어진다.** 읽어서 확인한 뒤 쓰면 두 교사가
같은 신청을 동시에 승인했을 때 **둘 다 통과하고 감사로그가 두 줄** 남는다.
`merit.repo.markRuleDeleted`가 이미 같은 방식이다 — 그것을 따른다.

전이 규칙:

- `REQUESTED`·`CONSENTED`에서만 승인·반려할 수 있다. 그 밖이면 `ALREADY_DECIDED`.
- 외박의 `APPROVED` 전이는 `consentedAt != null` 또는 `consentByProxy = true`일 때만.
  아니면 `CONSENT_REQUIRED`.
- 학생 철회는 `REQUESTED`·`CONSENTED`에서만. 승인된 것을 무르는 일은 교사가 한다.
- `CANCELLED`·`REJECTED`는 끝 상태다.

**겹침:** 같은 학생에게 기간이 겹치는 `REQUESTED`/`CONSENTED`/`APPROVED` 출입증이
이미 있으면 `OVERLAPPING_PASS`로 거부한다. **학생 신청과 교사 직접 부여 둘 다에
건다** — 한 학생에게 같은 시각 유효한 출입증이 둘이면 어느 쪽을 보인 것인지 알 수 없다.
애플리케이션 검사이므로 **동시 신청 두 건이 둘 다 통과할 수 있다.** Postgres `EXCLUDE USING gist`로 DB가 막을 수 있지만,
Prisma가 표현하지 못해 마이그레이션 SQL에만 남는다 — 이 저장소에는 그렇게 남은
인덱스(`AcademicYear_single_current`)가 이미 하나 있고 CLAUDE.md가 그 위험을 길게
적어 두었다. **같은 함정을 하나 더 파지 않는다.** 겹친 두 건이 실제로 생기면
학생 화면과 교사 목록에 둘 다 보이므로, 교사가 하나를 취소하면 된다.

### 7. 권한

`core/authz/can.ts`의 `Action`과 `RULES`에 일곱 줄을 더한다.

```ts
"pass:request"   → ["STUDENT"]   // + 서비스가 세션→StudentProfile 소유권 검사
"pass:consent"   → ["PARENT"]    // + 세션→ParentStudent→학생 소유권 검사
"pass:verify"    → ["STUDENT", "PARENT"]   // 로그인한 전 역할
"pass:approve"   → []            // 교사 전용 — 승인·반려
"pass:issue"     → []            // 교사 전용 — 직접 부여
"pass:cancel"    → []            // 교사 전용 — 승인된 것 무르기
"pass:read:any"  → []            // 교사 전용 — 남의 출입증과 사유·행선지
```

`pass:verify`를 역할로 가르지 않는 근거: **판정을 내려면 살아 있는 QR이
필요하고, 그건 학생 화면 앞에 서 있다는 뜻이다.** 그 자리에 선 사람이 교사인지 자치위원
학생인지 데리러 온 학부모인지 시스템이 구분해 봐야 얻는 것이 없다. 나오는 것도
이름·학번·유형·유효 시각뿐이다 — **사유와 행선지는 여전히 `pass:read:any`(교사)에게만.**

액션을 남겨 두는 이유는 판정이 여전히 서비스를 거치는 일이고, 나중에 「자치위원만」처럼
좁힐 자리가 필요할 수 있어서다. 지금은 전 역할이다.

**`can()`으로 못 가르는 것 둘**은 `invite.service.revokeInvite`와 같은 방식으로 처리한다
— 서비스가 소유권을 검사하고 `ForbiddenError`를 직접 던지며 같은 모양의 감사로그를
남긴다.

1. 학생의 자기 신청 철회 (`pass:request` 보유자 전원이 아니라 그 줄의 주인만)
2. 학부모의 동의 (그 학생의 보호자로 연결된 사람만)

세션에서 유도할 수 있는 식별자는 클라이언트 입력으로 받지 않는다 —
`getMyPasses(sessionUser)`는 `studentId`를 인자로 받지 않고, 토큰 발급
라우트도 `passId`의 주인을 세션으로 확인한다.

`tests/core/authz/can.test.ts`의 `EXPECTED`에 일곱 줄을 함께 넣는다. 빠뜨리면
테스트가 깨진다.

### 8. 감사로그

여섯 동작 전부 `recordAudit`을 남긴다. **예외를 만들지 않는다** —
`verification` 모듈의 예외는 「임시 데이터의 생명주기 잡음」이라는 근거가 있었지만,
출입증은 그 자체가 「누가 무엇을 허가했는가」이므로 감사로그가 읽고 싶어 하는 바로
그 자료다.

| 액션 | 시점 | metadata |
|---|---|---|
| `pass:request` | 학생 신청 | type, startAt, endAt, destination |
| `pass:consent` | 학부모 동의 | 없음 (누가 언제가 전부다) |
| `pass:approve` | 교사 승인 | type, byProxy |
| `pass:reject` | 교사 반려 | reason |
| `pass:issue` | 교사 직접 부여 | type, endAt, destination, byProxy |
| `pass:cancel` | 취소·철회 | reason, byOwner |

`targetType`은 `"Pass"`, `targetId`는 `pass.id`다.
`modules/audit-log/`의 `AUDIT_ACTIONS`와 라벨·색조 사전에 여섯 줄을 함께 넣는다 —
넣지 않으면 감사로그 화면에 날 문자열이 그대로 보인다.

**검증(GET)은 읽기라 감사로그를 남기지 않는다.** 「모든 생성/수정/삭제」 규칙에
어긋나지 않으므로 예외 문서가 필요 없다.

### 9. 오류

`PassError` 하나에 코드를 담고, 화면 문구는 액션의 `MESSAGES` 사전이 옮긴다
(merit과 같다).

```
PASS_NOT_FOUND        출입증을 찾을 수 없습니다.
NOT_YOUR_PASS         본인의 출입증이 아닙니다.
NO_STUDENT_PROFILE    학생 계정이 아닙니다.
STUDENT_NOT_FOUND     학생을 찾을 수 없습니다.
ALREADY_DECIDED       이미 처리된 신청입니다.
ALREADY_CANCELLED     이미 취소된 출입증입니다.
CONSENT_REQUIRED      보호자 확인이 먼저입니다.
CONSENT_NOT_ALLOWED   외출에는 보호자 확인이 없습니다.
INVALID_PERIOD        끝나는 시각이 시작보다 빠릅니다.
PERIOD_TOO_LONG       외박은 한 번에 7일까지입니다.
OUTING_SPANS_DAYS     외출은 같은 날 안에서만 됩니다. 날짜를 넘기면 외박입니다.
START_IN_PAST         시작 시각이 지났습니다.
OVERLAPPING_PASS      같은 기간에 이미 신청한 출입증이 있습니다.
```

### 10. 모듈 구성

`src/modules/merit/`의 모양을 따른다 — repo·schema·error는 하나, 서비스는 책임별로.

```
src/modules/pass/
  pass.schema.ts        zod. 경계에서 한 번만 검증한다
  pass.error.ts         PassError
  pass.repo.ts          Prisma 호출만
  pass.token.ts         HMAC 토큰. DB를 모르는 순수 함수 (테스트하기 쉬운 자리다)
  pass.qr.ts            uqr → SVG path. 서버 전용
  request.service.ts    학생 신청·철회 · 학부모 동의
  decision.service.ts   교사 승인·반려·직접 부여·취소
  verify.service.ts     토큰 → Verdict
src/core/authz/pass-type.ts   PassType · PassStatus · 라벨 (merit-track.ts와 같은 자리)
```

### 11. 화면

| 경로 | 그룹 | 내용 |
|---|---|---|
| `/pass` | `(app)` | 역할로 갈린다 — **학생**: 지금 유효한 QR + 신청 버튼 + 내 내역 / **교사**: 결재 대기 + 직접 부여 + 오늘 유효한 출입증 / **학부모**: 자녀 동의 대기 + 내역 |
| `/pass/new` | `(app)` | 학생 신청 폼 |
| `/pass/[passId]` | `(app)` | 상세. 본인 QR도 여기서 크게 본다 |
| `/scan` | **`(app)` 밖** | **판독 화면 하나.** `?c=<토큰>`이 붙어 오면 그 자리에서 판정, 없으면 카메라 스캐너 |

**`/scan`을 `(app)` 밖에 두는 이유는 로그인 후 돌아오기 때문이다.**
`(app)/layout.tsx`의 `requireAuth()`는 `/login`으로 보내면서 원래 주소를 안 들고
가고, layout은 자기 경로를 알 수 없어 거기서 고칠 수도 없다. 그러면 정문에서
스캔 → 로그인 → 대시보드로 떨어져 **다시 스캔해야 한다.** `(app)` 밖에 두면
페이지가 직접 `getSessionUser()`를 부르고 없을 때 `/login`으로 보낼 수 있다.
**`next` 값은 URL 인코딩해서 넘긴다** — 판정할 코드가 그 안의 질의 문자열이라
`/login?next=%2Fscan%3Fc%3D...` 꼴이어야 중첩된 `?`가 안 잘린다.

주소가 짧은 것도 이유다 — `/scan?c=`는 QR 모듈 수를 줄여 먼 거리에서도 찍힌다.

곁들여 필요한 것:

- `login/page.tsx`와 로그인 폼이 `next`를 받아 성공 후 그리로 보낸다.
  **질의 문자열(`?c=`)까지 살려야 한다** — 그게 판정할 코드다.
- **`next`는 `/`로 시작하고 `//`가 아닌 경로만 허용한다** (오픈 리다이렉트 방지).
  검사는 `src/lib/safe-next.ts` 한 곳에 둔다.

앱 셸이 없는 대신 판정 배지가 화면을 채운다 — 정문에서 팔 뻗은 거리로 보는 화면
이라 그편이 맞다. 아래에 「출입증 목록으로」 링크 하나를 둔다. `/pass`에서는
「QR 스캔하기」 버튼이 `/scan`으로 건너간다.

**스캐너는 읽은 주소로 이동하지 않는다.** 카메라에 잡히는 QR이 우리 것이라는 보장이
없다 — 학생이 아무 QR이나 들이밀 수 있다. 읽은 글자에서 **`BETTER_AUTH_URL`의 출처와
`/scan?c=<토큰>` 모양이 둘 다 맞을 때만** 토큰을 꺼내고, 그 토큰을 서버 액션으로 보내
같은 화면에서 판정을 받는다. 모양이 아니면 「우리 출입증 QR이 아닙니다」로 떨어지고
아무 데로도 가지 않는다.

**스캐너**는 브라우저의 `BarcodeDetector`를 런타임에 확인해서 쓴다
(`"BarcodeDetector" in window`). 없으면 스캐너 자리에
「이 브라우저는 카메라 스캔을 지원하지 않습니다 — 폰 기본 카메라로 QR을 찍으세요」가
뜬다. **폴백이 폰 기본 카메라 자체다** — 그쪽은 `/scan?c=`를 열어 주므로 어디서나
되고, 그래서 QR 디코딩 라이브러리를 따로 넣지 않는다. 새 의존성은 `uqr` 하나뿐이다.

**QR 갱신:** `GET /api/pass/[passId]/token`이
`{ qr: { size, d }, validUntil }`을 준다(`qr`은 §2 `toQrPath`가 낸 그대로다).
클라이언트는 `validUntil`에 맞춰 타이머를 한 번 걸어 **20초에 요청 하나**를
보내고, 남은 시간을 고리로 그린다. 라우트는 `requireAuth()` + 소유권(본인 또는
`pass:read:any`)을 검사한다.

**QR을 언제 보여주나:** `status = APPROVED` 이고 `endAt >= 지금`이면 보여준다.
아직 시작 전이어도 보여주되 「14:00부터 유효」를 함께 적고, 그 사이에 찍으면
판정은 `NOT_YET`이다. 시작 1분 전에 QR이 없는 화면보다, 있고 「아직」이라고 말하는
화면이 정문에서 덜 헷갈린다.

**학부모는 자기 자녀 건의 사유·행선지를 본다.** 동의를 구하면서 무엇에 동의하는지
가리면 안 된다. 이것은 `pass:read:any`가 아니라 `ParentStudent` 소유권으로 열린다 —
남의 자녀는 여전히 못 본다.

**검증 화면이 보여주는 것:** 판정 배지 · 이름(`honorificName`) · 학번
(`formatStudentNumber`) · 유형 · 유효 시각. **사유와 행선지는 `pass:read:any`를 가진
검증자에게만.** 같은 학년 학생이 「병원 진료」를 읽을 이유가 없다.

**디자인:** `docs/design/2026-08-17-redesign-spec.md`를 따른다. 새로 그리기 전에
있는 것부터 쓴다 — `SectionCard` · `DataTable`(폰에서 `narrow="cards"`) · `Badge` ·
`Note` · `EmptyState` · `StatTile` · `BackLink`. 판정 배지는 `Badge`의 색조를 쓰고
**초록 글자를 쓰지 않는다**(`text-pri` 금지, 필요하면 `text-pri-ink`). QR은 검정
`path` 하나이므로 다크·라이트를 타지 않는다.

**메뉴:** `NAV_ITEMS`에 「출입증」 한 줄, 하위 메뉴 없이 세 역할 모두에게 보인다.
아이콘은 `components/icons.tsx`에 QR 모양으로 하나 추가한다. 「스캔하기」는 메뉴가
아니라 `/pass` 화면의 버튼이다 — 메뉴는 이미 길다.

### 12. 테스트

| 자리 | 무엇을 |
|---|---|
| `tests/modules/pass/pass.token.test.ts` | 서명 위조 거부 · step 경계(현재/직전은 통과, 그 앞은 `STALE`) · `MALFORMED` |
| `tests/modules/pass/request.service.test.ts` | 권한 거부/허용 · 소유권(남의 신청 철회 불가) · 감사로그 · 기간 검증 전부 |
| `tests/modules/pass/decision.service.test.ts` | 상태 전이 · 외박의 `CONSENT_REQUIRED` · 대행 승인 · 이미 처리된 것 재처리 거부 · 감사로그 |
| `tests/modules/pass/verify.service.test.ts` | 판정 여덟 갈래 |
| `tests/core/authz/can.test.ts` | `EXPECTED`에 일곱 줄 |
| `tests/integration/pass.*.integration.test.ts` | 신청→동의→승인 왕복 · 겹침 거부 |

repo와 audit은 단위 테스트에서 목으로 둔다(기존 모듈과 같다). 토큰은 시각의 함수이므로
테스트가 `at`을 인자로 넘긴다 — `pass.token.ts`가 시계를 직접 읽지 않는 이유가 이것이다.

종료 조건은 `npm run verify` 통과다.

## 되돌아볼 지점

- **스캔 기록이 필요해지는 날.** 「미복귀 학생」을 묻기 시작하면 `PassScan`을 얹는다.
  토큰·QR·판정은 그대로 쓰고, 검증 화면에 「나감 기록」·「복귀 기록」 버튼(POST)이
  붙는다. **GET에서 쓰지 않는다는 규칙은 그때도 유지한다.**
- **학부모 계정 보급률.** `consentByProxy`가 대부분이면 동의 단계는 형식이 된 것이니,
  외박 동의를 아예 교사 확인란으로 바꾸는 편이 정직하다.
- **발송을 켜는 날.** 동의 요청이 학부모에게 문자로 가면 이 흐름이 실제로 굴러간다.
  CLAUDE.md의 「지금 인증은 실제로 발송하지 않는다」와 함께 재검토한다.
- **`BarcodeDetector`가 어디까지 깔리는가.** 안 깔린 브라우저에서는 사이트 안 스캐너가
  없는 것과 같고, 그 사람은 폰 기본 카메라로 찍는다 — 판정은 되지만 연속 스캔이 안 된다.
  정문에서 그 비중이 높아 줄이 밀리면 그때 QR 디코딩 라이브러리를 검토한다.
