ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "scheduledDeletionAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Organization_scheduledDeletionAt_idx"
ON "Organization"("scheduledDeletionAt");

CREATE INDEX IF NOT EXISTS "Organization_deletedAt_idx"
ON "Organization"("deletedAt");
