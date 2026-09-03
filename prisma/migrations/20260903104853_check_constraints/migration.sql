-- 상태값과 상태별 필드 조합을 DB가 직접 막는다.
--
-- schema.prisma에는 enum이 하나도 없다 — 역할·상태·유형이 전부 주석 달린 문자열
-- 컬럼이다. 애플리케이션 타입은 정상 경로만 제한하므로, 운영 SQL 한 줄이나 잘못
-- 만든 마이그레이션은 `role = 'TEACHER'` 같은 모순 상태를 영구히 남길 수 있다.
-- 그 자리를 CHECK 제약으로 메운다.
--
-- Prisma는 CHECK 제약을 표현하지 못한다. 부분 유니크 인덱스
-- AcademicYear_single_current(20260813005023)와 같은 자리에 같은 이유로 둔다 —
-- **마이그레이션 SQL에만 있고 schema.prisma에는 없다.**
--
-- ── 전부 NOT VALID로 붙이는 이유 ─────────────────────────────────
-- NOT VALID는 기존 행을 검사하지 않고 **새 쓰기부터** 막는다. 운영 DB에 위반 행이
-- 하나라도 있으면 검사하는 ADD CONSTRAINT는 실패하고, `prisma migrate deploy`가
-- 실패하면 배포 전체가 멈춘다. 새 결함이 들어오는 것을 막는 것이 이 마이그레이션의
-- 목적이고, 이미 있는 행을 세어 정정하는 일은 사람의 판단이 필요하다. 둘을 한
-- 배포에 묶지 않는다.
--
-- 검증(VALIDATE CONSTRAINT)은 넣지 않았다. 절차는 이 파일 맨 아래에 적었다.
--
-- ── 넣지 않은 것 ──────────────────────────────────────────────
-- 코드로 증명하지 못한 조합은 넣지 않았다. 틀린 제약은 없는 제약보다 나쁘다.
--
-- * Enrollment의 좌석(grade·classNo·number)과 status 조합 — **양방향 모두 거짓이다.**
--   - "ENROLLED면 좌석이 다 있다"는 enrollment.repo.applyAll이 깬다. 자리 이동·교환이
--     (year, grade, classNo, number) 유니크 제약과 부딪치지 않게 최종 값을 쓰기 전에
--     좌석을 먼저 null로 비우는데, 그때 status는 ENROLLED 그대로다. CHECK는 문장마다
--     즉시 검사하므로(지연 불가) 이 중간 상태에서 터진다.
--   - "비재학이면 좌석이 비어 있다"는 enrollment.schema.enrollmentChangeSchema가 깬다.
--     status와 좌석이 서로 독립이라 교사가 화면에서 GRADUATED + 학년·반·번호를 함께
--     저장할 수 있다. (명단 파일 경로 roster.parse는 이 조합을 오류로 잡지만,
--     수기 편집 경로는 막지 않는다.)
-- * CommunityPost·CommunityComment의 authorRole — post.service·comment.service가
--   `actor.role ?? ""`로 쓴다. 빈 문자열이 정상 값이라 역할 집합으로 가둘 수 없다.
-- * AuditLog의 action·targetType — 새 기능마다 늘어나는 열린 집합이다.
-- * Better Auth가 소유한 session·account·verification 테이블.
-- * Pass의 consentedAt — OUTING은 동의 단계가 아예 없다.
-- * 단순 카운터(Invite.failedAttempts·VerificationCode.attempts·
--   CommunityAttachment.size) — 이 결함(상태값·상태별 필드 조합)의 범위 밖이다.
--
-- * Pass의 status와 decidedAt·cancelledAt 조합 — **증명은 되지만 미룬다.**
--   서비스 셋(decision.service의 approvePass·rejectPass·issuePass)은 언제나
--   status와 decidedAt을 함께 쓰고, 취소 둘(decision.service.cancelPass·
--   request.service의 본인 취소)도 status와 cancelledAt을 함께 쓴다. 그런데 그
--   결합은 **서비스에만 있고 repo에는 없다** — pass.repo.transition의 인자 타입은
--   Prisma.PassUncheckedUpdateManyInput이라 status만 바꾸는 호출이 그 함수의
--   정상적인 사용법이고, 실제로 통합 테스트가 그렇게 부른다
--   (tests/integration/pass.flow·pass.list-window). merit 쪽과 갈리는 지점이 여기다:
--   merit.repo.markCancelled는 네 필드를 한 함수 안에서 묶어 쓰므로 repo 계층에서
--   이미 불변식이 선다. Pass는 repo 계약보다 DB가 더 엄격해지는 셈이라, 제약을
--   넣으려면 repo의 계약도 함께 좁혀야 한다. 그것은 이 마이그레이션의 일이 아니다.
--   나중에 넣을 때도 같은 NOT VALID 형태로 별도 마이그레이션에 둔다:
--     Pass_decided_fields   CHECK ("status" NOT IN ('APPROVED','REJECTED')
--                                  OR "decidedAt" IS NOT NULL)
--     Pass_cancelled_fields CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL))
--   (decidedAt은 한쪽 방향만 걸 수 있다 — 승인된 출입증은 뒤에 취소될 수 있고
--   그때 decidedAt은 남는다.)

