import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

export const get = [
  withAuth,
  async (req, res) => {
    const userId = req.user.localUserId ?? req.user.id;
    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId,
        deleted: false,
        course: {
          deleted: false,
        },
      },
      include: {
        course: true,
      },
    });

    return res.json(enrollments);
  },
];

export const post = [
  withAuth,
  async (req, res) => {
    if (!req.user?.canCreateCourses) {
      return res
        .status(403)
        .json({ message: "Not authorized to create courses" });
    }

    const userId = req.user.localUserId;
    if (!userId) {
      return res
        .status(400)
        .json({ message: "No local user found for enrollment creation" });
    }

    const { name, abbr } = req.body ?? {};
    if (!name || !abbr) {
      return res
        .status(400)
        .json({ message: "Course name and abbreviation are required" });
    }

    const trimmedName = name.trim();
    const trimmedAbbr = abbr.trim();
    if (!trimmedName || !trimmedAbbr) {
      return res
        .status(400)
        .json({ message: "Course name and abbreviation cannot be empty" });
    }

    const course = await prisma.course.create({
      data: {
        name: trimmedName,
        abbr: trimmedAbbr,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        userId,
        courseId: course.id,
        type: "TEACHER",
      },
    });

    return res.status(201).json(enrollment);
  },
];
