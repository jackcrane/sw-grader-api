-- CreateEnum
CREATE TYPE "SubmissionRetentionMode" AS ENUM ('BEST', 'MOST_RECENT');

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "submissionRetentionInheritFromCourse" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "submissionRetentionMode" "SubmissionRetentionMode";

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "submissionRetentionMode" "SubmissionRetentionMode" NOT NULL DEFAULT 'BEST';
