import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

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

    res.json({ ok: true });
  },
];
