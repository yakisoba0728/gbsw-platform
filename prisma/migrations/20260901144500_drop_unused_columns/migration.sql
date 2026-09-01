-- AlterTable
ALTER TABLE "CommunityComment" DROP COLUMN "deletedByUserId",
DROP COLUMN "deletedReason";

-- AlterTable
ALTER TABLE "CommunityPost" DROP COLUMN "deletedByUserId",
DROP COLUMN "deletedReason";

-- AlterTable
ALTER TABLE "Invite" DROP COLUMN "usedAt";
