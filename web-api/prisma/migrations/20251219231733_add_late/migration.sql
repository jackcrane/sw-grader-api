-- CreateEnum
CREATE TYPE "LatePenaltyType" AS ENUM ('FLAT', 'PER_DAY');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "latePolicyAllowLateSubmissions" BOOLEAN,
ADD COLUMN     "latePolicyInheritFromCourse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "latePolicyMaxLatenessMinutes" INTEGER,
ADD COLUMN     "latePolicyPenaltyPercent" DOUBLE PRECISION,
ADD COLUMN     "latePolicyPenaltyType" "LatePenaltyType";

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "latePolicyAllowLateSubmissions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "latePolicyMaxLatenessMinutes" INTEGER,
ADD COLUMN     "latePolicyPenaltyPercent" DOUBLE PRECISION,
ADD COLUMN     "latePolicyPenaltyType" "LatePenaltyType";

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "unpenalizedGrade" DOUBLE PRECISION;
