import multer from "multer";
import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { uploadObject } from "../../../../../util/s3.js";
import {
  withSignedAssetUrls,
  withSignedAssetUrlsMany,
} from "../../../../../util/submissionAssets.js";
import { analyzePart } from "../../../../../services/analyzerClient.js";
import {
  buildSubmissionAssetKey,
  bufferFromBase64,
  computePercentDiff,
  evaluateSubmissionAgainstSignatures,
  getExtension,
} from "../../../../../services/submissionUtils.js";
import { isGraderOnline } from "../../../../../services/graderHealth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

const signaturesInclude = {
  signatures: {
    where: {
      deleted: false,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
};

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

const readAssignment = async (assignmentId) => {
  if (!assignmentId) return null;
  return prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      deleted: false,
    },
    include: signaturesInclude,
  });
};

export const post = [
  withAuth,
  upload.single("file"),
  async (req, res) => {
    const { courseId, assignmentId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;
    const { file } = req;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    if (enrollment.type !== "STUDENT") {
      return res
        .status(403)
        .json({ error: "Only students can submit assignments." });
    }

    const assignment = await readAssignment(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found." });
    }

    if (!file) {
      return res.status(400).json({ error: "Missing part file upload." });
    }

    if (!file.originalname?.toLowerCase?.().endsWith(".sldprt")) {
      return res
        .status(400)
        .json({ error: "Only .sldprt files can be submitted." });
    }

    try {
      const fileUpload = await uploadObject({
        key: buildSubmissionAssetKey({
          courseId,
          assignmentId,
          userId,
          type: "part",
          extension: getExtension(file.originalname, ".sldprt"),
        }),
        body: file.buffer,
        contentType: file.mimetype || "application/octet-stream",
      });

      let measuredVolume = null;
      let measuredSurfaceArea = null;
      let evaluation = null;
      let screenshotUpload = null;
      let deferred = false;

      if (isGraderOnline()) {
        try {
          const analysis = await analyzePart({
            fileBuffer: file.buffer,
            filename: file.originalname || "submission.sldprt",
            mimeType: file.mimetype || "application/octet-stream",
            unitSystem: assignment.unitSystem,
          });

          measuredVolume = Number(analysis?.volume);
          measuredSurfaceArea = Number(analysis?.surfaceArea);

          if (
            Number.isFinite(measuredVolume) &&
            Number.isFinite(measuredSurfaceArea)
          ) {
            const tolerance = Number(assignment.tolerancePercent) || 0;
            evaluation = evaluateSubmissionAgainstSignatures({
              assignment,
              measuredVolume,
              measuredSurfaceArea,
              tolerance,
            });

            const screenshotBuffer = bufferFromBase64(
              analysis?.screenshot ?? analysis?.screenshotB64 ?? ""
            );
            if (screenshotBuffer) {
              screenshotUpload = await uploadObject({
                key: buildSubmissionAssetKey({
                  courseId,
                  assignmentId,
                  userId,
                  type: "screenshot",
                  extension: ".png",
                }),
                body: screenshotBuffer,
                contentType: "image/png",
              });
            }
          } else {
            deferred = true;
          }
        } catch (error) {
          console.error("Immediate grading failed", error);
          deferred = true;
        }
      } else {
        deferred = true;
      }

      const submission = await prisma.submission.create({
        data: {
          volume: evaluation ? measuredVolume : null,
          surfaceArea: evaluation ? measuredSurfaceArea : null,
          grade: evaluation?.grade ?? null,
          feedback: evaluation?.feedback ?? null,
          matchingSignatureId: evaluation?.matchingSignatureId ?? null,
          fileKey: fileUpload?.key,
          fileUrl: fileUpload?.url,
          fileName: file.originalname ?? null,
          screenshotKey: screenshotUpload?.key ?? null,
          screenshotUrl: screenshotUpload?.url ?? null,
          assignmentId,
          userId,
        },
      });

      const submissionWithSignedUrls = await withSignedAssetUrls(submission);
      const autoGradingPending = !evaluation;

      return res.status(201).json({
        submission: {
          ...submissionWithSignedUrls,
          autoGradingPending,
        },
        analysis: evaluation
          ? {
              volume: measuredVolume,
              surfaceArea: measuredSurfaceArea,
              volumeDiffPercent:
                evaluation.diffs?.volumeDiff ??
                computePercentDiff(assignment.volume, measuredVolume),
              surfaceDiffPercent:
                evaluation.diffs?.surfaceDiff ??
                computePercentDiff(
                  assignment.surfaceArea,
                  measuredSurfaceArea
                ),
              withinTolerance: evaluation.diffs?.withinTolerance ?? false,
              matchedSignatureId: evaluation.matchingSignatureId ?? null,
              matchedSignatureType: evaluation.matchedType ?? null,
              feedback: evaluation.feedback ?? null,
            }
          : null,
        message:
          deferred || autoGradingPending
            ? "Submission received. Auto-grading will run when the grader is online."
            : undefined,
        autoGradingPending,
      });
    } catch (error) {
      console.error("Submission grading failed", error);
      return res
        .status(500)
        .json({ error: "Unable to store the submitted assignment." });
    }
  },
];

export const get = [
  withAuth,
  async (req, res) => {
    const { courseId, assignmentId } = req.params;
    const targetUserId = req.query?.userId;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    if (!["TEACHER", "TA"].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only staff can view submitted assignments." });
    }

    if (!assignmentId) {
      return res.status(400).json({ error: "Assignment id is required." });
    }

    const where = {
      assignmentId,
      deleted: false,
    };
    if (targetUserId) {
      where.userId = targetUserId;
    }

    const submissionsRaw = await prisma.submission.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    const submissions = await withSignedAssetUrlsMany(submissionsRaw);

    return res.status(200).json({ submissions });
  },
];
