import { withAuth } from "#withAuth";
import { getGraderStatus } from "../../services/graderHealth.js";

export const get = [
  withAuth,
  (_req, res) => {
    const status = getGraderStatus();
    res.json({
      online: status.online === true,
      pendingSubmissionCount: status.pendingSubmissionCount ?? 0,
      lastCheckedAt: status.lastCheckedAt,
      lastSuccessAt: status.lastSuccessAt,
      lastError: status.lastError,
    });
  },
];

