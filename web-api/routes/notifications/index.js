import { withAuth } from "#withAuth";
import { prisma } from "#prisma";

const serializeNotification = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  content: notification.content,
  data: notification.data ?? {},
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

export const get = [
  withAuth,
  async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.id,
        deleted: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    res.json({
      notifications: notifications.map(serializeNotification),
    });
  },
];
