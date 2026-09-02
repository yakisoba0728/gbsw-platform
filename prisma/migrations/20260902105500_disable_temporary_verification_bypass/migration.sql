-- 실제 발송을 거치지 않고 verifiedAt을 채우던 이전 가입 proof를 배포 즉시 폐기한다.
DELETE FROM "VerificationCode"
WHERE "codeHash" = 'temporary-verification-bypass';
