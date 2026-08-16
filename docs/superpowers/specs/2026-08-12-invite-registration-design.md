# 초대코드 기반 가입 설계

날짜: 2026-08-12
상태: 승인됨

## 역할 모델 변경 (선행)

```
이전:  SUPER_ADMIN · TEACHER · STUDENT
이후:  ADMIN · STUDENT · PARENT
```

교사와 관리자를 구분하지 않는다. **교사 = 관리자 = `ADMIN`**이며 관리자끼리 권한이 완전히 동등하다.
관리자가 관리자 코드를 발급할 수 있으므로 계정 분실 시 복구 경로도 자연히 확보된다.

작업 시점에 DB가 비어 있어 데이터 마이그레이션은 필요 없다.

## 신원 식별 원칙

학반번호(학년·반·번호)는 **매년 갱신되는 현재 소속**이므로 식별자로 쓰지 않는다.
학생을 추적하는 고정값은 `StudentProfile.id`(cuid)이며, 상벌점·외출 등 모든 기록이 이걸 참조한다.

기존 `StudentProfile.studentNo`는 제거한다. 학부모가 학번으로 자녀를 찾을 필요가 없어졌기 때문이다
(학부모 코드에 이미 학생이 귀속되어 있다).

## 코드 발급

| 발급자 | 코드 역할 | 입력 항목 |
|---|---|---|
| 관리자 | `STUDENT` | 학년·반·번호, 이름, 생년월일 |
| 관리자 | `ADMIN` | 이름 |
| **학생 본인** | `PARENT` | 학부모 이름 |

학부모 코드는 학생 본인만 만든다. `studentId`는 세션에서 유도해 서버가 박으므로,
학부모가 남의 자녀에 연결될 경로가 존재하지 않는다.

## 가입 흐름

```
1단계  코드 입력 → 서버가 역할만 판별해 회신 (이름·생년월일 등 개인정보는 회신하지 않는다)
2단계  역할별 폼
   STUDENT  이름 + 생년월일 대조 · 이메일 · 비밀번호
   ADMIN    이름 대조 · 이메일 · 비밀번호
   PARENT   이름 대조 · 이메일 · 비밀번호
```

**이름은 모든 역할이 대조하고, 학생만 생년월일이 추가된다.**
학반번호는 가입자가 입력하지 않는다 — 코드에 박힌 값이 그대로 프로필이 된다.

역할은 항상 서버가 코드 레코드에서 읽는다. 클라이언트는 역할을 주장할 수 없다.
2단계 화면의 역할 표시는 안내용이다.

### 대조 규칙

이름: 앞뒤 공백 제거 + 내부 연속 공백을 하나로 정규화한 뒤 완전 일치.
생년월일: `YYYY-MM-DD` 문자열 완전 일치.

## 위협과 대응

코드는 1차 비밀이고, 이름·생년월일은 **코드가 엉뚱한 사람에게 전달됐을 때를 막는 2차 요소**다.

| 위협 | 대응 |
|---|---|
| 코드 추측 | 본문 8자, 혼동 문자(0·O·1·I·L) 제외 31자 알파벳 → 31^8 ≈ 8.5 × 10^11 |
| 코드 오배포 후 타인 사용 | 이름(+학생은 생년월일) 대조 |
| 2차 요소 무차별 대입 | `failedAttempts` 5회 도달 시 코드 자동 폐기 |
| 동시 사용으로 계정 2개 생성 | `updateMany({ where: { id, status: "PENDING" } })`의 `count === 0` 판정 |
| 클라이언트의 역할 위조 | 역할은 서버가 코드에서만 읽는다 |
| 프로필 생성 실패 시 계정 고아 | 계정 삭제 후 코드를 `PENDING`으로 복구. 삭제 실패 시 코드는 `USED`로 유지(fail-closed) |
| 학부모가 남의 자녀에 연결 | `studentId`를 세션에서 유도, 클라이언트 입력 금지 |

### 코드 길이를 8자로 확정한 이유 (설계 당시 10자/32자에서 정정)

처음 이 문서는 10자·32자 알파벳으로 적었지만 구현은 8자·31자로 갔고, 그대로
운영에 들어갔다. 문서를 구현에 맞춘다.

