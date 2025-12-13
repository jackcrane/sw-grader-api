-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SIGNATURE_TREND';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "courseId" TEXT;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
