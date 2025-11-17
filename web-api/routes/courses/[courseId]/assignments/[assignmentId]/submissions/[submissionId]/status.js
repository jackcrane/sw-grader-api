import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { withSignedAssetUrls } from "../../../../../../../util/submissionAssets.js";
import { computeSubmissionQueuePosition } from "../../../../../../../services/submissionQueuePosition.js";
import { getGraderStatus } from "../../../../../../../services/graderHealth.js";

const STREAM_INTERVAL_MS = Number(
  process.env.SUBMISSION_STATUS_INTERVAL_MS || 4000
);
const STREAM_TIMEOUT_MS = Number(
  process.env.SUBMISSION_STATUS_TIMEOUT_MS || 10 * 60 * 1000
);

const ensureEnrollment = async (userId, courseId) => {
  if (!userId || !courseId) return null;
  return prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      deleted: false,
      course: {
        deleted: false,
      },
    },
  });
};

const fetchSubmission = async (submissionId, assignmentId) => {
  if (!submissionId || !assignmentId) return null;
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      assignmentId,
      deleted: false,
    },
    select: {
      id: true,
      userId: true,
      grade: true,
      feedback: true,
      matchingSignatureId: true,
      fileKey: true,
      fileUrl: true,
      fileName: true,
      screenshotKey: true,
      screenshotUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const canViewSubmission = (submission, enrollment, userId) => {
  if (!submission) return false;
  if (!enrollment) return false;
  if (enrollment.type && ["TEACHER", "TA"].includes(enrollment.type)) {
    return true;
  }
  return submission.userId === userId;
};

const buildStatusPayload = async (submission) => {
  if (!submission) return {
    state: "missing",
    submission: null,
  };
  const queuePosition = await computeSubmissionQueuePosition({
    submissionId: submission.id,
    createdAt: submission.createdAt,
    grade: submission.grade,
  });
  const state =
    submission.grade != null
      ? "graded"
      : (queuePosition?.aheadCount ?? 0) > 0
      ? "queued"
      : "processing";

  const status = getGraderStatus();
  const payload = {
    submissionId: submission.id,
    state,
    queueAheadCount: queuePosition?.aheadCount ?? 0,
    queuePosition: queuePosition?.position ?? 0,
    queueSize:
      queuePosition?.queueSize ??
      status.pendingSubmissionCount ??
      null,
    graderOnline: status.online === true,
    updatedAt: submission.updatedAt,
  };

  if (state === "graded") {
    payload.submission = await withSignedAssetUrls(submission);
  } else {
    payload.submission = {
      id: submission.id,
      fileName: submission.fileName,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
    };
  }

  return payload;
};

export const get = [
  withAuth,
  async function* submissionStatus(req) {
    const { courseId, assignmentId, submissionId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      yield {
        event: "status",
        data: { state: "error", error: "Course enrollment not found." },
      };
      return;
    }

    const start = Date.now();
    while (Date.now() - start < STREAM_TIMEOUT_MS) {
      const submission = await fetchSubmission(submissionId, assignmentId);
      if (!submission) {
        yield {
          event: "status",
          data: { state: "missing", submissionId },
        };
        return;
      }

      if (!canViewSubmission(submission, enrollment, userId)) {
        yield {
          event: "status",
          data: { state: "error", error: "Not authorized." },
        };
        return;
      }

      const payload = await buildStatusPayload(submission);
      yield {
        event: "status",
        data: payload,
      };

      if (payload.state === "graded") {
        return;
      }

      await sleep(STREAM_INTERVAL_MS);
    }

    yield {
      event: "status",
      data: {
        state: "timeout",
        submissionId,
        error: "Timed out waiting for grading updates.",
      },
    };
  },
];
