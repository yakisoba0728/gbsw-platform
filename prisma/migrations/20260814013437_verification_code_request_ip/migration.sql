-- AlterTable
ALTER TABLE "VerificationCode" ADD COLUMN     "requestIp" TEXT;

-- CreateIndex
CREATE INDEX "VerificationCode_requestIp_createdAt_idx" ON "VerificationCode"("requestIp", "createdAt");
