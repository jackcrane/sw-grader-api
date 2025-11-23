-- CreateTable
CREATE TABLE "CanvasEntitlementMismatch" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "featureBenchUserId" TEXT NOT NULL,
    "reasons" TEXT[],
    "context" JSONB,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasEntitlementMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasEntitlementMismatch_assignmentId_featureBenchUserId_key" ON "CanvasEntitlementMismatch"("assignmentId", "featureBenchUserId");
