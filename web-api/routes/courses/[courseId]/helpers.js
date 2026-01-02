import { prisma } from "#prisma";

export const ensureTeacherEnrollment = async (courseId, userId) => {
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
