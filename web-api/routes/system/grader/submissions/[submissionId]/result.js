import crypto from "node:crypto";
import { prisma } from "#prisma";
import { uploadObject } from "../../../../../../util/s3.js";
import {
  bufferFromBase64,
  evaluateSubmissionAgainstSignatures,
} from "../../../../../../services/submissionUtils.js";

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
  parts[parts.length - 1] = `screenshot-${Date.now()}-${crypto.randomUUID()}.png`;
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
    },
  });
};

export const post = [
  verifyGraderSecret,
  async (req, res) => {
    const { submissionId } = req.params;
    const { volume, surfaceArea, screenshot } = req.body ?? {};

    if (!submissionId) {
      return res.status(400).json({ error: "Submission id is required." });
    }

    const measuredVolume = Number(volume);
    const measuredSurfaceArea = Number(surfaceArea);
    if (!Number.isFinite(measuredVolume) || !Number.isFinite(measuredSurfaceArea)) {
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
        return res.status(200).json({
          ok: true,
          submissionId,
          message: "Submission already graded.",
        });
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
          grade: evaluation.grade,
          feedback: evaluation.feedback ?? null,
          matchingSignatureId: evaluation.matchingSignatureId ?? null,
          screenshotKey,
          screenshotUrl,
        },
      });

      return res.status(200).json({
        ok: true,
        submissionId,
        grade: evaluation.grade,
        matchedSignatureId: evaluation.matchingSignatureId ?? null,
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
