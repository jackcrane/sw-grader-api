/*
  Warnings:

  - Added the required column `tolerancePercent` to the `Assignment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "tolerancePercent" DOUBLE PRECISION NOT NULL;
