/*
  Warnings:

  - A unique constraint covering the columns `[studentInviteCode]` on the table `Course` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[taInviteCode]` on the table `Course` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "studentInviteCode" TEXT,
ADD COLUMN     "taInviteCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Course_studentInviteCode_key" ON "Course"("studentInviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Course_taInviteCode_key" ON "Course"("taInviteCode");
