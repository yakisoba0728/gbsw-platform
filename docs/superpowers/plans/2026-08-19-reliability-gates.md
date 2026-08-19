# 신뢰성 게이트 구현 계획

**Spec:** `docs/superpowers/specs/2026-08-19-reliability-gates-design.md`

## Global Constraints

- 업무 변경과 대응하는 성공 감사 로그는 같은 Prisma 트랜잭션에서 함께 커밋하거나 함께 롤백한다.
- 감사 로그 생성 실패를 삼키지 않는다. 행위자 이름 조회 실패만 기존처럼 `"(알 수 없음)"`으로 대체한다.
- 저장소 계층만 Prisma 쿼리를 수행하고, 서비스 계층은 트랜잭션을 조율한다.
- 기존 내부 트랜잭션의 원자성, 격리 수준, timeout 의미를 보존하고 중첩 트랜잭션을 만들지 않는다.
- 명단 확정은 클라이언트의 `errors`를 신뢰하지 않으며 이름과 생년월일을 서버에서 다시 정규화·검증한다.
- Next.js 코드를 수정하기 전 `node_modules/next/dist/docs/`의 현재 16.3 문서를 따른다.
- 구현은 테스트 우선으로 진행하고, 기존 감사 action/target/metadata 계약을 유지한다.
- 사용자 작업을 커밋하거나 푸시하지 않는다.

## Task 1: 공통 트랜잭션·감사 클라이언트 API 구축

**Files:**

- Modify: `src/core/db/client.ts`
- Modify: `src/core/audit/audit.ts`
- Test: `tests/core/audit/audit.test.ts`
- Test: `tests/integration/audit-atomicity.integration.test.ts`

### Requirements

1. 제공된 트랜잭션 클라이언트로 감사 조회/생성을 수행하는 테스트를 먼저 추가하고 RED를 확인한다.
2. 공유 `DbClient` 타입과 `withTransaction()` 진입점을 정의한다. timeout/maxWait 옵션을 받을 수 있어야 한다.
3. `recordAudit(input, db?)`와 행위자 조회가 제공된 클라이언트만 사용하게 한다.
4. 행위자 조회 실패 fallback은 유지하고 `AuditLog.create` 실패는 그대로 전파한다.
5. 실제 DB에서 감사 FK 실패가 대표 변경을 롤백하는 통합 테스트를 추가한다.
6. 집중 단위·통합 테스트와 타입 검사를 통과시킨다.

## Task 2: 비밀번호 변경과 최초 관리자 생성을 원자화

**Files:**

- Modify: `src/modules/account/account.repo.ts`
- Modify: `src/modules/account/account.service.ts`
- Modify: `src/modules/bootstrap/bootstrap.repo.ts`
- Modify: `src/modules/bootstrap/bootstrap.service.ts`
- Test: `tests/modules/account/account.service.test.ts`
- Test: `tests/modules/bootstrap/bootstrap.service.test.ts`

### Requirements

1. Better Auth에는 현재 비밀번호와 현재 세션 검증만 맡긴다. `auth.api.changePassword()`로 자체 커밋하지 않는다.
2. 새 비밀번호 해시는 트랜잭션 밖에서 계산한다.
3. credential hash 변경, `mustChangePassword` 해제, 현재 세션을 제외한 다른 세션 삭제, 감사 생성을 하나의 트랜잭션으로 실행한다.
4. 최초 관리자 사용자·계정 생성과 감사를 하나의 트랜잭션으로 실행하고, 감사 실패도 토큰 복구 catch 범위에 포함한다.
5. 저장소는 전달된 `DbClient`가 있으면 중첩 트랜잭션을 열지 않는다.
6. 실패 시 부분 변경이 없고 기존 서비스 반환/오류 계약이 유지됨을 테스트한다.

## Task 3: 관리자 계정·학년도 변경을 원자화

**Files:**

