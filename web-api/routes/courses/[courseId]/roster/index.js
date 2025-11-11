import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

const STAFF_TYPES = ["TEACHER", "TA"];

const ensureStaffEnrollment = async (courseId, userId) => {
  if (!courseId || !userId) return null;
  return prisma.enrollment.findFirst({
    where: {
      courseId,
      userId,
      deleted: false,
      type: {
        in: STAFF_TYPES,
      },
      course: {
        deleted: false,
      },
    },
  });
};

const buildUserSummary = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
};

export const get = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    if (!courseId) {
      return res.status(400).json({ message: "Course id is required" });
    }

    const userId = req.user.localUserId ?? req.user.id;
    const enrollment = await ensureStaffEnrollment(courseId, userId);
    if (!enrollment) {
      return res.status(403).json({ message: "Not authorized for this roster" });
    }

    const courseEnrollments = await prisma.enrollment.findMany({
      where: {
        courseId,
        deleted: false,
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const assignments = await prisma.assignment.findMany({
      where: {
        deleted: false,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        pointsPossible: true,
        dueDate: true,
      },
    });

    const assignmentIds = new Set(assignments.map((assignment) => assignment.id));

    const userIds = courseEnrollments.map((enrollmentItem) => enrollmentItem.userId);
    const submissions = userIds.length
      ? await prisma.submission.findMany({
          where: {
            userId: {
              in: userIds,
            },
            deleted: false,
            assignmentId: {
              in: Array.from(assignmentIds),
            },
          },
          select: {
            id: true,
            grade: true,
            userId: true,
            assignmentId: true,
            updatedAt: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        })
      : [];

    const submissionsByUser = submissions.reduce((acc, submission) => {
      if (!acc[submission.userId]) {
        acc[submission.userId] = {};
      }
      const existing = acc[submission.userId][submission.assignmentId];
      const existingDate = existing ? new Date(existing.updatedAt).getTime() : -Infinity;
      const submissionDate = submission.updatedAt
        ? new Date(submission.updatedAt).getTime()
        : -Infinity;
      if (!existing || submissionDate > existingDate) {
        acc[submission.userId][submission.assignmentId] = {
          id: submission.id,
          grade: submission.grade,
          assignmentId: submission.assignmentId,
          updatedAt: submission.updatedAt,
        };
      }
      return acc;
    }, {});

    const roster = courseEnrollments.map((entry) => ({
      id: entry.id,
      type: entry.type,
      user: buildUserSummary(entry.user),
      submissions: Object.values(submissionsByUser[entry.userId] ?? {}),
    }));

    return res.json({
      assignments,
      roster,
    });
  },
];
