import crypto from "node:crypto";
import { prisma } from "#prisma";
import { uploadObject, buildPublicUrl } from "../../../../../util/s3.js";
import {
  bufferFromBase64,
  evaluateSubmissionAgainstSignatures,
  buildSubmissionAssetKey,
} from "../../../../../services/submissionUtils.js";
import { enqueueSignatureTrendCheck } from "../../../../../services/signatureTrends.js";
import { posthog } from "../../../../../util/posthog.js";
import {
  applyLatePolicyToGrade,
  resolveLatePolicy,
} from "../../../../../services/latePolicy.js";
import { sendEmail } from "../../../../../util/postmark.js";

const MAX_GRADER_ERROR_COUNT = 5;
const GRADER_FAILURE_ALERT_EMAIL = "jack@cranedigitalplatforms.com";

const signaturesInclude = {
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
  parts[
    parts.length - 1
  ] = `screenshot-${Date.now()}-${crypto.randomUUID()}.png`;
  return parts.join("/");
};

const buildFallbackScreenshotKey = (submission) => {
  return buildSubmissionAssetKey({
    courseId: submission.courseId ?? "course",
    assignmentId: submission.assignmentId ?? "assignment",
    userId: submission.userId ?? "user",
    type: "screenshot",
    extension: ".png",
  });
};

const verifyGraderSecret = (req, res, next) => {
  const secret = process.env.GRADER_SHARED_SECRET?.trim();
  if (!secret) return next();
  const header = req.get("x-grader-secret");
  if (header !== secret) {
    return res.status(403).json({ error: "Invalid grader credentials." });
  }
  return next();
};

const readSubmission = async (submissionId) => {
  if (!submissionId) return null;
  return prisma.submission.findFirst({
    where: {
      id: submissionId,
      deleted: false,
    },
    include: {
      assignment: signaturesInclude,
      course: true,
    },
  });
};

const truncate = (value, max = 1000) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  return text.slice(0, max);
};

const stringifyPayload = (payload) => {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return "[unserializable payload]";
  }
};

const buildFailureFeedback = (reason) => {
  const safeReason =
    truncate(reason, 500) || "The grader was unable to process this submission.";
  return `Auto-grading failed after ${MAX_GRADER_ERROR_COUNT} attempts. Last error: ${safeReason}`;
};

const notifySubmissionFailure = async ({ submission, reason, payload }) => {
  const body = [
    `Submission ${submission.id} hit ${MAX_GRADER_ERROR_COUNT} grader webhook errors and was marked failed.`,
    "",
    `Submission ID: ${submission.id}`,
    `Assignment ID: ${submission.assignmentId ?? "unknown"}`,
    `Course ID: ${submission.courseId ?? "unknown"}`,
    `User ID: ${submission.userId ?? "unknown"}`,
    `File name: ${submission.fileName ?? "unknown"}`,
    `File key: ${submission.fileKey ?? "unknown"}`,
    `Error count: ${submission.graderErrorCount ?? MAX_GRADER_ERROR_COUNT}`,
    `Last error: ${truncate(reason, 2000) || "unknown"}`,
    "",
    "Webhook payload:",
    truncate(stringifyPayload(payload), 12000),
  ].join("\n");

  await sendEmail({
    to: GRADER_FAILURE_ALERT_EMAIL,
    subject: `[FeatureBench] Submission ${submission.id} auto-grading failed`,
    text: body,
  });
};

