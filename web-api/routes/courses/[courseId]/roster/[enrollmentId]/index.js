import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { posthog } from "../../../../../util/posthog.js";

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

const cloneCourseNotifications = async ({
  courseId,
  fromUserId,
  toUserId,
}) => {
  if (
    !courseId ||
    !fromUserId ||
    !toUserId ||
    fromUserId === toUserId
  ) {
    return;
  }
  const notifications = await prisma.notification.findMany({
    where: {
      userId: fromUserId,
      deleted: false,
      readAt: null,
      data: {
        path: ["courseId"],
        equals: courseId,
      },
    },
  });
  if (!notifications.length) {
    return;
  }
  await Promise.all(
    notifications.map((notification) =>
      prisma.notification.create({
        data: {
          userId: toUserId,
          type: notification.type,
          title: notification.title,
          content: notification.content,
          data: notification.data,
        },
      })
    )
  );
};

const clearPaymentNotificationsForEnrollment = async ({
  courseId,
  studentId,
}) => {
  if (!courseId || !studentId) return;
  const now = new Date();
  await prisma.notification.updateMany({
    where: {
      deleted: false,
      type: "PAYMENT_ISSUE",
      AND: [
        {
          data: {
            path: ["courseId"],
            equals: courseId,
          },
        },
        {
          data: {
            path: ["studentId"],
            equals: studentId,
          },
        },
      ],
    },
    data: {
      deleted: true,
      readAt: now,
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

    const allowedTypes = ["STUDENT", "TA", "TEACHER"];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        message: `Type must be one of ${allowedTypes.join(", ")}`,
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

    if (targetEnrollment.type === "TEACHER" && type !== "TA") {
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

    if (targetEnrollment.type !== "TEACHER" && type === "TEACHER") {
      try {
        await cloneCourseNotifications({
          courseId,
          fromUserId: userId,
          toUserId: targetEnrollment.userId,
        });
      } catch (cloneError) {
        console.warn(
          "Failed to clone notifications to new admin",
          cloneError,
          { courseId, targetUserId: targetEnrollment.userId }
        );
      }
    }

    posthog.capture({
      distinctId: userId,
      event: "enrollment role updated",
      properties: {
        courseId,
        enrollmentId,
        targetUserId: targetEnrollment.userId,
        previousType: targetEnrollment.type,
        nextType: type,
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
        billingFollowUpResolvedAt: new Date(),
      },
    });
    await clearPaymentNotificationsForEnrollment({
      courseId,
      studentId: targetEnrollment.userId,
    });

    posthog.capture({
      distinctId: userId,
      event: "enrollment removed",
      properties: {
        courseId,
        enrollmentId,
        targetUserId: targetEnrollment.userId,
        reason: "manual",
      },
    });

    return res.json({ success: true });
  },
];