-- ── 1. 허용 값 집합 ────────────────────────────────────────────
-- 값은 schema.prisma의 주석이 아니라 코드에서 읽었다.

-- src/core/authz/roles.ts의 ROLES.
-- role이 null인 행은 남겨 둔다 — 컬럼이 nullable이고 NULL을 금지하면 기존 행이 깨진다.
-- Better Auth admin 플러그인의 defaultRole도 "STUDENT"라 이 집합 안이며(core/auth/auth.ts),
-- set-role 엔드포인트는 api/auth/[...all]/route.ts의 allowlist가 404로 막는다.
ALTER TABLE "user" ADD CONSTRAINT "user_role_allowed"
    CHECK ("role" IS NULL OR "role" IN ('ADMIN', 'STUDENT', 'PARENT')) NOT VALID;

-- 쓰는 곳은 registration.repo·bootstrap.repo·roster.repo·enrollment.repo·
-- admin-user.repo 다섯이며 전부 'ACTIVE' 아니면 'INACTIVE'다.
ALTER TABLE "user" ADD CONSTRAINT "user_status_allowed"
    CHECK ("status" IS NULL OR "status" IN ('ACTIVE', 'INACTIVE')) NOT VALID;

-- invite.service가 역할 리터럴을 직접 박아 발급한다(STUDENT·ADMIN·PARENT).
-- 가입 경로도 registration.service가 isRole(invite.role)로 한 번 더 거른다.
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_role_allowed"
    CHECK ("role" IN ('ADMIN', 'STUDENT', 'PARENT')) NOT VALID;

-- invite.repo(PENDING·REVOKED)와 registration.repo(USED·REVOKED)가 전부다.
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_status_allowed"
    CHECK ("status" IN ('PENDING', 'USED', 'REVOKED')) NOT VALID;

-- src/core/authz/enrollment-status.ts의 ENROLLMENT_STATUSES.
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_status_allowed"
    CHECK ("status" IN (
        'ENROLLED', 'GRADUATED', 'WITHDRAWN', 'EXPELLED', 'TRANSFERRED', 'DEFERRED'
    )) NOT VALID;

-- src/modules/verification/verification.schema.ts의 VERIFICATION_CHANNELS.
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_channel_allowed"
    CHECK ("channel" IN ('EMAIL', 'PHONE')) NOT VALID;

-- src/core/authz/merit-track.ts의 MERIT_TRACKS·MERIT_KINDS.
-- MeritAward의 track·kind는 부여 시점 MeritRule의 스냅샷이라 같은 집합을 쓴다.
ALTER TABLE "MeritRule" ADD CONSTRAINT "MeritRule_track_allowed"
    CHECK ("track" IN ('SCHOOL', 'DORM')) NOT VALID;

ALTER TABLE "MeritRule" ADD CONSTRAINT "MeritRule_kind_allowed"
    CHECK ("kind" IN ('MERIT', 'DEMERIT', 'OFFSET')) NOT VALID;

ALTER TABLE "MeritThreshold" ADD CONSTRAINT "MeritThreshold_track_allowed"
    CHECK ("track" IN ('SCHOOL', 'DORM')) NOT VALID;

ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_track_allowed"
    CHECK ("track" IN ('SCHOOL', 'DORM')) NOT VALID;

ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_kind_allowed"
    CHECK ("kind" IN ('MERIT', 'DEMERIT', 'OFFSET')) NOT VALID;

-- merit.schema.ts의 RECENT_AWARD_STATUSES. 쓰는 곳은 기본값 'ACTIVE'와
-- merit.repo.markCancelled의 'CANCELLED' 둘뿐이다.
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_status_allowed"
    CHECK ("status" IN ('ACTIVE', 'CANCELLED')) NOT VALID;

-- src/core/authz/pass-type.ts의 PASS_TYPES·PASS_STATUSES.
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_type_allowed"
    CHECK ("type" IN ('OUTING', 'OVERNIGHT')) NOT VALID;

ALTER TABLE "Pass" ADD CONSTRAINT "Pass_status_allowed"
    CHECK ("status" IN (
        'REQUESTED', 'CONSENTED', 'APPROVED', 'REJECTED', 'CANCELLED'
    )) NOT VALID;

