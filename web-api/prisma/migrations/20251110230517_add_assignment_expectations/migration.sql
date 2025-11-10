/*
  Warnings:

  - Added the required column `gradeVisibility` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pointsPossible` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `surfaceArea` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitSystem` to the `Assignment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `volume` to the `Assignment` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GradeVisibility" AS ENUM ('INSTANT', 'ON_DUE_DATE');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "gradeVisibility" "GradeVisibility" NOT NULL,
ADD COLUMN     "pointsPossible" INTEGER NOT NULL,
ADD COLUMN     "surfaceArea" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "unitSystem" TEXT NOT NULL,
ADD COLUMN     "volume" DOUBLE PRECISION NOT NULL;
