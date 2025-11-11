import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  findCourseByInviteCode,
  generateCourseInviteCodes,
  normalizeInviteCode,
} from "../../util/inviteCodes.js";

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
    const { inviteCode } = req.body ?? {};
    if (!req.user?.canCreateCourses) {
      if (!inviteCode) {
        return res
          .status(403)
          .json({ message: "Not authorized to create courses" });
      }
    }

    const userId = req.user.localUserId;
    if (!userId) {
      return res
        .status(400)
        .json({ message: "No local user found for enrollment creation" });
    }

    if (inviteCode) {
      const normalizedCode = normalizeInviteCode(inviteCode);
      if (!normalizedCode) {
        return res.status(400).json({ message: "Invite code is required" });
      }

      const courseAndType = await findCourseByInviteCode(normalizedCode);
      if (!courseAndType) {
        return res.status(404).json({ message: "Invalid invite code" });
      }

      const existingEnrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          courseId: courseAndType.course.id,
          deleted: false,
        },
        include: {
          course: true,
        },
      });

      if (existingEnrollment) {
        return res.json(existingEnrollment);
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId: courseAndType.course.id,
          type: courseAndType.enrollmentType,
        },
        include: {
          course: true,
        },
      });

      return res.status(201).json(enrollment);
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

    const { studentInviteCode, taInviteCode } =
      await generateCourseInviteCodes();

    const course = await prisma.course.create({
      data: {
        name: trimmedName,
        abbr: trimmedAbbr,
        studentInviteCode,
        taInviteCode,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        userId,
        courseId: course.id,
        type: "TEACHER",
      },
      include: {
        course: true,
      },
    });

    return res.status(201).json(enrollment);
  },
];
