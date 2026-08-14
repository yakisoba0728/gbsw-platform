# 상벌점 설계

날짜: 2026-08-14
상태: 승인됨

## 범위

상벌점 모듈. **교내 상벌점(그린마일리지)과 기숙사 상벌점 두 종류**를 다룬다.
규정 카탈로그, 부여·취소, 학생별·반별 조회, 여러 명 한 번에 부여, 과거 학년도 조회,
엑셀 내보내기까지가 이번 범위다.

이 모듈이 이 프로젝트의 **첫 번째 업무 모듈**이다. 지금까지 만든 것(인증·권한·감사로그·
학년도·명단)은 전부 이 모듈을 받기 위한 기반이었다. 따라서 여기서 정하는 것들 — 기록이
학생에 어떻게 매달리는가, 학년도를 어떻게 참조하는가, 계정 삭제를 어떻게 견디는가 — 은
뒤에 올 모듈(외출/외박, 공지 등)의 본보기가 된다.

## 두 트랙

| | 교내 (`SCHOOL`) | 기숙사 (`DORM`) |
|---|---|---|
| 통칭 | 그린마일리지 | 기숙사 상벌점 |
| 합계 범위 | **그 학년도만** | **입학부터 전체 누적** |
| 계산 | 상점 − 벌점 = 순점수 | 상점 − 벌점 = 순점수 |
| 규정 카탈로그 | 트랙별로 분리 | 트랙별로 분리 |

**계산 구조가 같다는 것이 설계의 출발점이다.** 그래서 모델을 두 벌로 나누지 않고
`track` 열 하나로 가른다. 나누면 규정 관리·부여·조회·내보내기 코드가 통째로 두 벌이 되고,
나중에 트랙이 하나 더 생기면 세 벌이 된다. 지금 다른 것은 **규정 목록과 합계 범위뿐**이고,
둘 다 `WHERE` 절의 차이일 뿐이다.

### "매년 초기화"는 지우는 것이 아니라 세는 범위다

```sql
-- 교내: 보고 있는 학년도만
SELECT kind, SUM(points) FROM "MeritAward"
WHERE "studentProfileId" = ? AND track = 'SCHOOL' AND year = ? AND status = 'ACTIVE'
GROUP BY kind

-- 기숙사: 학년도 조건 없음
SELECT kind, SUM(points) FROM "MeritAward"
WHERE "studentProfileId" = ? AND track = 'DORM' AND status = 'ACTIVE'
GROUP BY kind
```

**초기화 작업도, 배치도, 학년도를 전환할 때 건드리는 행도 없다.** 학년도가 넘어가면
교내 합계가 저절로 0부터 시작하고, 지난 학년도 기록은 그대로 남아 과거 학년도 조회로 보인다.

기록을 실제로 삭제하는 방식은 **의도적으로 택하지 않았다.** 이 프로젝트는 학적·감사로그·
소프트 삭제에 이르기까지 "기록은 지우지 않는다"를 일관되게 지켜 왔고, 상벌점은 학생에게
불리하게 쓰일 수 있는 기록이라 더더욱 되짚을 수 있어야 한다. 초기화를 삭제로 구현하면
"작년에 벌점을 왜 받았는지"를 아무도 확인할 수 없게 된다.

## 데이터 모델

