import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

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

    const userSubmissions =
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

    const userSubmission =
      userSubmissions.length > 0
        ? userSubmissions[userSubmissions.length - 1]
        : null;

    const canViewStats = ["TEACHER", "TA"].includes(enrollment.type);
    const stats = canViewStats
      ? await getSubmissionStats(courseId, assignmentId, assignment.pointsPossible)
      : null;

    return res.json({
      assignment,
      stats,
      userSubmission,
      userSubmissions,
    });
  },
];
