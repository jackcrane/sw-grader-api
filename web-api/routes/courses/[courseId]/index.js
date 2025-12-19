import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { normalizeLatePolicyInput } from "../../../services/latePolicy.js";
import { ValidationError } from "../../../util/errors.js";
import { posthog } from "../../../util/posthog.js";

const ensureTeacherEnrollment = async (courseId, userId) => {
  if (!courseId || !userId) return null;
  return prisma.enrollment.findFirst({
    where: {
      courseId,
      userId,
      deleted: false,
      type: "TEACHER",
      course: {
        deleted: false,
      },
    },
    include: {
      course: true,
    },
  });
};

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!enrollment) {
      return res
        .status(403)
        .json({ error: "Only teachers can update course settings." });
    }

    let normalizedPolicy = null;
    try {
      normalizedPolicy = normalizeLatePolicyInput(req.body?.latePolicy ?? {});
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const course = await prisma.course.findFirst({
      where: { id: courseId, deleted: false },
    });
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: {
        latePolicyAllowLateSubmissions:
          normalizedPolicy.allowLateSubmissions,
        latePolicyMaxLatenessMinutes:
          normalizedPolicy.maxLatenessMinutes,
        latePolicyPenaltyPercent: normalizedPolicy.penaltyPercent,
        latePolicyPenaltyType: normalizedPolicy.penaltyPercent
          ? normalizedPolicy.penaltyType
          : null,
      },
    });

    posthog.capture({
      distinctId: userId,
      event: "course late policy updated",
      properties: {
        courseId,
        allowLateSubmissions: normalizedPolicy.allowLateSubmissions,
        maxLatenessMinutes: normalizedPolicy.maxLatenessMinutes,
        penaltyPercent: normalizedPolicy.penaltyPercent,
        penaltyType: normalizedPolicy.penaltyPercent
          ? normalizedPolicy.penaltyType
          : null,
      },
    });

    return res.json({ course: updatedCourse });
  },
];