- Modify: `src/modules/admin-users/admin-user.repo.ts`
- Modify: `src/modules/admin-users/admin-user.service.ts`
- Modify: `src/modules/academic-year/academic-year.repo.ts`
- Modify: `src/modules/academic-year/academic-year.service.ts`
- Test: `tests/modules/admin-users/admin-user.service.test.ts`
- Test: `tests/modules/academic-year/academic-year.service.test.ts`

### Requirements

1. 관리자 정보 수정·활성화·비밀번호 초기화·완전 삭제를 각각 대응 감사와 같은 트랜잭션으로 실행한다.
2. 학년도 생성·현재 학년도 변경을 각각 대응 감사와 같은 트랜잭션으로 실행한다.
3. 기존 자체 트랜잭션 저장소는 전달된 클라이언트를 재사용하고 중첩 트랜잭션을 열지 않는다.
4. 기존 unique 오류 변환, no-op 무감사, 세션 삭제 계약을 유지한다.
5. 서비스 테스트가 업무 쓰기와 감사에 동일한 tx가 전달됨을 검증한다.

## Task 4: 초대 생성·폐기를 원자화

**Files:**

- Modify: `src/modules/invites/invite.repo.ts`
- Modify: `src/modules/invites/invite.service.ts`
- Test: `tests/modules/invites/invite.service.test.ts`

### Requirements

1. 학생·관리자·학부모 초대 생성 네 경로의 insert와 감사를 같은 트랜잭션으로 실행한다.
2. 초대 폐기의 조건부 update와 감사를 같은 트랜잭션으로 실행한다.
3. 코드 생성 및 권한·소유권 검사는 쓰기 트랜잭션 전에 유지한다.
4. 상태 변경 없는 `authz:denied` 감사만 기존 best-effort 독립 기록으로 유지한다.
5. 기존 코드 값 비기록 정책과 오류 계약을 보존한다.

## Task 5: 가입과 자동 초대 폐기를 원자화

**Files:**

- Modify: `src/modules/registration/registration.repo.ts`
- Modify: `src/modules/registration/registration.service.ts`
- Modify: `src/modules/verification/verification.repo.ts`
- Modify: `src/modules/verification/verification.service.ts`
- Test: `tests/modules/registration/registration.repo.test.ts`
- Test: `tests/modules/registration/registration.service.test.ts`
- Test: 관련 `tests/integration/registration*.integration.test.ts`

### Requirements

1. 가입 정보 불일치의 실패 횟수 증가, 조건부 초대 폐기, auto-revoke 감사를 하나의 트랜잭션으로 실행한다.
2. 가입 실패 오류는 트랜잭션 정상 종료 뒤 던져 상태 변경을 보존한다.
3. 성공 가입의 사용자·계정·프로필·학적·초대 소진, 인증코드 소진, 감사를 하나의 트랜잭션으로 실행한다.
4. 학생코드 충돌 재시도는 실패한 트랜잭션을 재사용하지 않고 최대 5개의 새 트랜잭션으로 수행한다.
5. 초대 경합·반번호 충돌·기존 사용자 계약을 유지한다.
6. 감사 실패 시 모든 관련 상태가 롤백됨을 실제 DB 또는 동등한 transaction-boundary 테스트로 확인한다.

## Task 6: 학적 편집과 명단 반영을 원자화

**Files:**

- Modify: `src/modules/enrollment/enrollment.repo.ts`
- Modify: `src/modules/enrollment/enrollment.service.ts`
- Modify: `src/modules/enrollment/roster.repo.ts`
- Modify: `src/modules/enrollment/roster.service.ts`
- Test: 관련 `tests/modules/enrollment/*.test.ts`
- Test: 관련 `tests/integration/*enrollment*.test.ts`, `tests/integration/roster*.test.ts`

### Requirements

1. 표 학적 일괄 반영과 모든 학생별 감사를 같은 트랜잭션으로 실행한다.
2. 명단 반영과 요약·소프트 삭제·초대폐기·계정활성 변경 감사를 같은 트랜잭션으로 실행한다.
3. 저장소에 tx가 전달되면 중첩 트랜잭션을 열지 않는다.
4. 학적 일괄 timeout 30초/maxWait 5초, 명단 timeout 120초/maxWait 10초를 서비스 트랜잭션에 보존한다.
5. 감사 실패 시 배치 전체가 롤백되는지 검증한다.

