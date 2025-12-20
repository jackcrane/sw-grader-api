/*
  Warnings:

  - Made the column `courseId` on table `Assignment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Assignment" ALTER COLUMN "courseId" SET NOT NULL;
