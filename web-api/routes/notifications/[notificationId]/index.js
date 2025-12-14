import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { posthog } from "../../../../util/posthog.js";

export const del = [
  withAuth,
  async (req, res) => {
    const { notificationId } = req.params;
    const userId = req.user?.localUserId ?? req.user?.id;

    if (!notificationId || !userId) {
      return res.status(400).json({ error: "invalid_request" });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
        deleted: false,
      },
    });

    if (!notification) {
      return res.status(404).json({ error: "not_found" });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deleted: true,
        readAt: notification.readAt ?? new Date(),
      },
    });

    if (notification.type === "SIGNATURE_TREND") {
      posthog.capture({
        distinctId: userId,
        event: "signature trend dismissed",
        properties: {
          notificationId,
          assignmentId: notification.data?.assignmentId ?? null,
          courseId: notification.data?.courseId ?? null,
          trendKey: notification.data?.trendKey ?? null,
        },
      });
    }

    res.json({ ok: true });
  },
];