const recordGraderErrorAttempt = async ({
  submission,
  submissionId,
  reason,
  payload,
}) => {
  if (!submissionId) {
    return { finalFailure: false, errorCount: 0 };
  }

  const safeReason = truncate(reason, 1000);
  const next = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      graderErrorCount: { increment: 1 },
      graderLastError: safeReason || null,
    },
    select: {
      id: true,
      userId: true,
      assignmentId: true,
      courseId: true,
      fileName: true,
      fileKey: true,
      grade: true,
      graderErrorCount: true,
      graderFailureNotifiedAt: true,
    },
  });

  const errorCount = Number(next.graderErrorCount) || 0;
  const finalFailure = errorCount >= MAX_GRADER_ERROR_COUNT;

  posthog.capture({
    distinctId: next.userId ?? "grader",
    event: "submission grading webhook error",
    properties: {
      submissionId,
      assignmentId: next.assignmentId ?? submission?.assignmentId ?? null,
      courseId: next.courseId ?? submission?.courseId ?? null,
      errorCount,
      finalFailure,
      reason: safeReason || "grader_webhook_error",
    },
  });

  if (!finalFailure || next.grade != null) {
    return { finalFailure: false, errorCount };
  }

  const failed = await prisma.submission.update({
    where: { id: submissionId },
    data: {
      volume: null,
      surfaceArea: null,
      grade: 0,
      unpenalizedGrade: null,
      feedback: buildFailureFeedback(safeReason),
      matchingSignatureId: null,
      screenshotKey: null,
      screenshotUrl: null,
      featureTree: null,
      graderFailedAt: new Date(),
    },
    select: {
      id: true,
      userId: true,
      assignmentId: true,
      courseId: true,
      fileName: true,
      fileKey: true,
      graderErrorCount: true,
      graderFailureNotifiedAt: true,
    },
  });

  const notificationClaim = await prisma.submission.updateMany({
    where: {
      id: submissionId,
      graderFailureNotifiedAt: null,
    },
    data: {
      graderFailureNotifiedAt: new Date(),
    },
  });

  if (notificationClaim.count > 0) {
    await notifySubmissionFailure({
      submission: failed,
      reason: safeReason,
      payload,
    });
  }

  return {
    finalFailure: true,
    errorCount,
  };
};

