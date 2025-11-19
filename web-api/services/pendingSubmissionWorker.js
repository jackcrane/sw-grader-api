import { prisma } from "#prisma";
import {
  enqueueSubmissionJob,
  getQueueMetrics,
  subscribeToQueueMetrics,
} from "./graderQueue.js";
import { updatePendingSubmissionCount } from "./graderHealth.js";

const fetchPendingSubmissions = () => {
  return prisma.submission.findMany({
    where: {
      deleted: false,
      grade: null,
    },
    select: {
      id: true,
      fileKey: true,
      fileName: true,
      assignmentId: true,
      userId: true,
      assignment: {
        select: {
          unitSystem: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
};

const seedPendingSubmissions = async () => {
  try {
    const metrics = getQueueMetrics();
    if (metrics.queued > 0 || metrics.processing > 0) {
      return;
    }
    const pending = await fetchPendingSubmissions();
    for (const submission of pending) {
      if (!submission.fileKey) continue;
      await enqueueSubmissionJob(
        {
          submissionId: submission.id,
          fileKey: submission.fileKey,
          fileName: submission.fileName ?? null,
          assignmentId: submission.assignmentId,
          unitSystem: submission.assignment?.unitSystem,
          userId: submission.userId,
        },
        { trackPosition: false }
      ).catch((error) => {
        console.warn(
          `Failed to enqueue pending submission ${submission.id}`,
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

export const startPendingSubmissionWorker = () => {
  bridgeQueueMetricsToHealthStatus();
  seedPendingSubmissions();
};
