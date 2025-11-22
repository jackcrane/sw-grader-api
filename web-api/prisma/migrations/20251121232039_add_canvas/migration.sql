-- CreateTable
CREATE TABLE "CanvasIntegration" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "instanceUrl" TEXT NOT NULL,
    "canvasCourseId" TEXT,
    "canvasAccountId" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "ltiDeploymentId" TEXT,
    "ltiIssuer" TEXT,
    "developerKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanvasIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvasIntegration_courseId_key" ON "CanvasIntegration"("courseId");

-- AddForeignKey
ALTER TABLE "CanvasIntegration" ADD CONSTRAINT "CanvasIntegration_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
