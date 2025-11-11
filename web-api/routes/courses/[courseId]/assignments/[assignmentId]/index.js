import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  ALLOWED_VISIBILITY,
  ValidationError,
  normalizeSignaturesPayload,
} from "../validation.js";
import {
  withSignedAssetUrls,
  withSignedAssetUrlsMany,
} from "../../../../../util/submissionAssets.js";

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

const getSubmissionStats = async (courseId, assignmentId, pointsPossible) => {
  const totalStudents = await prisma.enrollment.count({
    where: {
      courseId,
      deleted: false,
      type: "STUDENT",
    },
  });

  if (totalStudents === 0) {
    return {
      totalStudents: 0,
      submittedCount: 0,
      submittedPercent: 0,
      correctCount: 0,
      correctPercent: 0,
    };
  }

  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId,
      deleted: false,
      user: {
        enrollments: {
          some: {
            courseId,
            deleted: false,
          },
        },
      },
    },
    select: {
      id: true,
      grade: true,
      userId: true,
      updatedAt: true,
    },
  });

  const latestByUser = new Map();
  submissions
    .sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    })
    .forEach((submission) => {
      if (!latestByUser.has(submission.userId)) {
        latestByUser.set(submission.userId, submission);
      }
    });

  const latestSubmissions = Array.from(latestByUser.values());

  const submittedCount = latestSubmissions.length;
  const correctCount = latestSubmissions.filter((submission) => {
    const gradeValue = Number(submission.grade);
    if (!Number.isFinite(gradeValue)) return false;
    if (!Number.isFinite(pointsPossible) || pointsPossible <= 0) {
      return gradeValue > 0;
    }
    return gradeValue >= pointsPossible;
  }).length;

  const submittedPercent = (submittedCount / totalStudents) * 100;
  const correctPercent = (correctCount / totalStudents) * 100;

  return {
    totalStudents,
    submittedCount,
    submittedPercent,
    correctCount,
    correctPercent,
  };
};