```prisma
model MeritRule {
  id String @id @default(cuid())

  /// SCHOOL | DORM — core/authz/merit-track.ts의 MeritTrack과 일치해야 한다.
  track String
  /// MERIT | DEMERIT
  kind  String

  label       String
  /// 항상 양수. 부호는 kind가 정한다 — 음수 점수를 허용하면 "벌점 −3점"이
  /// 상점이 되는 표현이 두 갈래로 생긴다.
  points      Int
  category    String?
  description String?

  /// false면 부여 목록에서 감춘다. 기록 무결성을 위해 행은 남긴다.
  active Boolean @default(true)

  awards MeritAward[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([track, active])
}

model MeritAward {
  id String @id @default(cuid())

  /// 학생의 영구 식별자에 매단다. 소속(Enrollment)이 아니다 — 아래 설명.
  studentProfileId String
  studentProfile   StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)

  /// 부여된 학년도. 교내 합계의 범위이자 기숙사 기록의 시점 표시.
  year         Int
  academicYear AcademicYear @relation(fields: [year], references: [year], onDelete: Restrict)

  ruleId String
  rule   MeritRule @relation(fields: [ruleId], references: [id], onDelete: Restrict)

  // ── 부여 시점 스냅샷. 규정이 나중에 바뀌어도 과거 기록은 안 흔들린다.
  track  String
  kind   String
  label  String
  points Int

  note String?

  /// 계정이 지워지면 null이 된다. 누가 줬는지는 awardedByName이 지킨다.
  awardedByUserId String?
  awardedBy       User?   @relation("MeritAwardedBy", fields: [awardedByUserId], references: [id], onDelete: SetNull)
  /// 부여 시점의 이름 스냅샷. AuditLog.actorName과 같은 이유다.
  awardedByName   String

  /// ACTIVE | CANCELLED
  status String @default("ACTIVE")

  cancelledByUserId String?
  cancelledBy       User?     @relation("MeritCancelledBy", fields: [cancelledByUserId], references: [id], onDelete: SetNull)
  cancelledByName   String?
  cancelledAt       DateTime?
  cancelReason      String?

  /// 여러 명에게 한 번에 준 묶음. 단건 부여는 null.
  batchId String?

  createdAt DateTime @default(now())

  @@index([studentProfileId, track])
  @@index([year, track])
  @@index([batchId])
}
```

### 왜 `Enrollment`가 아니라 `year`인가

명단 일괄 반영(`applyRoster`)은 **그 학년도의 재적 행을 전부 지우고 다시 넣는다.** 번호
맞바꾸기(3번↔5번)를 Postgres의 유일 제약 아래에서 처리할 방법이 그것뿐이기 때문이다.

상벌점이 `Enrollment.id`를 참조하면 **명단 파일을 한 번 올릴 때마다 전교생의 상벌점이
끊어진다.** `onDelete: Cascade`면 조용히 사라지고, `Restrict`면 명단 반영 자체가 막힌다.
어느 쪽도 답이 아니다.

그래서 상벌점은 **학생의 영구 식별자(`StudentProfile.id`)와 학년도 숫자(`year`)** 만
참조한다. 둘 다 명단 작업으로 바뀌지 않는 값이다. 반·번호가 필요한 화면은 조회 시점에
`Enrollment`를 조인해서 가져온다 — 반이 잘못 올라간 걸 나중에 고치면 지난 상벌점 화면의
반 표시까지 함께 바로잡힌다.

### 왜 값을 스냅샷하는가

"기숙사 점호 지각 3점"을 나중에 5점으로 고쳐도, 이미 준 기록은 3점 그대로여야 한다.
규정을 참조만 하면 규정 한 줄 수정이 과거 전체 학생의 점수를 소급해 바꾼다.

`ruleId`는 그대로 들고 있다(`Restrict`). "이 규정으로 몇 건이 나갔나"를 세려면 필요하고,
규정 행을 지우는 경로는 만들지 않는다(비활성만 있다).

### 왜 계정 참조가 nullable인가

이 시스템은 오등록 정리를 위해 계정 완전 삭제를 허용한다. `awardedByUserId`가 필수 외래키면
그런 계정이 준 상벌점 때문에 삭제가 막히거나, `Cascade`면 상벌점이 함께 사라진다.

감사로그에서 이미 푼 문제다 — **`SetNull` + 이름 스냅샷.** 계정이 사라져도 "2026-06-10에
이정민이 점호 지각 3점을 줬다"는 사실은 남는다. 과거의 사실이 살아 있는 외래키에 기대면 안 된다.

