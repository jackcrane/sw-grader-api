-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "hidePaymentInfoFromOtherTeachers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "primaryBillingContactUserId" TEXT,
ADD COLUMN     "primarySystemContactUserId" TEXT,
ADD COLUMN     "primaryTeacherUserId" TEXT;
