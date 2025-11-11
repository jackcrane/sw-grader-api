import crypto from "node:crypto";
import multer from "multer";
import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { uploadObject } from "../../../../../util/s3.js";
import {
  withSignedAssetUrls,
  withSignedAssetUrlsMany,
} from "../../../../../util/submissionAssets.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

const ANALYZE_ENDPOINT = "https://jack-pc.jackcrane.rocks/analyze";
const SUBMISSION_ASSET_PREFIX = "submissions";

const sanitizeKeySegment = (value, fallback = "item") => {
  if (!value) return fallback;
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || fallback;
};

const getExtension = (filename, fallback = "") => {
  if (!filename || typeof filename !== "string") return fallback;
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return fallback;
  }
  return filename.slice(lastDot).toLowerCase();
};

const buildSubmissionAssetKey = ({
  courseId,
  assignmentId,
  userId,
  type,
  extension,
}) => {
  const safeExtension = extension?.startsWith(".")
    ? extension.toLowerCase()
    : extension
    ? `.${extension.toLowerCase()}`
    : "";
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return [
    SUBMISSION_ASSET_PREFIX,
    sanitizeKeySegment(courseId, "course"),
    sanitizeKeySegment(assignmentId, "assignment"),
    sanitizeKeySegment(userId, "user"),
    `${type}-${unique}${safeExtension}`,
  ]
    .filter(Boolean)
    .join("/");
};

const bufferFromBase64 = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const payload = trimmed.includes(",")
    ? trimmed.substring(trimmed.indexOf(",") + 1)
    : trimmed;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
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
  });
};

const computePercentDiff = (expected, actual) => {
  if (!Number.isFinite(expected) || expected === 0) {
    return Number.isFinite(actual) ? 0 : Infinity;
  }
  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
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
      const endpoint = new URL(ANALYZE_ENDPOINT);
      endpoint.searchParams.set("unitSystem", assignment.unitSystem);
      endpoint.searchParams.set("screenshot", "true");

      const formData = new FormData();
      const blob = new Blob([file.buffer], {
        type: file.mimetype || "application/octet-stream",
      });
      formData.append("file", blob, file.originalname);

      const upstreamResponse = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      if (!upstreamResponse.ok) {
        const fallback = await upstreamResponse.text();
        return res.status(upstreamResponse.status).json({
          error: fallback || "Unable to grade submission.",
        });
      }

      const result = await upstreamResponse.json();
      const measuredVolume = Number(result?.volume);
      const measuredSurfaceArea = Number(result?.surfaceArea);
      const screenshotB64 = result?.screenshot ?? result?.screenshotB64 ?? "";

      if (
        !Number.isFinite(measuredVolume) ||
        !Number.isFinite(measuredSurfaceArea)
      ) {
        return res.status(502).json({
          error: "Analyzer response missing volume or surface area.",
        });
      }

      const volumeDiff = computePercentDiff(
        assignment.volume,
        measuredVolume
      );
      const surfaceDiff = computePercentDiff(
        assignment.surfaceArea,
        measuredSurfaceArea
      );
      const tolerance = Number(assignment.tolerancePercent) || 0;

      const withinTolerance =
        volumeDiff <= tolerance && surfaceDiff <= tolerance;
      const grade = withinTolerance ? assignment.pointsPossible : 0;

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

      let screenshotUpload = null;
      const screenshotBuffer = bufferFromBase64(screenshotB64);
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

      const submissionData = {
        volume: measuredVolume,
        surfaceArea: measuredSurfaceArea,
        grade,
        fileKey: fileUpload?.key,
        fileUrl: fileUpload?.url,
        fileName: file.originalname ?? null,
        screenshotKey: screenshotUpload?.key ?? null,
        screenshotUrl: screenshotUpload?.url ?? null,
      };

      const submission = await prisma.submission.create({
        data: {
          ...submissionData,
          assignmentId,
          userId,
        },
      });

      const submissionWithSignedUrls = await withSignedAssetUrls(submission);

      return res.status(201).json({
        submission: submissionWithSignedUrls,
        analysis: {
          volume: measuredVolume,
          surfaceArea: measuredSurfaceArea,
          volumeDiffPercent: volumeDiff,
          surfaceDiffPercent: surfaceDiff,
          withinTolerance,
        },
      });
    } catch (error) {
      console.error("Submission grading failed", error);
      return res
        .status(502)
        .json({ error: "Unable to analyze the uploaded part." });
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