`User`에 역참조 두 줄(`meritAwardsGiven`, `meritAwardsCancelled`)을 추가한다 — 관계 이름이
둘 다 `User`를 가리키므로 Prisma가 `@relation` 이름을 요구한다.
`StudentProfile`에도 `meritAwards MeritAward[]`, `AcademicYear`에 `meritAwards MeritAward[]`를 단다.

### 학생 삭제와의 관계

`onDelete: Cascade`로 `StudentProfile`에 매단다. 이미 정한 삭제 정책과 맞물려 이렇게 굴러간다.

- **명단에서 빠짐 → 소프트 삭제** — `StudentProfile`은 그대로다. 상벌점도 그대로 남고,
  명단에 다시 넣으면 점수까지 함께 돌아온다.
- **오등록 완전 삭제 → 하드 삭제** — 학생 행이 사라지므로 상벌점도 함께 지워진다.
  애초에 존재하지 않았어야 할 학생의 기록이라 남길 이유가 없다.

## 권한

`core/authz/can.ts`에 네 액션을 추가한다. **넷 다 관리자 전용**이다.

| 액션 | ADMIN | STUDENT | PARENT |
|---|:---:|:---:|:---:|
| `merit:rule:manage` | O | — | — |
| `merit:award` | O | — | — |
| `merit:cancel` | O | — | — |
| `merit:read:any` | O | — | — |

학생과 학부모에게는 **부여 액션 자체가 없다.** 조회는 권한 액션이 아니라 세션 기반
소유권으로 처리한다 (아래).

### 취소는 관리자면 누구나 할 수 있다

이전 버전은 "교사는 자기가 준 것만 취소"였다. 그건 SUPER_ADMIN/TEACHER 등급이 있던
시절의 규칙이다. **이 시스템은 교직원 사이에 권한 차등이 없으므로** 등급 없는 소유권
검사는 근거가 없고, 준 사람이 출장·병가·퇴직이면 잘못된 기록을 아무도 못 고치게 된다.

대신 책임 추적을 남긴다: **취소 사유를 받고, 취소한 사람의 이름을 기록에 박고, 감사로그를
남긴다.** 취소된 기록은 목록에서 사라지지 않고 취소 표시가 붙은 채로 남는다.

**취소 사유는 필수다** — zod가 경계에서 막는다(`MeritError` 코드가 아니라 스키마 검증이다).
"누구나 취소할 수 있다"를 정당화하는 근거가 사유와 감사로그이므로, 사유가 선택이면
그 근거가 무너진다. 부여 메모(`note`)는 선택이다 — 규정 이름만으로 충분한 경우가 많고,
부여는 취소와 달리 남의 기록을 뒤집는 행위가 아니다.

같은 이유로 **사감과 담임을 구분하지 않는다** — 관리자면 두 트랙 다 부여할 수 있다.
기숙사 상벌점을 사감에게만 열려면 역할 등급이 필요한데, 그건 이 프로젝트가 의도적으로
만들지 않은 것이다. 나중에 필요해지면 `can.ts`에 트랙별 액션을 쪼개는 것으로 시작한다.

### 학생·학부모 조회는 세션에서 신원을 끌어온다

```
getMyAwards(sessionUser)              // studentId를 인자로 받지 않는다
getChildAwards(sessionUser, childId)  // ParentStudent 연결을 서비스에서 검사한다
```

`getMyAwards`는 `sessionUser.id` → `StudentProfile`을 서비스 안에서 해석한다. URL 파라미터를
바꿔 남의 기록을 보는 경로가 **존재하지 않는다.**

학부모는 자녀가 여럿일 수 있어 `childId`를 받되, **서비스가 `ParentStudent`에 그 연결이
실제로 있는지 검사한다.** 없으면 `ForbiddenError`를 던지고 거부 감사로그를 남긴다.
`can()`만으로 못 가르는 거부라 `invite.service.ts`의 `revokeInvite`와 같은 방식이다.

## 화면