- **알파벳 31자**: 0·O·1·I에 더해 **L도 뺐다**(`src/lib/invite-code.ts`).
  구두·필사로 옮겨지는 코드라 1/I/L 혼동이 실제 오입력을 만든다. 32자는 처음부터
  이 시스템의 알파벳이 아니었다.
- **본문 8자**: 저장 형태는 `GBSW` + 본문 8자 = 12자다. 표시 형식이
  `GBSW-0000-0000`(4-4)으로 시안·`formatInviteCode`·이미 인쇄해 나눠 준 코드에
  걸려 있고, 등록 화면의 입력 마스크(`formatInviteCodeInput`)는 본문을 8자에서
  자른다. 10자로 올리면 마스크가 입력을 조용히 잘라 **새 코드로 가입이 안 되고**,
  기존 코드의 표시 묶음도 달라진다.
- **그래서 8자로 충분한가**: 31^8 ≈ 8.5 × 10^11. 여기에 이름(+학생은 생년월일)
  대조와 5회 실패 시 자동 폐기가 겹친다. 동시에 살아 있는 코드는 많아야 수백
  장이라 무작위 한 번이 유효 코드에 닿을 확률은 10^-9 수준이고, 닿아도 2차
  요소를 넘어야 한다. 길이를 늘려서 얻는 이득보다 위의 두 잠금장치를 깨는
  비용이 크다.

길이를 바꾸려면 `BODY_LENGTH`·`formatInviteCode`·`formatInviteCodeInput`·
표시 형식을 **한 번에** 고치고, 이미 발급된 코드의 표시가 달라지는 것을
감수해야 한다.

## 데이터 모델

### Invite (신규)

| 필드 | 내용 |
|---|---|
| `code` | `GBSW` + 본문 8자 = 12자, `UNIQUE` |
| `role` | `ADMIN \| STUDENT \| PARENT` |
| `status` | `PENDING \| USED \| REVOKED` |
| `expiresAt` | null이면 무기한 |
| `metadata` | JSON. STUDENT는 `{ name, birthDate, grade, classNo, number }`, 나머지는 `{ name }` |
| `studentId` | PARENT 코드 전용 — 어느 학생의 코드인지 |
| `failedAttempts` | 2차 요소 실패 횟수 |
| `createdById` · `usedById` · `usedAt` | 발급자·사용자·사용시각 |

### StudentProfile 조정

- `studentNo` 제거
- `birthDate` 필수화 (발급 시점에 항상 알고 있는 값이다)
- `classId` + `number`가 현재 소속

### ParentStudent (신규)

학부모 `User` ↔ `StudentProfile` 연결. `(parentUserId, studentId)` 복합 유니크.
`ParentProfile`은 필드가 없는 빈 테이블이 되므로 만들지 않는다.

## 권한

| 액션 | ADMIN | STUDENT | PARENT |
|---|:-:|:-:|:-:|
| `invite:create` · `invite:list` · `invite:revoke` | ✓ | — | — |
| `invite:create:parent` | ✓ | ✓ | — |
| `student:manage` | ✓ | — | — |
| `user:manage` | ✓ | — | — |

`invite:create:parent`는 역할 검사만으로 부족하다. 학생이 호출하면 서비스가 세션에서
본인 `StudentProfile`을 찾아 쓰고, `studentId`를 인자로 받지 않는다.

## 화면

- `/admin/invites` — 역할 선택 → 역할별 입력 → 발급, 목록, 폐기
- `/register` — `?token=`이면 부트스트랩, 아니면 코드 2단계 가입
- 학생 대시보드 — 학부모 초대코드 생성 카드

## 파일

```
src/lib/invite-code.ts                    코드 생성·사용가능 판정
src/modules/invites/                      invite.{schema,repo,service}.ts
src/modules/registration/                 registration.{schema,repo,verify,service}.ts
src/app/(app)/admin/invites/              page · client · actions
src/app/(app)/parent-invite/              학생용 학부모 코드 생성
src/app/register/                         기존 페이지에 코드 분기 추가
```

## 범위 밖

전화번호 수집, 이메일 인증, 코드 일괄 발급(CSV), 학급 자동 진급.
필요해지면 별도로 다룬다.
