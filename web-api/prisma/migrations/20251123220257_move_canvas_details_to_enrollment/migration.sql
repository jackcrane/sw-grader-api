/*
  Warnings:

  - You are about to drop the column `canvasUserId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `canvasUserIdUpdatedAt` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_canvasUserId_key";

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "canvasUserId" TEXT,
ADD COLUMN     "canvasUserIdUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "canvasUserId",
DROP COLUMN "canvasUserIdUpdatedAt";

-- CreateIndex
CREATE INDEX "Enrollment_courseId_canvasUserId_idx" ON "Enrollment"("courseId", "canvasUserId");
