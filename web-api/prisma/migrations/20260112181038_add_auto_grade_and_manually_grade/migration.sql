-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "autoGrade" DOUBLE PRECISION,
ADD COLUMN     "manuallyGraded" BOOLEAN NOT NULL DEFAULT false;
