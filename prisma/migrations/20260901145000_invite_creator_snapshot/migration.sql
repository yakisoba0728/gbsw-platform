-- 초대 발급자가 탈퇴해도 발급 당시 이름과 초대 이력은 보존한다.
ALTER TABLE "Invite" ADD COLUMN "createdByName" TEXT;

UPDATE "Invite" AS invite
SET "createdByName" = issuer."name"
FROM "user" AS issuer
WHERE issuer."id" = invite."createdById";

-- 기존 FK가 정상이라면 해당 행은 없어야 한다. 예외 데이터도 마이그레이션을
-- 막지 않으면서 스냅샷이 비어 있지 않도록 명시적인 대체값을 둔다.
UPDATE "Invite"
SET "createdByName" = '(알 수 없음)'
WHERE "createdByName" IS NULL;

ALTER TABLE "Invite" ALTER COLUMN "createdByName" SET NOT NULL;

ALTER TABLE "Invite" DROP CONSTRAINT "Invite_createdById_fkey";
ALTER TABLE "Invite" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Invite"
ADD CONSTRAINT "Invite_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