| 경로 | 누가 | 무엇을 |
|---|---|---|
| `/merit` | 관리자 | 검색 + 반별 목록 (학년·반 선택, 순점수 정렬, 체크박스 다중 선택 → 일괄 부여) |
| `/merit` | 학생 | 내 상벌점 — 교내·기숙사 탭 |
| `/merit` | 학부모 | 자녀 상벌점 (자녀 여럿이면 선택) |
| `/merit/students/[studentId]` | 관리자 | 트랙별 합계 · 부여 · 내역 · 취소 |
| `/admin/merit/rules` | 관리자 | 규정 관리 — 트랙별 탭, 추가·수정·비활성 |

`/merit` 하나가 역할에 따라 갈라진다. 시안의 구조(`meritTA` / `meritOwn` 분기)와 같다.

관리자 검색은 **이름 또는 학생코드**로 찾는다 (시안의 "학번 또는 이름으로 검색"). 학번은
이 시스템에 없는 개념이라 `StudentProfile.studentCode`로 옮긴다. 결과는 30명으로 자른다.
반별 목록이 있으므로 검색은 "이름은 아는데 몇 반인지 모를 때"의 보조 경로다.

반별 목록은 **보고 있는 트랙의 합계**를 보여준다 — 교내 탭이면 그 학년도 합계,
기숙사 탭이면 누적 합계다. 정렬은 순점수 기준이며 **관리자 화면에만 있다.**

### 시안과의 관계

시안(`GBSW 통합관리시스템.dc.html`)에 상벌점 화면 4개가 이미 그려져 있다 — 검색 표,
본인 조회(합계 3칸 + 내역 표 + 전체/상점/벌점 필터 칩), 학생 상세(부여 폼 + 내역 + 취소),
규정 관리(추가 폼 + 표). **그대로 이식한다.**

**시안에 없는 것은 트랙 구분뿐이다** — 시안은 합계 3칸이 한 벌이고 규정 목록도 하나다.
트랙은 **탭**으로 얹는다. 합계·내역·규정 표는 탭 안에서 시안 그대로 재사용된다.

`Badge`의 `merit`·`demerit`·`cancelled` 톤과 `MeritIcon`은 이미 만들어져 있다.
취소 확인은 시안의 `Modal`(danger 톤)을 쓴다.

hover는 `hover:`, PC/모바일 전환은 `lg:` 브레이크포인트로 바꾼다 — 시안의 `device` prop
토글을 JS로 재현하지 않는다 (SSR 불일치).

### 규정 관리

이전 버전은 수정이 아예 없어서 오타 하나에도 "비활성 후 재생성"을 해야 했다. 값을
스냅샷해 두므로 과거 기록이 흔들릴 위험이 없어 **수정을 연다.**

**단, 고칠 수 있는 것은 `label`·`points`·`category`·`description`뿐이다.**
`track`과 `kind`는 만들 때 정하고 바꿀 수 없다 — 기록은 스냅샷이 지켜 주지만, "기숙사
점호 지각(벌점)"이 어느 날 "교내 상점"으로 변신하는 것은 규정 카탈로그로서 말이 안 된다.
트랙이나 종류가 잘못됐으면 비활성하고 새로 만든다.

비활성한 규정은 부여 목록에서 사라지되 행은 남는다. 이미 나간 기록이 참조하고 있고
(`onDelete: Restrict`), "이 규정으로 몇 건이 나갔나"를 세려면 필요하다.

### 과거 학년도

**교내 탭에만 학년도 선택을 단다.** 기숙사는 누적이라 선택할 것이 없다.
기본값은 현재 학년도이고, 학생 본인 화면에서도 지난 학년도를 볼 수 있다.

**학년도 선택은 조회 전용이다. 부여는 항상 `getCurrentYear()`가 정한 학년도로 들어간다.**
화면에서 고른 값을 부여에 넘기면, 지난 학년도를 들여다보던 관리자가 새 벌점을 2025학년도에
꽂아 넣는 사고가 난다. 서버 액션은 학년도를 **입력으로 받지 않는다** — 세션에서 유도할 수
있는 값을 클라이언트 입력으로 받지 않는다는 규칙과 같은 이유다.
과거 학년도를 보고 있을 때는 부여 폼을 감춘다.

