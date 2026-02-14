ALTER TABLE "Submission"
  ADD COLUMN "graderErrorCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "graderLastError" TEXT,
  ADD COLUMN "graderFailedAt" TIMESTAMP(3),
  ADD COLUMN "graderFailureNotifiedAt" TIMESTAMP(3);
