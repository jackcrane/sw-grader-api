-- CreateEnum
CREATE TYPE "EnrollmentType" AS ENUM ('STUDENT', 'TEACHER', 'TA');

-- CreateEnum
CREATE TYPE "GradeVisibility" AS ENUM ('INSTANT', 'ON_DUE_DATE');

-- CreateEnum
CREATE TYPE "AssignmentSignatureType" AS ENUM ('CORRECT', 'INCORRECT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workosId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "canCreateCourses" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbr" TEXT NOT NULL,
    "studentInviteCode" TEXT,
    "taInviteCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "EnrollmentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitSystem" TEXT NOT NULL,
    "pointsPossible" INTEGER NOT NULL,
    "gradeVisibility" "GradeVisibility" NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "surfaceArea" DOUBLE PRECISION NOT NULL,
    "tolerancePercent" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "volume" DOUBLE PRECISION,
    "surfaceArea" DOUBLE PRECISION,
    "fileKey" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "screenshotKey" TEXT,
    "screenshotUrl" TEXT,
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "matchingSignatureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssignmentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_workosId_key" ON "User"("workosId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Course_studentInviteCode_key" ON "Course"("studentInviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "Course_taInviteCode_key" ON "Course"("taInviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSignature_assignmentId_sortOrder_key" ON "AssignmentSignature"("assignmentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_matchingSignatureId_fkey" FOREIGN KEY ("matchingSignatureId") REFERENCES "AssignmentSignature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSignature" ADD CONSTRAINT "AssignmentSignature_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