### 여러 명 한 번에 부여

반별 목록에서 체크박스로 학생을 고르고, 규정 하나와 메모를 정해 한 번에 준다.
"점호 지각 5명"처럼 같은 사유가 여러 명에게 동시에 발생하는 것이 기숙사에서 특히 잦다.

- **한 트랜잭션으로 넣는다.** 절반만 들어가는 상태를 만들지 않는다.
- **같은 `batchId`를 공유한다.** 나중에 "이 일괄 부여를 통째로 취소"가 필요해지면 근거가 된다.
- **감사로그는 학생 1명당 1줄**이다. 일괄이어도 "이 학생이 왜 벌점을 받았나"를 건별로
  추적해야 한다. 같은 묶음은 `batchId`로 이어 본다. (`saveEnrollments`와 같은 원칙)
- 상한을 둔다: 한 번에 100명. 전교생이 300명이라 반 단위 작업에 충분하고,
  실수로 전교생에게 벌점을 주는 사고를 막는다.

### 엑셀 내보내기

명단 내보내기와 같은 방식 — 서버는 행렬만 돌려주고 클라이언트가
`write-excel-file/browser`로 파일을 만든다. 내려받는 것은 **보고 있는 화면의 표**다
(반별 목록 또는 한 학생의 내역).

## 오류 규약

`MeritError`는 **코드**를 `message`에 담고, 화면 문구는 액션(`app/**/actions.ts`)의
`MESSAGES` 사전이 옮긴다 — 새 모듈의 기본 규약을 따른다.

| 코드 | 언제 |
|---|---|
| `RULE_NOT_FOUND` | 규정 id가 없다 |
| `RULE_INACTIVE` | 비활성 규정으로 부여하려 한다 |
| `AWARD_NOT_FOUND` | 취소 대상이 없다 |
| `ALREADY_CANCELLED` | 이미 취소된 기록을 또 취소하려 한다 |
| `TOO_MANY_STUDENTS` | 일괄 부여 상한(100명) 초과 |
| `NO_STUDENTS` | 일괄 부여인데 대상이 없다 |
| `STUDENT_NOT_FOUND` | 학생 id가 없다 |

현재 학년도가 없으면 `AcademicYearError`가 그대로 올라온다 — 명단 화면과 같은 처리다
(파일이나 입력 문제가 아니라는 것을 따로 알려야 한다).

권한 거부는 `assertCan(actor, action)`이 `ForbiddenError` + `authz:denied` 감사로그를
한 번에 처리한다. 소유권 거부(학부모–자녀 연결 없음)는 `ForbiddenError`를 직접 던지고
같은 방식으로 감사로그를 남긴다.

## 감사로그

모든 생성·수정·삭제에 `recordAudit`을 남긴다.

| 액션 | 언제 | metadata |
|---|---|---|
| `merit:rule:create` | 규정 추가 | track, kind, label, points |
| `merit:rule:update` | 규정 수정 | 바뀐 항목의 전/후 (label·points·category·description만) |
| `merit:rule:deactivate` | 규정 비활성 | label |
| `merit:award` | 부여 (일괄이면 학생당 1줄) | studentId, track, kind, label, points, batchId? |
| `merit:cancel` | 취소 | awardId, studentId, points, reason |

`modules/audit-log/audit-log.labels.ts`에 **한국어 라벨과 Badge 톤을 반드시 함께 등록한다.**
등록하지 않으면 라벨 커버리지 테스트가 `recordAudit` 호출부를 훑어서 실패한다 — 의도된 장치다.

## 파일 구조

```
src/core/authz/merit-track.ts              MeritTrack · MERIT_TRACK_LABELS
src/modules/merit/
  merit.schema.ts                          zod 입력 스키마
  merit.repo.ts                            Prisma 호출만
  rule.service.ts                          규정 카탈로그
  award.service.ts                         부여 · 취소 · 조회 · 집계
  merit.export.ts                          엑셀 행렬 만들기 (순수 함수)
src/app/(app)/merit/
  page.tsx                                 역할 분기
  actions.ts                               awardAction · bulkAwardAction · cancelAction
  ...
src/app/(app)/admin/merit/rules/           규정 관리
tests/modules/merit/                       구조를 src/와 맞춘다
```

