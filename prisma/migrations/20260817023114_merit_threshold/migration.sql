-- CreateTable
CREATE TABLE "MeritThreshold" (
    "track" TEXT NOT NULL,
    "warn" INTEGER NOT NULL,
    "danger" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,
    "updatedByName" TEXT NOT NULL,

    CONSTRAINT "MeritThreshold_pkey" PRIMARY KEY ("track")
);

-- AddForeignKey
ALTER TABLE "MeritThreshold" ADD CONSTRAINT "MeritThreshold_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