-- 게시판 권한 배열의 원소도 역할이다. community.schema의 roleList는 ADMIN을 뺀
-- 집합만 받지만(ADMIN은 community.access.allows가 항상 통과시킨다), 여기서는
-- ROLES 전체를 허용한다 — ADMIN이 배열에 들어 있어도 판정 결과가 같아 무해하고,
-- 좁게 잡으면 그 무해한 값이 쓰기를 막는다. 막고 싶은 것은 역할 아닌 문자열이다.
ALTER TABLE "Community" ADD CONSTRAINT "Community_roles_allowed"
    CHECK (
        "readRoles" <@ ARRAY['ADMIN', 'STUDENT', 'PARENT']::text[]
        AND "writeRoles" <@ ARRAY['ADMIN', 'STUDENT', 'PARENT']::text[]
    ) NOT VALID;

-- ── 2. 상태별 필드 조합 ────────────────────────────────────────
-- 서비스 코드가 실제로 세우는 불변식만 옮긴다.

-- community.schema.refineWriteSubsetRead가 createCommunitySchema와
-- updateCommunitySchema 양쪽을 감싼다 — "읽을 수 없는 역할에 글쓰기를 줄 수 없습니다."
-- schema.prisma의 Community 주석("writeRoles는 readRoles의 부분집합이다")도 같은 말이다.
ALTER TABLE "Community" ADD CONSTRAINT "Community_write_subset_read"
    CHECK ("writeRoles" <@ "readRoles") NOT VALID;

-- threshold.service.saveThreshold가 유일한 쓰기 경로이고
-- `if (input.danger <= input.warn) throw new MeritError("INVALID_THRESHOLD_ORDER")`로
-- 막는다. merit.schema.thresholdSchema의 refine도 같은 조건이다.
ALTER TABLE "MeritThreshold" ADD CONSTRAINT "MeritThreshold_danger_over_warn"
    CHECK ("danger" > "warn") NOT VALID;

-- merit.schema.ts의 positiveInt(1~1000)가 규정 생성·수정 양쪽에 걸린다.
-- schema.prisma의 MeritRule.points 주석 "항상 양수이며 부호는 kind가 정한다"가
-- 합계 계산의 전제다 — 음수 points가 들어오면 merit.points.netScore가 kind의
-- 부호와 곱해져 상점이 벌점으로 뒤집힌다. 설치용 씨앗(prisma/seed/merit-rules.data.ts)
-- 114개도 1~60 범위다.
ALTER TABLE "MeritRule" ADD CONSTRAINT "MeritRule_points_positive"
    CHECK ("points" > 0) NOT VALID;

-- 부여 시점 규정 points의 스냅샷이다(award.service의 `points: rule.points`).
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_points_positive"
    CHECK ("points" > 0) NOT VALID;

-- merit.repo.markCancelled가 status='CANCELLED'와 cancelledAt을 한 번에 쓰는
-- 유일한 경로이고, 취소를 되돌리는 경로는 없다. 그래서 양방향으로 건다 —
-- 취소인데 시각이 없거나, 시각이 있는데 반영 중인 행은 둘 다 모순이다.
-- (cancelledByUserId는 넣지 않는다. 계정 삭제 시 onDelete: SetNull로 비워진다.)
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_cancelled_fields"
    CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)) NOT VALID;

-- pass.window.assertOrdered가 requestWindow·issueWindow 양쪽에서
-- `endAt <= startAt`을 INVALID_PERIOD로 막는다. 기간을 만드는 곳은 이 둘뿐이고,
-- 이후의 상태 전이(pass.repo.transition·transitionUnexpired)는 startAt·endAt을
-- 건드리지 않는다.
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_period_order"
    CHECK ("endAt" > "startAt") NOT VALID;

