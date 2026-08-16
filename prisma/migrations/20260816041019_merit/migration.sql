-- CreateTable
CREATE TABLE "MeritRule" (
    "id" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeritRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeritAward" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ruleId" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "note" TEXT,
    "awardedByUserId" TEXT,
    "awardedByName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelledByUserId" TEXT,
    "cancelledByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeritAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeritRule_track_active_idx" ON "MeritRule"("track", "active");

-- CreateIndex
CREATE INDEX "MeritAward_studentProfileId_track_idx" ON "MeritAward"("studentProfileId", "track");

-- CreateIndex
CREATE INDEX "MeritAward_year_track_idx" ON "MeritAward"("year", "track");

-- CreateIndex
CREATE INDEX "MeritAward_batchId_idx" ON "MeritAward"("batchId");

-- AddForeignKey
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_year_fkey" FOREIGN KEY ("year") REFERENCES "AcademicYear"("year") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "MeritRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_awardedByUserId_fkey" FOREIGN KEY ("awardedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeritAward" ADD CONSTRAINT "MeritAward_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