## Task 7: 상벌점 변경을 원자화

**Files:**

- Modify: `src/modules/merit/merit.repo.ts`
- Modify: `src/modules/merit/award.service.ts`
- Modify: `src/modules/merit/rule.service.ts`
- Modify: `src/modules/merit/threshold.service.ts`
- Test: 관련 `tests/modules/merit/*.test.ts`
- Test: `tests/integration/merit.bulk-award.integration.test.ts`

### Requirements

1. 단건 부여·취소, 일괄 부여와 모든 대응 감사를 같은 트랜잭션으로 실행한다.
2. 규정 생성·수정·삭제와 벌점 기준 변경을 각각 대응 감사와 같은 트랜잭션으로 실행한다.
3. 일괄 부여 timeout 30초/maxWait 5초를 보존하고 중첩 트랜잭션을 열지 않는다.
4. 자녀 접근 거부처럼 상태 변경 없는 `authz:denied` 감사는 독립 기록으로 유지한다.
5. 기존 개인정보 최소화와 오류/no-op 계약을 보존한다.

## Task 8: 명단 확정 행을 서버에서 완전 재검증

**Files:**

- Modify: `src/modules/enrollment/roster.schema.ts`
- Modify if needed: `src/modules/enrollment/roster.actions.ts`
- Test: `tests/modules/enrollment/roster.schema.test.ts`
- Test if needed: `tests/modules/enrollment/roster.actions.test.ts`

### Requirements

1. 공백뿐인 이름, 존재하지 않거나 비정규형인 날짜, 조작된 `errors` 입력에 대한 테스트를 먼저 추가하고 RED를 확인한다.
2. 이름을 trim 및 NFC 정규화하고 빈 문자열을 거부한다.
3. 생년월일은 `YYYY-MM-DD` 형식과 실제 달력 날짜를 모두 검사한다.
4. 성공적으로 검증된 출력의 `errors`는 클라이언트 값과 무관하게 `[]`로 만든다.
5. 기존 학생코드, 범위, 재학 좌석 검증을 보존한다.
6. 스키마의 정규화된 출력만 서비스에 전달되는지 확인한다.
7. 집중 단위 테스트와 타입 검사를 통과시킨다.

## Task 9: 완전 검증 명령과 GitHub Actions 추가

**Files:**

- Modify: `package.json`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `vitest.config.mts`

### Requirements

1. `typecheck`가 현재 Next 16.3 권고대로 `next typegen` 후 `tsc --noEmit`을 실행하게 한다.
2. `verify:unit`은 타입 검사, lint, 단위 테스트를 실행한다.
3. `verify`는 `verify:unit`, 전용 테스트 DB 준비, 통합 테스트, 프로덕션 빌드를 모두 실행한다.
4. GitHub Actions는 Node.js 24, `npm ci`, PostgreSQL 18을 사용한다.
5. CI는 단위 검증, 새 DB migration+통합 테스트, 프로덕션 빌드를 명시적으로 실행하고 최소 필수 환경변수만 제공한다.
6. README에 빠른 검증과 완전 검증의 차이 및 Docker 전제 조건을 설명한다.
7. YAML 구문을 확인하고 로컬에서 `verify:unit`, 통합 테스트, 빌드를 실행한다.

## Task 10: 전체 변경 검증과 최종 리뷰

**Files:** all changed files

### Requirements

1. 변경된 모든 파일을 대상으로 감사 원자성 누락, 명단 경계 우회, CI와 로컬 스크립트 불일치를 검토한다.
2. 깨끗한 테스트 DB에서 전체 `npm run verify`를 실행한다.
3. `git diff --check`와 작업 트리 상태를 확인한다.
4. Sol Xhigh 최종 리뷰의 중요한 지적을 수정하고 재검증한다.