**서비스를 `rule`과 `award` 둘로 나눈다.** 하나로 두면 규정 관리(관리자 설정)와
부여·조회(일상 업무)가 한 파일에 섞여 금방 커진다. 이전 버전도 같은 선을 그었다.

## 검증

서비스 테스트는 repo와 감사를 목으로 대체하고 다음을 확인한다.

- 각 액션의 **권한 거부/허용** — 학생·학부모가 부여·취소·타인 조회를 못 한다
- **스냅샷** — 규정을 수정해도 이미 만든 기록의 label·points가 안 바뀐다
- **취소가 합계에서 빠진다** — 목록에는 남고 합계에서만 제외된다
- **교내는 학년도별, 기숙사는 전체 누적** — 같은 학생의 두 트랙 합계가 다르게 나온다
- **일괄 부여가 한 `batchId`로 묶이고 감사로그는 학생 수만큼 남는다**
- **상한 초과·빈 대상**이 거부된다
- **학부모가 남의 자녀를 못 본다** — `ParentStudent` 연결 없으면 `ForbiddenError`

통합 테스트(실 Postgres)로 **일괄 부여 트랜잭션 하나** — 중간에 실패하면 아무것도 안 남는지.

`tests/core/authz/can.test.ts`의 `EXPECTED`에 네 액션의 기대값을 추가한다.
빠뜨리면 테스트가 깨진다 — 의도된 장치다.

## 이번에 하지 않는 것

- **기준점 도달 알림·자동 조치** (벌점 누적 시 퇴사 심의 회부 등) — 학교 규정을 확인해야
  하고, 자동으로 불이익을 주는 기능은 오작동 비용이 크다
- **학생 화면의 등수 공개** — 순위 정렬은 관리자 화면에만 둔다
- **규정 엑셀 일괄 등록** — 규정은 수십 개 규모라 화면에서 넣는 것으로 충분하다
- **학생·학부모의 이의 제기** — 별도 흐름(승인·반려)이 필요해 모듈 하나 크기다
- **일괄 취소** — `batchId`를 남겨 두므로 필요해지면 그때 붙인다

## 구현 시 주의

**스키마를 바꿨으면 `next dev`를 반드시 재시작한다 (`.next`도 지운다).** 돌던 개발 서버는
옛 Prisma 클라이언트를 물고 있어서, 새 모델을 쓰는 화면만 `PrismaClientValidationError`로
조용히 실패한다. 타입 검사·테스트·빌드는 디스크의 새 클라이언트를 보므로 전부 통과한다 —
화면에서만 터지고, 서버 액션의 catch가 오류를 삼키면 원인이 어디에도 안 남는다.
명단 내보내기에서 실제로 겪은 일이다.

`components/app-shell/nav.ts`에 **두 줄**을 추가한다 (시안 사이드바에도 둘 다 있다).

- `NAV_ITEMS`에 `{ href: "/merit", label: "상벌점", icon: MeritIcon }` — 학생·학부모·관리자가
  모두 보는 항목이라 `roles`를 비운다 (`MeritIcon`은 이미 있다).
- `ADMIN_NAV_ITEMS`에 `{ href: "/admin/merit/rules", label: "상벌점 규정", roles: ["ADMIN"] }` —
  규정 관리는 설정 성격이라 관리자 섹션에 둔다.

두 경로는 겹치지 않는다 — `"/admin/merit/rules".startsWith("/merit")`는 거짓이라
`titleForPath`·`isActive`가 서로를 잡아채지 않는다. `/merit/students/[id]`는 `/merit`에
걸려 상단바에 "상벌점"이 뜨는데, 그게 맞는 동작이다.
