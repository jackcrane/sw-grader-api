import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
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

const tryParseUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const sanitizeBaseUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed =
    tryParseUrl(trimmed) ||
    (!trimmed.includes("://") ? tryParseUrl(`https://${trimmed}`) : null);
  if (parsed) {
    return parsed.origin;
  }
  return trimmed.replace(/\/+$/, "");
};

const resolveFeatureBenchBaseUrl = (req) => {
  const candidates = [
    process.env.PUBLIC_APP_URL,
    process.env.APP_PUBLIC_URL,
    process.env.APP_URL,
    process.env.APP_BASE_URL,
  ];
  for (const candidate of candidates) {
    const sanitized = sanitizeBaseUrl(candidate);
    if (sanitized) return sanitized;
  }
  const protoHeader = req.headers["x-forwarded-proto"];
  const protocol =
    (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(
      ","
    )[0] ||
    req.protocol ||
    "https";
  const host = req.get("host") || "featurebench.com";
  return `${protocol}://${host}`.replace(/\/+$/, "");
};

const buildAssignmentUrl = (req, courseId, assignmentId) => {
  const base = resolveFeatureBenchBaseUrl(req);
  if (!courseId || !assignmentId) return base;
  return `${base}/${courseId}/assignments/${assignmentId}`;
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

    const assignmentUrl = buildAssignmentUrl(
      req,
      launch.assignment.courseId,
      launch.assignment.id
    );
    console.log(
      `[Canvas Launch API] User ${userId} consuming launch ${launchId}, redirecting to ${assignmentUrl}`
    );

    return res.json({
      assignmentUrl,
      assignmentId: launch.assignment.id,
      courseId: launch.assignment.courseId,
    });
  },
];
