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

const refreshPendingCount = async () => {
  try {
    const count = await prisma.submission.count({
      where: {
        deleted: false,
        grade: null,
      },
    });
    updatePendingSubmissionCount(count);
    return count;
  } catch (error) {
    console.warn("Failed to refresh pending submission count", error);
    return null;
  }
};

const fetchNextPendingSubmission = () => {
  return prisma.submission.findFirst({
    where: {
      deleted: false,
      grade: null,
    },
    orderBy: {
      createdAt: "asc",
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

const PROCESS_INTERVAL_MS = Number(
  process.env.PENDING_AUTOGRADE_POLL_MS || 15000
);
let processing = false;

const workQueue = async () => {
  if (processing) return;
  if (!isGraderOnline()) return;
  processing = true;
  try {
    await refreshPendingCount();
    while (isGraderOnline()) {
      const submission = await fetchNextPendingSubmission();
      if (!submission) break;
      try {
        await processSubmission(submission);
      } catch (error) {
        console.error(
          `Failed to process submission ${submission.id}`,
          error
        );
        break;
      } finally {
        await refreshPendingCount();
      }
    }
    await refreshPendingCount();
  } finally {
    processing = false;
  }
};

export const startPendingSubmissionWorker = () => {
  refreshPendingCount();
  subscribeToGraderStatus((status) => {
    if (status.online) {
      workQueue();
    }
  });
  setInterval(() => {
    workQueue();
  }, PROCESS_INTERVAL_MS);
};
