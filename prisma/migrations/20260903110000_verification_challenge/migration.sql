-- 인증 확인을 대상값이 아니라 발급된 challenge에 결속한다.
--
-- 지금까지 confirmCode는 (channel, target)으로 최신 활성 코드를 찾아 시도 횟수를
-- 올렸다. 대상 이메일·전화번호는 비밀이 아니므로, 그것만 아는 제3자가 아무 6자리나
-- 반복해 정상 가입자의 코드를 5회 만에 태워 버릴 수 있었다. challengeId는 발급
-- 응답으로만 나가는 불투명한 값이라 요청한 본인만 확인할 수 있다.
--
-- inviteId는 발송을 허가한 초대를 기록한다. 초대별 발송 예산을 세고, 가입 완료 때
-- 두 proof가 그 초대의 것인지 대조한다.

-- 기존 행은 5분짜리 임시 데이터이고 코드 해시 방식이 바뀌면서 이미 확인 불가 상태다.
-- 그래도 지우지 않고 무작위 값으로 채워 발송 한도 산정 기록을 보존한다.
ALTER TABLE "VerificationCode" ADD COLUMN "challengeId" TEXT;
ALTER TABLE "VerificationCode" ADD COLUMN "inviteId" TEXT;

UPDATE "VerificationCode" SET "challengeId" = gen_random_uuid()::text WHERE "challengeId" IS NULL;

ALTER TABLE "VerificationCode" ALTER COLUMN "challengeId" SET NOT NULL;

CREATE UNIQUE INDEX "VerificationCode_challengeId_key" ON "VerificationCode"("challengeId");
CREATE INDEX "VerificationCode_inviteId_createdAt_idx" ON "VerificationCode"("inviteId", "createdAt");
