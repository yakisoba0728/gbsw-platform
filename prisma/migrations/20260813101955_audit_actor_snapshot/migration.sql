-- 감사로그가 계정을 붙잡지 않게 한다.
--
-- actorUserId가 Restrict라 기록이 있는 계정은 지울 수 없었다. 명단에서 줄을 지우면
-- 계정까지 지우려면 이 제약을 풀어야 한다. 대신 행위자 이름을 기록 시점 스냅샷으로
-- 박아, 계정이 사라져도 "누가 했는지"는 남긴다.

ALTER TABLE "AuditLog" ADD COLUMN "actorName" TEXT;

UPDATE "AuditLog" a
SET "actorName" = u.name
FROM "user" u
WHERE u.id = a."actorUserId" AND a."actorName" IS NULL;

-- 행위자를 못 찾는 기록은 있을 수 없지만(지금은 Restrict라서), 방어적으로 채운다.
UPDATE "AuditLog" SET "actorName" = '(알 수 없음)' WHERE "actorName" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "actorName" SET NOT NULL;

ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorUserId_fkey";
ALTER TABLE "AuditLog" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
