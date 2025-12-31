import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  resolveSubmissionRetention,
  selectSubmissionForRetention,
} from "../../../../services/submissionRetention.js";

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

    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) {
      return res.status(404).json({ message: "Course not found." });
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
        courseId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        name: true,
        pointsPossible: true,
        dueDate: true,
        submissionRetentionMode: true,
        submissionRetentionInheritFromCourse: true,
      },
    });

    const retentionModes = new Map();
    assignments.forEach((assignment) => {
      const retention = resolveSubmissionRetention({
        course,
        assignment,
      });
      retentionModes.set(assignment.id, retention.mode);
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
            unpenalizedGrade: true,
            createdAt: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        })
      : [];

    const submissionsByUser = submissions.reduce((acc, submission) => {
      if (!submission?.assignmentId || !submission?.userId) return acc;
      const userMap = acc[submission.userId] ?? {};
      const mode =
        retentionModes.get(submission.assignmentId) ?? "BEST";
      userMap[submission.assignmentId] = selectSubmissionForRetention(
        userMap[submission.assignmentId],
        submission,
        mode
      );
      acc[submission.userId] = userMap;
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
