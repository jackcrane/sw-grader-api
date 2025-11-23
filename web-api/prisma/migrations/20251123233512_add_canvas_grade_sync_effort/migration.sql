-- CreateEnum
CREATE TYPE "CanvasGradeSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "canvasGradeSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "canvasGradeSyncError" TEXT,
ADD COLUMN     "canvasGradeSyncLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "canvasGradeSyncQueuedAt" TIMESTAMP(3),
ADD COLUMN     "canvasGradeSyncStatus" "CanvasGradeSyncStatus",
ADD COLUMN     "canvasGradeSyncedAt" TIMESTAMP(3),
ADD COLUMN     "canvasOutcomeServiceUrl" TEXT,
ADD COLUMN     "canvasResultSourcedId" TEXT;
