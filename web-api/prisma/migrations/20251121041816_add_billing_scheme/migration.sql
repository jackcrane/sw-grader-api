-- CreateEnum
CREATE TYPE "BillingScheme" AS ENUM ('PER_STUDENT', 'PER_COURSE');

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "billingScheme" "BillingScheme";
