import { withAuth } from "#withAuth";
import { prisma } from "#prisma";

const readNotification = async (notificationId, userId) => {
  if (!notificationId || !userId) return null;
  return prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
      deleted: false,
    },
  });
};

export const del = [
  withAuth,
  async (req, res) => {
    const { notificationId } = req.params;
    if (!notificationId) {
      return res.status(400).json({ error: "missing_notification_id" });
    }

    const userId = req.user.localUserId ?? req.user.id;
    const notification = await readNotification(notificationId, userId);
    if (!notification) {
      return res.status(404).json({ error: "notification_not_found" });
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        deleted: true,
        readAt: notification.readAt ?? new Date(),
      },
    });

    return res.json({ success: true });
  },
];
