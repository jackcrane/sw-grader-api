import multer from "multer";
import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { uploadObject } from "../../../../../util/s3.js";
import {
  withSignedAssetUrls,
  withSignedAssetUrlsMany,
} from "../../../../../util/submissionAssets.js";
import {
  buildSubmissionAssetKey,
  getExtension,
} from "../../../../../services/submissionUtils.js";
import { enqueueSubmissionJob } from "../../../../../services/graderQueue.js";
import { computeSubmissionQueuePosition } from "../../../../../services/submissionQueuePosition.js";

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

const buildQueueMessage = (queue) => {
  if (!queue) {
    return "Submission received. Auto-grading will run when resources are available.";
  }
  const ahead = Number(queue.aheadCount) || 0;
  if (ahead <= 0) {
    return "Submission received. You're next in the grading queue.";
  }
  const plural = ahead === 1 ? "submission" : "submissions";
  return `Submission received. ${ahead} ${plural} ${
    ahead === 1 ? "is" : "are"
  } ahead of you in the queue.`;
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

      const submission = await prisma.submission.create({
        data: {
          fileKey: fileUpload?.key,
          fileUrl: fileUpload?.url,
          fileName: file.originalname ?? null,
          assignmentId,
          userId,
        },
      });

      const submissionWithSignedUrls = await withSignedAssetUrls(submission);
      const autoGradingPending = true;

      let queueInfo = null;
      try {
        queueInfo = await enqueueSubmissionJob({
          submissionId: submission.id,
        });
      } catch (error) {
        console.error("Failed to enqueue submission for grading", error);
      }

      const queuePosition = await computeSubmissionQueuePosition({
        submissionId: submission.id,
        createdAt: submission.createdAt,
        grade: submission.grade,
      });

      const queue = {
        aheadCount:
          queuePosition?.aheadCount ??
          queueInfo?.aheadCount ??
          0,
        position:
          queuePosition?.position ??
          queueInfo?.position ??
          1,
        queueSize:
          queuePosition?.queueSize ??
          queueInfo?.queueDepth ??
          null,
      };

      return res.status(201).json({
        submission: {
          ...submissionWithSignedUrls,
          autoGradingPending,
        },
        queue,
        analysis: null,
        message: buildQueueMessage(queue),
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
