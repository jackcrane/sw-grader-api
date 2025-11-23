import { prisma } from "#prisma";

export const attachCanvasUserIdToUser = async (userId, canvasUserId) => {
  if (!userId || !canvasUserId) return;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        canvasUserId,
        canvasUserIdUpdatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `[Canvas LTI] Failed to attach Canvas user ${canvasUserId} to FeatureBench user ${userId}`,
      error
    );
  }
};
