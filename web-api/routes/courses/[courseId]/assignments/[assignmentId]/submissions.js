import multer from "multer";
import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

const ANALYZE_ENDPOINT = "https://jack-pc.jackcrane.rocks/analyze";

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
      endpoint.searchParams.set("screenshot", "false");

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

      const existingSubmission = await prisma.submission.findFirst({
        where: {
          userId,
          assignmentId,
          deleted: false,
        },
      });

      const submissionData = {
        volume: measuredVolume,
        surfaceArea: measuredSurfaceArea,
        grade,
      };

      const submission = existingSubmission
        ? await prisma.submission.update({
            where: { id: existingSubmission.id },
            data: submissionData,
          })
        : await prisma.submission.create({
            data: {
              ...submissionData,
              assignmentId,
              userId,
            },
          });

      return res.status(existingSubmission ? 200 : 201).json({
        submission,
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
