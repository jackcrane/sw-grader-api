import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

export const get = [
  withAuth,
  async (req, res) => {
    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId: req.user.id,
        deleted: false,
        course: {
          deleted: false,
        },
      },
    });

    return res.json(enrollments);
  },
];
