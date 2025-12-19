import crypto from "node:crypto";
import { prisma } from "#prisma";
import { uploadObject } from "../../../../../util/s3.js";
import {
  bufferFromBase64,
  evaluateSubmissionAgainstSignatures,
} from "../../../../../services/submissionUtils.js";
import { enqueueSignatureTrendCheck } from "../../../../../services/signatureTrends.js";
import { posthog } from "../../../../../util/posthog.js";
import {
  applyLatePolicyToGrade,
  resolveLatePolicy,
} from "../../../../../services/latePolicy.js";

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

    const measuredVolume = Number(volume);
    const measuredSurfaceArea = Number(surfaceArea);
    if (
      !failureOnly &&
      (!Number.isFinite(measuredVolume) ||
        !Number.isFinite(measuredSurfaceArea))
    ) {
      return res.status(400).json({
        error: "Volume and surfaceArea must be valid numbers.",
      });
    }

    try {
      const submission = await readSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found." });
      }
      if (!submission.assignment) {
        return res
          .status(400)
          .json({ error: "Submission is missing assignment metadata." });
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
        const failureMessage =
          normalizedError.slice(0, 500) ||
          "The grader was unable to process this submission.";
        await prisma.submission.update({
          where: { id: submissionId },
        data: {
          volume: null,
          surfaceArea: null,
          grade: 0,
          unpenalizedGrade: null,
          feedback: failureMessage,
          matchingSignatureId: null,
          screenshotKey: null,
          screenshotUrl: null,
          featureTree: null,
          },
        });

        posthog.capture({
          distinctId: submission.userId ?? "grader",
          event: "submission grading failed",
          properties: {
            submissionId,
            assignmentId: submission.assignmentId,
            courseId: submission.courseId ?? null,
            reason: normalizedError || "grader_failure",
          },
        });

        return res.status(200).json({
          ok: true,
          submissionId,
          grade: 0,
          matchedSignatureId: null,
          failure: true,
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
          deriveScreenshotKey(submission.fileKey) ?? submission.screenshotKey;
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
      return res.status(500).json({ error: "Failed to record grader result." });
    }
  },
];