-- ── 3. 운영자에게: 언제 어떻게 VALIDATE 하는가 ──────────────────
--
-- 위 제약은 전부 NOT VALID다. **새 쓰기는 이미 막힌다.** 남은 일은 배포 전부터
-- 있던 행에 위반이 있는지 세고, 있으면 정정한 뒤 제약을 검증 상태로 올리는 것이다.
--
-- 1) 위반 행을 센다. CHECK는 NULL을 통과시키므로 여집합은 `IS NOT TRUE`가 아니라
--    `IS FALSE`다. 아래를 그대로 돌리면 표가 하나 나온다.
--
--    SELECT 'user_role_allowed' AS constraint, count(*) FROM "user"
--      WHERE ("role" IS NULL OR "role" IN ('ADMIN','STUDENT','PARENT')) IS FALSE
--    UNION ALL SELECT 'user_status_allowed', count(*) FROM "user"
--      WHERE ("status" IS NULL OR "status" IN ('ACTIVE','INACTIVE')) IS FALSE
--    UNION ALL SELECT 'Invite_role_allowed', count(*) FROM "Invite"
--      WHERE ("role" IN ('ADMIN','STUDENT','PARENT')) IS FALSE
--    UNION ALL SELECT 'Invite_status_allowed', count(*) FROM "Invite"
--      WHERE ("status" IN ('PENDING','USED','REVOKED')) IS FALSE
--    UNION ALL SELECT 'Enrollment_status_allowed', count(*) FROM "Enrollment"
--      WHERE ("status" IN ('ENROLLED','GRADUATED','WITHDRAWN','EXPELLED','TRANSFERRED','DEFERRED')) IS FALSE
--    UNION ALL SELECT 'VerificationCode_channel_allowed', count(*) FROM "VerificationCode"
--      WHERE ("channel" IN ('EMAIL','PHONE')) IS FALSE
--    UNION ALL SELECT 'MeritRule_track_allowed', count(*) FROM "MeritRule"
--      WHERE ("track" IN ('SCHOOL','DORM')) IS FALSE
--    UNION ALL SELECT 'MeritRule_kind_allowed', count(*) FROM "MeritRule"
--      WHERE ("kind" IN ('MERIT','DEMERIT','OFFSET')) IS FALSE
--    UNION ALL SELECT 'MeritRule_points_positive', count(*) FROM "MeritRule"
--      WHERE ("points" > 0) IS FALSE
--    UNION ALL SELECT 'MeritThreshold_track_allowed', count(*) FROM "MeritThreshold"
--      WHERE ("track" IN ('SCHOOL','DORM')) IS FALSE
--    UNION ALL SELECT 'MeritThreshold_danger_over_warn', count(*) FROM "MeritThreshold"
--      WHERE ("danger" > "warn") IS FALSE
--    UNION ALL SELECT 'MeritAward_track_allowed', count(*) FROM "MeritAward"
--      WHERE ("track" IN ('SCHOOL','DORM')) IS FALSE
--    UNION ALL SELECT 'MeritAward_kind_allowed', count(*) FROM "MeritAward"
--      WHERE ("kind" IN ('MERIT','DEMERIT','OFFSET')) IS FALSE
--    UNION ALL SELECT 'MeritAward_status_allowed', count(*) FROM "MeritAward"
--      WHERE ("status" IN ('ACTIVE','CANCELLED')) IS FALSE
--    UNION ALL SELECT 'MeritAward_points_positive', count(*) FROM "MeritAward"
--      WHERE ("points" > 0) IS FALSE
--    UNION ALL SELECT 'MeritAward_cancelled_fields', count(*) FROM "MeritAward"
--      WHERE (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL)) IS FALSE
--    UNION ALL SELECT 'Pass_type_allowed', count(*) FROM "Pass"
--      WHERE ("type" IN ('OUTING','OVERNIGHT')) IS FALSE
--    UNION ALL SELECT 'Pass_status_allowed', count(*) FROM "Pass"
--      WHERE ("status" IN ('REQUESTED','CONSENTED','APPROVED','REJECTED','CANCELLED')) IS FALSE
--    UNION ALL SELECT 'Pass_period_order', count(*) FROM "Pass"
--      WHERE ("endAt" > "startAt") IS FALSE
--    UNION ALL SELECT 'Community_roles_allowed', count(*) FROM "Community"
--      WHERE ("readRoles" <@ ARRAY['ADMIN','STUDENT','PARENT']::text[]
--             AND "writeRoles" <@ ARRAY['ADMIN','STUDENT','PARENT']::text[]) IS FALSE
--    UNION ALL SELECT 'Community_write_subset_read', count(*) FROM "Community"
--      WHERE ("writeRoles" <@ "readRoles") IS FALSE;
--
-- 2) 0이 아닌 줄이 있으면 그 행들을 먼저 고친다. 무엇이 맞는 값인지는 업무 판단이라
--    여기서 자동으로 고치지 않는다.
--
-- 3) 전부 0이 된 뒤에 **별도 마이그레이션**으로 검증을 올린다. 제약마다 한 줄:
--
--    ALTER TABLE "user" VALIDATE CONSTRAINT "user_role_allowed";
--    ...
--
--    VALIDATE CONSTRAINT는 SHARE UPDATE EXCLUSIVE 잠금만 잡아 읽기·쓰기를 막지
--    않는다. 다만 **위반 행이 남아 있으면 실패하고, 그 실패는 migrate deploy를
--    멈춘다** — 지금 NOT VALID로 피하고 있는 바로 그 상황이다. 그래서 1)의 표가
--    전부 0인 것을 눈으로 확인한 뒤에만 그 마이그레이션을 만든다.
--
-- 검증하지 않아도 새 쓰기는 계속 막히므로, 급하지 않다. 검증의 이득은 옵티마이저가
-- 제약을 참으로 신뢰할 수 있게 되는 것과, 과거 데이터에도 같은 보장이 선다는 것이다.
