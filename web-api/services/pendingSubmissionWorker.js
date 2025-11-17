import crypto from "node:crypto";
import { prisma } from "#prisma";
import { analyzePart } from "./analyzerClient.js";
import {
  bufferFromBase64,
  evaluateSubmissionAgainstSignatures,
} from "./submissionUtils.js";
import {
  isGraderOnline,
  subscribeToGraderStatus,
  updatePendingSubmissionCount,
} from "./graderHealth.js";
import {
  consumeSubmissionJobs,
  enqueueSubmissionJob,
  getQueueMetrics,
  subscribeToQueueMetrics,
} from "./graderQueue.js";
import { downloadObject, uploadObject } from "../util/s3.js";

const SIGNATURE_INCLUDE = {
  include: {
    signatures: {
      where: {
        deleted: false,
      },
      orderBy: {
        sortOrder: "asc",
      },
    },
  },
};

const deriveScreenshotKey = (fileKey) => {
  if (!fileKey) return null;
  const parts = fileKey.split("/");
  if (parts.length === 0) return null;
  parts[parts.length - 1] = `screenshot-${Date.now()}-${crypto.randomUUID()}.png`;
  return parts.join("/");
};

const WAIT_FOR_ONLINE_TIMEOUT_MS = Number(
  process.env.GRADER_MAX_WAIT_MS || 5 * 60 * 1000
); // 5 minutes

const waitForGraderOnline = async () => {
  if (isGraderOnline()) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve();
    }, WAIT_FOR_ONLINE_TIMEOUT_MS);
    const unsubscribe = subscribeToGraderStatus((status) => {
      if (status.online) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
};

const loadSubmissionForProcessing = async (submissionId) => {
  if (!submissionId) return null;
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      deleted: false,
    },
    include: {
      assignment: SIGNATURE_INCLUDE,
    },
  });
};

const processSubmission = async (submission) => {
  if (!submission?.assignment) {
    console.warn("Pending submission missing assignment", submission?.id);
    return;
  }

  if (!submission.fileKey) {
    console.warn("Pending submission missing file key", submission?.id);
    return;
  }

  const fileBuffer = await downloadObject(submission.fileKey);
  if (!fileBuffer) {
    throw new Error("Unable to download submission file.");
  }

  const analysis = await analyzePart({
    fileBuffer,
    filename: submission.fileName || "submission.sldprt",
    unitSystem: submission.assignment.unitSystem,
  });

  const measuredVolume = Number(analysis?.volume);
  const measuredSurfaceArea = Number(analysis?.surfaceArea);
  if (
    !Number.isFinite(measuredVolume) ||
    !Number.isFinite(measuredSurfaceArea)
  ) {
    throw new Error("Analyzer response missing volume or surface area.");
  }

  const tolerance = Number(submission.assignment.tolerancePercent) || 0;
  const evaluation = evaluateSubmissionAgainstSignatures({
    assignment: submission.assignment,
    measuredVolume,
    measuredSurfaceArea,
    tolerance,
  });

  let screenshotKey = submission.screenshotKey ?? null;
  let screenshotUrl = submission.screenshotUrl ?? null;
  const screenshotBuffer = bufferFromBase64(
    analysis?.screenshot ?? analysis?.screenshotB64 ?? ""
  );

  if (screenshotBuffer) {
    const nextScreenshotKey =
      deriveScreenshotKey(submission.fileKey) ?? submission.screenshotKey;
    if (nextScreenshotKey) {
      const upload = await uploadObject({
        key: nextScreenshotKey,
        body: screenshotBuffer,
        contentType: "image/png",
      });
      screenshotKey = upload?.key ?? screenshotKey;
      screenshotUrl = upload?.url ?? screenshotUrl;
    }
  }

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      volume: measuredVolume,
      surfaceArea: measuredSurfaceArea,
      grade: evaluation.grade,
      feedback: evaluation.feedback ?? null,
      matchingSignatureId: evaluation.matchingSignatureId ?? null,
      screenshotKey,
      screenshotUrl,
    },
  });
};

const handleSubmissionJob = async ({ submissionId }) => {
  await waitForGraderOnline();
  const submission = await loadSubmissionForProcessing(submissionId);
  if (!submission) {
    console.warn("Queue referenced missing submission", submissionId);
    return;
  }
  if (submission.grade != null) {
    // Already processed; skip duplicate message
    return;
  }
  await processSubmission(submission);
};

const seedPendingSubmissions = async () => {
  try {
    const pending = await prisma.submission.findMany({
      where: {
        deleted: false,
        grade: null,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    for (const item of pending) {
      await enqueueSubmissionJob(
        { submissionId: item.id },
        { trackPosition: false }
      ).catch((error) => {
        console.warn(
          `Failed to enqueue pending submission ${item.id}`,
          error
        );
      });
    }
  } catch (error) {
    console.warn("Unable to seed pending submissions", error);
  }
};

const bridgeQueueMetricsToHealthStatus = () => {
  subscribeToQueueMetrics((metrics) => {
    updatePendingSubmissionCount(metrics.totalPending);
  });
  updatePendingSubmissionCount(getQueueMetrics().totalPending);
};

const startQueueConsumer = () => {
  consumeSubmissionJobs(handleSubmissionJob).catch((error) => {
    console.error("Submission queue consumer crashed", error);
    setTimeout(startQueueConsumer, 10000);
  });
};

export const startPendingSubmissionWorker = () => {
  bridgeQueueMetricsToHealthStatus();
  seedPendingSubmissions().catch((error) => {
    console.warn("Failed to enqueue pending submissions on start", error);
  });
  startQueueConsumer();
};