export const get = [
  withAuth,
  async (req, res) => {
    const { courseId, assignmentId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    const assignment = await readAssignment(assignmentId);
    if (!assignment) {
      return res.status(404).json({ error: "Assignment not found." });
    }

    const userSubmissionsRaw =
      (await prisma.submission.findMany({
        where: {
          userId,
          assignmentId,
          deleted: false,
        },
        orderBy: {
          createdAt: "asc",
        },
      })) ?? [];
    const userSubmissions = await withSignedAssetUrlsMany(userSubmissionsRaw);

    const userSubmission =
      userSubmissions.length > 0
        ? userSubmissions[userSubmissions.length - 1]
        : null;

    const canViewStats = ["TEACHER", "TA"].includes(enrollment.type);
    const stats = canViewStats
      ? await getSubmissionStats(courseId, assignmentId, assignment.pointsPossible)
      : null;

    const teacherSubmissionsRaw = canViewStats
      ? await prisma.submission.findMany({
          where: {
            assignmentId,
            deleted: false,
            user: {
              enrollments: {
                some: {
                  courseId,
                  deleted: false,
                },
              },
            },
          },
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
            createdAt: "asc",
          },
        })
      : [];
    let teacherSubmissions = [];
    if (canViewStats) {
      const getSubmissionTimestamp = (submission) => {
        if (!submission) return 0;
        const dateValue = submission.updatedAt ?? submission.createdAt;
        const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
        return Number.isFinite(timestamp) ? timestamp : 0;
      };

      const submissionsByUser = new Map();
      teacherSubmissionsRaw.forEach((submission) => {
        const userIdKey = submission?.userId;
        if (!userIdKey) return;

        const existing = submissionsByUser.get(userIdKey);
        if (existing) {
          existing.attemptCount += 1;
          const existingTimestamp = getSubmissionTimestamp(existing.latest);
          const submissionTimestamp = getSubmissionTimestamp(submission);
          if (submissionTimestamp >= existingTimestamp) {
            existing.latest = submission;
          }
        } else {
          submissionsByUser.set(userIdKey, {
            latest: submission,
            attemptCount: 1,
          });
        }
      });

      const latestSubmissions = Array.from(submissionsByUser.values())
        .map((entry) => entry.latest)
        .filter(Boolean)
        .sort(
          (a, b) =>
            getSubmissionTimestamp(b) -
            getSubmissionTimestamp(a)
        );

      const signedSubmissions = await withSignedAssetUrlsMany(
        latestSubmissions
      );
      teacherSubmissions = signedSubmissions.map((submission) => ({
        ...submission,
        attemptCount:
          submissionsByUser.get(submission.userId)?.attemptCount ?? 0,
      }));
    }

    return res.json({
      assignment,
      stats,
      userSubmission,
      userSubmissions,
      teacherSubmissions,
    });
  },
];

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId, assignmentId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    if (!["TEACHER", "TA"].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only instructors can edit assignments." });
    }

    const existingAssignment = await readAssignment(assignmentId);
    if (!existingAssignment) {
      return res.status(404).json({ error: "Assignment not found." });
    }

    const {
      name,
      description,
      pointsPossible,
      gradeVisibility,
      tolerancePercent,
      dueDate,
      signatures,
    } = req.body ?? {};

    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Assignment name is required." });
    }

    if (!ALLOWED_VISIBILITY.has(gradeVisibility)) {
      return res.status(400).json({
        error: "gradeVisibility must be either INSTANT or ON_DUE_DATE.",
      });
    }

    const numericPoints = Number(pointsPossible);
    const numericTolerance = Number(tolerancePercent);
    const dueDateValue = dueDate ? new Date(dueDate) : null;

    if (
      !Number.isFinite(numericPoints) ||
      !Number.isFinite(numericTolerance) ||
      numericPoints <= 0 ||
      numericTolerance <= 0
    ) {
      return res.status(400).json({
        error: "Points and tolerance must be positive numbers.",
      });
    }

    if (!dueDateValue || Number.isNaN(dueDateValue.getTime())) {
      return res.status(400).json({ error: "A valid due date is required." });
    }

    let normalizedSignatures = [];
    try {
      normalizedSignatures = normalizeSignaturesPayload(
        signatures,
        numericPoints
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const firstCorrectSignature = normalizedSignatures.find(
      (signature) => signature.type === "CORRECT"
    );
    if (!firstCorrectSignature) {
      return res
        .status(400)
        .json({ error: "At least one correct signature is required." });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.assignment.update({
          where: { id: assignmentId },
          data: {
            name: trimmedName,
            description: description?.trim() || null,
            unitSystem: firstCorrectSignature.unitSystem,
            pointsPossible: numericPoints,
            gradeVisibility,
            volume: firstCorrectSignature.volume,
            surfaceArea: firstCorrectSignature.surfaceArea,
            tolerancePercent: numericTolerance,
            dueDate: dueDateValue,
          },
        });

        const existingSignatures = await tx.assignmentSignature.findMany({
          where: {
            assignmentId,
            deleted: false,
          },
        });

        const existingMap = new Map(
          existingSignatures.map((signature) => [signature.id, signature])
        );

        const invalidSignature = normalizedSignatures.find(
          (signature) => signature.id && !existingMap.has(signature.id)
        );
        if (invalidSignature) {
          throw new ValidationError("Invalid signature reference provided.");
        }

        const incomingIds = new Set(
          normalizedSignatures
            .map((signature) => signature.id)
            .filter((id) => Boolean(id))
        );

        const removalTargets = existingSignatures.filter(
          (signature) => !incomingIds.has(signature.id)
        );

        if (removalTargets.length > 0) {
          await Promise.all(
            removalTargets.map((signature, index) =>
              tx.assignmentSignature.update({
                where: { id: signature.id },
                data: {
                  deleted: true,
                  sortOrder: normalizedSignatures.length + index + 1,
                },
              })
            )
          );
        }

        for (const [index, signature] of normalizedSignatures.entries()) {
          const sortOrder = index + 1;
          const signatureData = {
            sortOrder,
            type: signature.type,
            unitSystem: signature.unitSystem,
            volume: signature.volume,
            surfaceArea: signature.surfaceArea,
            centerOfMassX: signature.centerOfMassX,
            centerOfMassY: signature.centerOfMassY,
            centerOfMassZ: signature.centerOfMassZ,
            screenshotB64: signature.screenshotB64,
            feedback: signature.feedback,
            pointsAwarded: signature.pointsAwarded,
            deleted: false,
          };

          if (signature.id && existingMap.has(signature.id)) {
            await tx.assignmentSignature.update({
              where: { id: signature.id },
              data: signatureData,
            });
          } else {
            await tx.assignmentSignature.create({
              data: {
                ...signatureData,
                assignmentId,
              },
            });
          }
        }
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const updatedAssignment = await readAssignment(assignmentId);
    return res.json(updatedAssignment);
  },
];

export const del = [
  withAuth,
  async (req, res) => {
    const { courseId, assignmentId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    if (!["TEACHER", "TA"].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only instructors can delete assignments." });
    }

    const existingAssignment = await readAssignment(assignmentId);
    if (!existingAssignment) {
      return res.status(404).json({ error: "Assignment not found." });
    }

    await prisma.$transaction(async (tx) => {
      await tx.assignment.update({
        where: { id: assignmentId },
        data: { deleted: true },
      });

      await tx.assignmentSignature.updateMany({
        where: { assignmentId },
        data: { deleted: true },
      });
    });

    return res.json({ success: true });
  },
];
