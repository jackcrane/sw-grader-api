-- CreateEnum
CREATE TYPE "AssignmentSignatureType" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateTable
CREATE TABLE "AssignmentSignature" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "AssignmentSignatureType" NOT NULL,
    "unitSystem" TEXT NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "surfaceArea" DOUBLE PRECISION NOT NULL,
    "centerOfMassX" DOUBLE PRECISION,
    "centerOfMassY" DOUBLE PRECISION,
    "centerOfMassZ" DOUBLE PRECISION,
    "screenshotB64" TEXT,
    "feedback" TEXT,
    "pointsAwarded" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssignmentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSignature_assignmentId_sortOrder_key" ON "AssignmentSignature"("assignmentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "AssignmentSignature"
  ADD CONSTRAINT "AssignmentSignature_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Submission
ALTER TABLE "Submission"
  ADD COLUMN "feedback" TEXT,
  ADD COLUMN "matchingSignatureId" TEXT;

-- AddForeignKey
ALTER TABLE "Submission"
  ADD CONSTRAINT "Submission_matchingSignatureId_fkey"
  FOREIGN KEY ("matchingSignatureId") REFERENCES "AssignmentSignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
