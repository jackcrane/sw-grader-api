/*
  Warnings:

  - Made the column `billingScheme` on table `Course` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "billingScheme" SET NOT NULL;
