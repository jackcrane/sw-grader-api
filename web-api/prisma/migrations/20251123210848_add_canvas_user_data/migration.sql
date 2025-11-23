/*
  Warnings:

  - A unique constraint covering the columns `[canvasUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "canvasUserId" TEXT,
ADD COLUMN     "canvasUserIdUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CanvasAssignmentLaunch" (
    "id" TEXT NOT NULL,
    "token" TEXT,
    "assignmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT,
    "canvasConsumerKey" TEXT,
    "canvasUserId" TEXT,
    "canvasCourseId" TEXT,
    "canvasResultSourcedId" TEXT,
    "canvasOutcomeServiceUrl" TEXT,
    "canvasReturnUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasAssignmentLaunch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasAssignmentLaunch_token_key" ON "CanvasAssignmentLaunch"("token");

-- CreateIndex
CREATE INDEX "CanvasAssignmentLaunch_assignmentId_userId_idx" ON "CanvasAssignmentLaunch"("assignmentId", "userId");

-- CreateIndex
CREATE INDEX "CanvasAssignmentLaunch_assignmentId_canvasUserId_idx" ON "CanvasAssignmentLaunch"("assignmentId", "canvasUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_canvasUserId_key" ON "User"("canvasUserId");

-- AddForeignKey
ALTER TABLE "CanvasAssignmentLaunch" ADD CONSTRAINT "CanvasAssignmentLaunch_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvasAssignmentLaunch" ADD CONSTRAINT "CanvasAssignmentLaunch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
