-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "readRoles" TEXT[],
    "writeRoles" TEXT[],
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "allowAttachments" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "uploaderUserId" TEXT,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE INDEX "Community_active_sortOrder_idx" ON "Community"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "CommunityPost_communityId_deletedAt_createdAt_idx" ON "CommunityPost"("communityId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_deletedAt_createdAt_idx" ON "CommunityComment"("postId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityAttachment_storageKey_key" ON "CommunityAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "CommunityAttachment_uploaderUserId_postId_idx" ON "CommunityAttachment"("uploaderUserId", "postId");

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAttachment" ADD CONSTRAINT "CommunityAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityAttachment" ADD CONSTRAINT "CommunityAttachment_uploaderUserId_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
