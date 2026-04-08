-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('MANUAL_UPLOAD', 'API', 'SCRAPER');

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "accountHandle" TEXT NOT NULL,
    "displayName" TEXT,
    "profileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPost" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalPostId" TEXT NOT NULL,
    "url" TEXT,
    "caption" TEXT,
    "tags" TEXT[],
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostSnapshot" (
    "id" TEXT NOT NULL,
    "contentPostId" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "importRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "followers" INTEGER,
    "following" INTEGER,
    "totalLikes" INTEGER,
    "totalPosts" INTEGER,
    "profileViews" INTEGER,
    "importRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "fileName" TEXT,
    "fileFormat" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "platformGuess" "Platform",
    "rowCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAccount_platform_idx" ON "SocialAccount"("platform");

-- CreateIndex
CREATE INDEX "SocialAccount_accountHandle_idx" ON "SocialAccount"("accountHandle");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_platform_accountHandle_key" ON "SocialAccount"("platform", "accountHandle");

-- CreateIndex
CREATE INDEX "ContentPost_socialAccountId_idx" ON "ContentPost"("socialAccountId");

-- CreateIndex
CREATE INDEX "ContentPost_platform_idx" ON "ContentPost"("platform");

-- CreateIndex
CREATE INDEX "ContentPost_publishedAt_idx" ON "ContentPost"("publishedAt");

-- CreateIndex
CREATE INDEX "ContentPost_externalPostId_idx" ON "ContentPost"("externalPostId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_platform_socialAccountId_externalPostId_key" ON "ContentPost"("platform", "socialAccountId", "externalPostId");

-- CreateIndex
CREATE INDEX "PostSnapshot_contentPostId_idx" ON "PostSnapshot"("contentPostId");

-- CreateIndex
CREATE INDEX "PostSnapshot_scrapedAt_idx" ON "PostSnapshot"("scrapedAt");

-- CreateIndex
CREATE INDEX "PostSnapshot_importRunId_idx" ON "PostSnapshot"("importRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSnapshot_contentPostId_scrapedAt_key" ON "PostSnapshot"("contentPostId", "scrapedAt");

-- CreateIndex
CREATE INDEX "AccountSnapshot_socialAccountId_idx" ON "AccountSnapshot"("socialAccountId");

-- CreateIndex
CREATE INDEX "AccountSnapshot_scrapedAt_idx" ON "AccountSnapshot"("scrapedAt");

-- CreateIndex
CREATE INDEX "AccountSnapshot_importRunId_idx" ON "AccountSnapshot"("importRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSnapshot_socialAccountId_scrapedAt_key" ON "AccountSnapshot"("socialAccountId", "scrapedAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportRun_platformGuess_idx" ON "ImportRun"("platformGuess");

-- CreateIndex
CREATE INDEX "ImportRun_importedAt_idx" ON "ImportRun"("importedAt");

-- AddForeignKey
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSnapshot" ADD CONSTRAINT "PostSnapshot_contentPostId_fkey" FOREIGN KEY ("contentPostId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostSnapshot" ADD CONSTRAINT "PostSnapshot_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
