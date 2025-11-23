-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CANVAS_POINTS_MISMATCH';

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "canvasPointsMismatchNotifiedAt" TIMESTAMP(3);
