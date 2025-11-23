import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { buildFeatureBenchAssignmentUrl } from "../../../../services/canvasClient.js";
import { attachCanvasUserIdToUser } from "../helpers.js";

const getLaunchByToken = async (token) => {
  if (!token) return null;
  return prisma.canvasAssignmentLaunch.findFirst({
    where: { token },
    include: {
      assignment: {
        select: { id: true, courseId: true },
      },
    },
  });
};

export const get = [
  withAuth,
  async (req, res) => {
    const { launchId } = req.params;
    if (!launchId) {
      return res.status(400).json({
        error: "missing_launch",
        message: "A Canvas launch token is required.",
      });
    }

    const launch = await getLaunchByToken(launchId);
    if (!launch) {
      return res.status(404).json({
        error: "launch_not_found",
        message: "That Canvas launch is no longer available.",
      });
    }

    if (launch.expiresAt && launch.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({
        error: "launch_expired",
        message: "This Canvas launch link has expired. Open the assignment in Canvas again.",
      });
    }

    if (!launch.assignment?.courseId) {
      return res.status(400).json({
        error: "assignment_missing",
        message: "FeatureBench could not determine which assignment to open.",
      });
    }

    const userId = req.user.localUserId ?? req.user.id;
    await prisma.canvasAssignmentLaunch.update({
      where: { id: launch.id },
      data: {
        userId,
        consumedAt: new Date(),
        token: null,
      },
    });

    if (launch.canvasUserId) {
      await attachCanvasUserIdToUser(userId, launch.canvasUserId);
    }

    const assignmentUrl = buildFeatureBenchAssignmentUrl(
      launch.assignment.courseId,
      launch.assignment.id
    );

    return res.json({
      assignmentUrl,
      assignmentId: launch.assignment.id,
      courseId: launch.assignment.courseId,
    });
  },
];
