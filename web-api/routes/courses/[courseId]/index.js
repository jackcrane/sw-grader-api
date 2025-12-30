import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { normalizeLatePolicyInput } from "../../../services/latePolicy.js";
import { ValidationError } from "../../../util/errors.js";
import { posthog } from "../../../util/posthog.js";
import { rescoreSubmissionsAgainstSignatures } from "../../../services/signatureTrends.js";

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

    const latePolicyInput =
      req.body && typeof req.body.latePolicy === "object"
        ? req.body.latePolicy
        : null;

    let normalizedPolicy = null;

    try {
      if (latePolicyInput) {
        normalizedPolicy = normalizeLatePolicyInput(latePolicyInput);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
    const allowNewEnrollmentsInput = req.body?.allowNewEnrollments;
    if (
      allowNewEnrollmentsInput !== undefined &&
      typeof allowNewEnrollmentsInput !== "boolean"
    ) {
      return res.status(400).json({
        error: "allow_new_enrollments_invalid",
        message: "The new student access value must be true or false.",
      });
    }

    const course = await prisma.course.findFirst({
      where: { id: courseId, deleted: false },
    });
    if (!course) {
      return res.status(404).json({ error: "Course not found." });
    }

    const updateData = {};
    if (normalizedPolicy) {
      updateData.latePolicyAllowLateSubmissions =
        normalizedPolicy.allowLateSubmissions;
      updateData.latePolicyMaxLatenessMinutes =
        normalizedPolicy.maxLatenessMinutes;
      updateData.latePolicyPenaltyPercent = normalizedPolicy.penaltyPercent;
      updateData.latePolicyPenaltyType = normalizedPolicy.penaltyPercent
        ? normalizedPolicy.penaltyType
        : null;
    }

    if (!Object.keys(updateData).length) {
      return res
        .status(400)
        .json({ error: "No updates were provided for this course." });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: updateData,
    });

    if (normalizedPolicy) {
      const inheritingAssignments = await prisma.assignment.findMany({
        where: {
          deleted: false,
          courseId,
          latePolicyInheritFromCourse: true,
        },
        select: {
          id: true,
        },
      });

      Promise.resolve()
        .then(() =>
          Promise.allSettled(
            inheritingAssignments.map(({ id }) =>
              rescoreSubmissionsAgainstSignatures({
                assignmentId: id,
                courseId,
              }).catch((err) => {
                console.warn(
                  `Failed to rescore assignment ${id} after course policy update`,
                  err
                );
              })
            )
          )
        )
        .catch((error) => {
          console.warn(
            `Failed to schedule rescoring for course ${courseId}`,
            error
          );
        });

    posthog.capture({
      distinctId: userId,
      event: "course settings updated",
      properties: {
        courseId,
        allowLateSubmissions: normalizedPolicy.allowLateSubmissions,
        maxLatenessMinutes: normalizedPolicy.maxLatenessMinutes,
        penaltyPercent: normalizedPolicy.penaltyPercent,
        penaltyType: normalizedPolicy.penaltyPercent
          ? normalizedPolicy.penaltyType
          : null,
        allowNewEnrollments: updatedCourse.allowNewEnrollments,
      },
    });

    return res.json({ course: updatedCourse });
  },
];
