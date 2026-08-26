-- CreateTable
CREATE TABLE "Pass" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "destination" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "requestedByName" TEXT NOT NULL,
    "consentedByUserId" TEXT,
    "consentedByName" TEXT,
    "consentedAt" TIMESTAMP(3),
    "consentByProxy" BOOLEAN NOT NULL DEFAULT false,
    "consentNote" TEXT,
    "decidedByUserId" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "cancelledByUserId" TEXT,
    "cancelledByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pass_studentProfileId_startAt_idx" ON "Pass"("studentProfileId", "startAt" DESC);

-- CreateIndex
CREATE INDEX "Pass_status_endAt_idx" ON "Pass"("status", "endAt");

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_consentedByUserId_fkey" FOREIGN KEY ("consentedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pass" ADD CONSTRAINT "Pass_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
