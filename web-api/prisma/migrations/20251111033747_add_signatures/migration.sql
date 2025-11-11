-- DropForeignKey
ALTER TABLE "AssignmentSignature" DROP CONSTRAINT "AssignmentSignature_assignmentId_fkey";

-- AlterTable
ALTER TABLE "AssignmentSignature" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "AssignmentSignature" ADD CONSTRAINT "AssignmentSignature_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
