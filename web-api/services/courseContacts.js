import { prisma } from "#prisma";

export const getActiveTaEnrollment = async ({ courseId, userId }) => {
  if (!courseId || !userId) {
    return null;
  }
  return prisma.enrollment.findFirst({
    where: {
      courseId,
      userId,
      type: "TA",
      deleted: false,
      course: {
        deleted: false,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
};

export const getActiveTaUserForCourse = async ({ courseId, userId }) => {
  const enrollment = await getActiveTaEnrollment({ courseId, userId });
  return enrollment?.user ?? null;
};
