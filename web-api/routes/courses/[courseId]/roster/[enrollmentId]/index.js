import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

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
  });
};

const readEnrollment = async (courseId, enrollmentId) => {
  if (!courseId || !enrollmentId) return null;

  return prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      courseId,
      deleted: false,
    },
    include: {
      user: true,
    },
  });
};

export const patch = [
  withAuth,
  async (req, res) => {
    const { courseId, enrollmentId } = req.params;
    const { type } = req.body ?? {};
    if (!courseId || !enrollmentId) {
      return res.status(400).json({ message: "Course and enrollment ids are required" });
    }

    if (!["STUDENT", "TA"].includes(type)) {
      return res.status(400).json({
        message: "Type must be either STUDENT or TA",
      });
    }

    const userId = req.user.localUserId ?? req.user.id;
    const actingEnrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!actingEnrollment) {
      return res.status(403).json({ message: "Only teachers can update roster members" });
    }

    const targetEnrollment = await readEnrollment(courseId, enrollmentId);
    if (!targetEnrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (targetEnrollment.type === "TEACHER") {
      return res.status(400).json({ message: "Teachers cannot be reassigned via this endpoint" });
    }

    const updatedEnrollment = await prisma.enrollment.update({
      where: {
        id: enrollmentId,
      },
      data: {
        type,
      },
      include: {
        user: true,
      },
    });

    return res.json({ enrollment: updatedEnrollment });
  },
];

export const del = [
  withAuth,
  async (req, res) => {
    const { courseId, enrollmentId } = req.params;
    if (!courseId || !enrollmentId) {
      return res.status(400).json({ message: "Course and enrollment ids are required" });
    }

    const userId = req.user.localUserId ?? req.user.id;
    const actingEnrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!actingEnrollment) {
      return res.status(403).json({ message: "Only teachers can remove roster members" });
    }

    const targetEnrollment = await readEnrollment(courseId, enrollmentId);
    if (!targetEnrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    if (targetEnrollment.type === "TEACHER") {
      return res.status(400).json({ message: "Teachers cannot be removed via this endpoint" });
    }

    await prisma.enrollment.update({
      where: {
        id: enrollmentId,
      },
      data: {
        deleted: true,
      },
    });

    return res.json({ success: true });
  },
];
