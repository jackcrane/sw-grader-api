import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  findCourseByInviteCode,
  generateCourseInviteCodes,
  normalizeInviteCode,
} from "../../util/inviteCodes.js";

const normalizeBillingScheme = (value) => {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "PER_COURSE" || normalized === "PER_STUDENT") {
    return normalized;
  }

  if (value === "pay-per-course") {
    return "PER_COURSE";
  }

  if (value === "pay-per-student") {
    return "PER_STUDENT";
  }

  return null;
};

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
    const normalizedBillingScheme = normalizeBillingScheme(
      req.body?.billingScheme
    );
    if (!name || !abbr) {
      return res
        .status(400)
        .json({ message: "Course name and abbreviation are required" });
    }

    if (!normalizedBillingScheme) {
      return res
        .status(400)
        .json({ message: "A valid billing scheme is required" });
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
        billingScheme: normalizedBillingScheme,
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
