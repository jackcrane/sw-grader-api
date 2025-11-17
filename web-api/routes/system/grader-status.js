import { withAuth } from "#withAuth";
import { getGraderStatus } from "../../services/graderHealth.js";
import { getQueueMetrics } from "../../services/graderQueue.js";

export const get = [
  withAuth,
  (_req, res) => {
    const status = getGraderStatus();
    const queue = getQueueMetrics();
    res.json({
      online: status.online === true,
      pendingSubmissionCount: status.pendingSubmissionCount ?? 0,
      queueDepth: queue.queued,
      queueProcessing: queue.processing,
      lastCheckedAt: status.lastCheckedAt,
      lastSuccessAt: status.lastSuccessAt,
      lastError: status.lastError,
    });
  },
];
