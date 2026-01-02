import { withAuth } from "#withAuth";
import { prisma } from "#prisma";
import { ensureTeacherEnrollment } from "../helpers.js";

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const allowNewEnrollmentsInput = req.body?.allowNewEnrollments;
    const userId = req.user.localUserId ?? req.user.id;

    if (
      allowNewEnrollmentsInput === undefined ||
      typeof allowNewEnrollmentsInput !== "boolean"
    ) {
      return res.status(400).json({
        error: "allow_new_enrollments_invalid",
        message: "The new student access value must be true or false.",
      });
    }

    const enrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!enrollment) {
      return res
        .status(403)
        .json({ error: "Only teachers can update course settings." });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: {
        allowNewEnrollments: allowNewEnrollmentsInput,
      },
    });

    return res.json({ course: updatedCourse });
  },
];
