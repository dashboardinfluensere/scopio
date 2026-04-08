-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "joinCode" TEXT;

-- CreateIndex
CREATE INDEX "Organization_joinCode_idx" ON "Organization"("joinCode");