export const post = [
  verifyGraderSecret,
  async (req, res) => {
    const { submissionId } = req.params;
    const { volume, surfaceArea, screenshot, error, featureTree } =
      req.body ?? {};

    if (!submissionId) {
      return res.status(400).json({ error: "Submission id is required." });
    }

    const normalizedError =
      typeof error === "string" ? error.trim() : "";
    const failureOnly = normalizedError.length > 0;
    const featureTreePayload =
      featureTree === undefined ? null : featureTree;

    try {
      const submission = await readSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found." });
      }
      if (!submission.assignment) {
        const missingAssignmentAttempt = await recordGraderErrorAttempt({
          submission,
          submissionId,
          reason: "Submission is missing assignment metadata.",
          payload: req.body,
        });
        if (!missingAssignmentAttempt.finalFailure) {
          return res.status(500).json({
            error: `Submission is missing assignment metadata (attempt ${missingAssignmentAttempt.errorCount}/${MAX_GRADER_ERROR_COUNT}).`,
          });
        }
        return res.status(200).json({
          ok: true,
          submissionId,
          grade: 0,
          matchedSignatureId: null,
          failure: true,
          errorCount: missingAssignmentAttempt.errorCount,
        });
      }

      if (submission.grade != null) {
        posthog.capture({
          distinctId: submission.userId ?? "grader",
          event: "submission grading skipped",
          properties: {
            submissionId,
            reason: "already_graded",
          },
        });
        return res.status(200).json({
          ok: true,
          submissionId,
          message: "Submission already graded.",
        });
      }

      if (failureOnly) {
        const failedAttempt = await recordGraderErrorAttempt({
          submission,
          submissionId,
          reason: normalizedError || "The grader returned an error.",
          payload: req.body,
        });
        if (!failedAttempt.finalFailure) {
          return res.status(500).json({
            error: `The grader returned an error (attempt ${failedAttempt.errorCount}/${MAX_GRADER_ERROR_COUNT}).`,
          });
        }
        return res.status(200).json({
          ok: true,
          submissionId,
          grade: 0,
          matchedSignatureId: null,
          failure: true,
          errorCount: failedAttempt.errorCount,
        });
      }

      const measuredVolume = Number(volume);
      const measuredSurfaceArea = Number(surfaceArea);
      if (
        !Number.isFinite(measuredVolume) ||
        !Number.isFinite(measuredSurfaceArea)
      ) {
        const invalidMetricsAttempt = await recordGraderErrorAttempt({
          submission,
          submissionId,
          reason: "Volume and surfaceArea must be valid numbers.",
          payload: req.body,
        });
        if (!invalidMetricsAttempt.finalFailure) {
          return res.status(500).json({
            error: `Volume and surfaceArea must be valid numbers (attempt ${invalidMetricsAttempt.errorCount}/${MAX_GRADER_ERROR_COUNT}).`,
          });
        }
        return res.status(200).json({
          ok: true,
          submissionId,
          grade: 0,
          matchedSignatureId: null,
          failure: true,
          errorCount: invalidMetricsAttempt.errorCount,
        });
      }

      const tolerance = Number(submission.assignment.tolerancePercent) || 0;
      const evaluation = evaluateSubmissionAgainstSignatures({
        assignment: submission.assignment,
        measuredVolume,
        measuredSurfaceArea,
        tolerance,
      });

      const lateResult = applyLatePolicyToGrade({
        policy: resolveLatePolicy({
          course: submission.course,
          assignment: submission.assignment,
        }),
        submittedAt: submission.createdAt,
        dueDate: submission.assignment?.dueDate ?? null,
        rawGrade: evaluation.grade,
      });
      const finalGrade =
        lateResult?.grade ?? evaluation.grade ?? null;
      const unpenalizedGrade =
        lateResult?.unpenalizedGrade ?? evaluation.grade ?? null;

      let screenshotKey = submission.screenshotKey ?? null;
      let screenshotUrl = submission.screenshotUrl ?? null;
      const screenshotBuffer = bufferFromBase64(screenshot ?? "");
      if (screenshotBuffer) {
        const targetKey =
          deriveScreenshotKey(submission.fileKey) ??
          submission.screenshotKey ??
          buildFallbackScreenshotKey(submission);
        if (targetKey) {
          try {
            const upload = await uploadObject({
              key: targetKey,
              body: screenshotBuffer,
              contentType: "image/png",
            });
            screenshotKey = upload?.key ?? screenshotKey;
            screenshotUrl = upload?.url ?? screenshotUrl;
          } catch (error) {
            console.warn(
              `Failed to upload grader screenshot for submission ${submissionId}`,
              error
            );
          }
        }
      }
      if (screenshotKey && !screenshotUrl) {
        screenshotUrl = buildPublicUrl(screenshotKey) ?? screenshotUrl;
      }

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          volume: measuredVolume,
          surfaceArea: measuredSurfaceArea,
          grade: finalGrade,
          unpenalizedGrade,
          feedback: evaluation.feedback ?? null,
          matchingSignatureId: evaluation.matchingSignatureId ?? null,
          screenshotKey,
          screenshotUrl,
          featureTree: featureTreePayload,
          graderErrorCount: 0,
          graderLastError: null,
          graderFailedAt: null,
        },
      });

      enqueueSignatureTrendCheck({
        assignmentId: submission.assignmentId,
        courseId: submission.courseId ?? null,
      });

      posthog.capture({
        distinctId: submission.userId ?? "grader",
        event: "submission graded",
        properties: {
          submissionId,
          assignmentId: submission.assignmentId,
          courseId: submission.courseId ?? null,
          grade: finalGrade,
          unpenalizedGrade,
          matchingSignatureId: evaluation.matchingSignatureId ?? null,
          latePenaltyReason: lateResult?.reason ?? null,
        },
      });

      return res.status(200).json({
        ok: true,
        submissionId,
        grade: finalGrade,
        matchedSignatureId: evaluation.matchingSignatureId ?? null,
        unpenalizedGrade,
        latePenaltyReason: lateResult?.reason ?? null,
      });
    } catch (error) {
      console.error(
        `Failed to record grader result for submission ${submissionId}`,
        error
      );
      try {
        const submission = await readSubmission(submissionId);
        if (submission?.grade == null) {
          const fallbackAttempt = await recordGraderErrorAttempt({
            submission,
            submissionId,
            reason:
              error?.message || "Failed to record grader result in webhook.",
            payload: req.body,
          });
          if (fallbackAttempt.finalFailure) {
            return res.status(200).json({
              ok: true,
              submissionId,
              grade: 0,
              matchedSignatureId: null,
              failure: true,
              errorCount: fallbackAttempt.errorCount,
            });
          }
        }
      } catch (trackingError) {
        console.error(
          `Failed to track grader webhook error for submission ${submissionId}`,
          trackingError
        );
      }
      return res.status(500).json({ error: "Failed to record grader result." });
    }
  },
];
