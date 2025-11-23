import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  attachCanvasUserIdToEnrollment,
  resolveCanvasRoleCategory,
  resolveFeatureBenchRoleCategory,
  shouldForceReauthentication,
  notifyTeachersOfPersistentEntitlementMismatch,
  findEntitlementMismatchRecord,
  upsertEntitlementMismatchRecord,
  markEntitlementMismatchNotified,
  clearEntitlementMismatchRecord,
} from "../helpers.js";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../../../util/auth.js";

const getLaunchByToken = async (token) => {
  if (!token) return null;
  return prisma.canvasAssignmentLaunch.findFirst({
    where: { token },
    include: {
      assignment: {
        select: {
          id: true,
          courseId: true,
          name: true,
          course: {
            select: {
              name: true,
            },
          },
        },
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
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId,
        courseId: launch.assignment.courseId,
        deleted: false,
      },
      select: {
        type: true,
        canvasUserId: true,
      },
    });
    const featureBenchRoleCategory = resolveFeatureBenchRoleCategory(
      enrollment?.type
    );
    const canvasRoleCategory =
      launch.canvasRoleCategory ||
      resolveCanvasRoleCategory({
        roles: launch.canvasRoles || undefined,
        ext_roles: launch.canvasExtRoles || undefined,
      });
    const storedCanvasUserId =
      typeof enrollment?.canvasUserId === "string" &&
      enrollment.canvasUserId.trim()
        ? enrollment.canvasUserId.trim()
        : null;
    const launchCanvasUserId =
      typeof launch.canvasUserId === "string" && launch.canvasUserId.trim()
        ? launch.canvasUserId.trim()
        : null;
    const canvasUserMismatch =
      Boolean(storedCanvasUserId) &&
      Boolean(launchCanvasUserId) &&
      storedCanvasUserId !== launchCanvasUserId;
    const roleCategoryMismatch = shouldForceReauthentication(
      canvasRoleCategory,
      featureBenchRoleCategory
    );
    const mismatchReasons = [];
    if (!enrollment) {
      mismatchReasons.push("missing_enrollment");
    } else if (roleCategoryMismatch) {
      mismatchReasons.push("role_mismatch");
    }
    if (canvasUserMismatch) {
      mismatchReasons.push("canvas_user_mismatch");
    }
    console.log("[Canvas Launch API] Canvas/FeatureBench role comparison", {
      userId,
      assignmentId: launch.assignment.id,
      courseId: launch.assignment.courseId,
      enrollmentType: enrollment?.type ?? null,
      canvasRoles: launch.canvasRoles ?? null,
      canvasExtRoles: launch.canvasExtRoles ?? null,
      canvasRoleCategory,
      featureBenchRoleCategory,
      launchCanvasUserId,
      storedCanvasUserId,
      mismatchReasons,
    });
    if (mismatchReasons.length) {
      const isMissingEnrollmentOnly =
        mismatchReasons.length === 1 &&
        mismatchReasons[0] === "missing_enrollment";
      if (!isMissingEnrollmentOnly) {
        const existingMismatchRecord = await findEntitlementMismatchRecord({
          assignmentId: launch.assignment.id,
          userId,
        });
        await upsertEntitlementMismatchRecord({
          assignmentId: launch.assignment.id,
          courseId: launch.assignment.courseId,
          userId,
          reasons: mismatchReasons,
          context: {
            launchCanvasUserId,
            storedCanvasUserId,
            canvasRoleCategory,
            featureBenchRoleCategory,
            canvasRoles: launch.canvasRoles ?? null,
            canvasExtRoles: launch.canvasExtRoles ?? null,
          },
          notified: existingMismatchRecord?.notified ?? false,
        });
        const shouldNotifyInstructor = !existingMismatchRecord?.notified;
        if (shouldNotifyInstructor) {
          await notifyTeachersOfPersistentEntitlementMismatch({
            assignment: launch.assignment,
            courseName: launch.assignment.course?.name ?? null,
            user: req.user,
            requestCanvasUserId: launchCanvasUserId,
            storedCanvasUserId,
            canvasRoleCategory,
            featureBenchRoleCategory,
          });
          await markEntitlementMismatchNotified({
            assignmentId: launch.assignment.id,
            userId,
          });
        }
        res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions);
      }
      return res.status(403).json({
        error: isMissingEnrollmentOnly ? "missing_enrollment" : "role_mismatch",
        message: isMissingEnrollmentOnly
          ? "FeatureBench could not find your enrollment for this course. Check your syllabus or reach out to an instructor for help accessing the assignment."
          : "Canvas says you have staff access, but your FeatureBench enrollment does not. Ask your instructor to update your enrollment before launching again.",
      });
    }
    await clearEntitlementMismatchRecord({
      assignmentId: launch.assignment.id,
      userId,
    });

    await prisma.canvasAssignmentLaunch.update({
      where: { id: launch.id },
      data: {
        userId,
        consumedAt: new Date(),
        token: null,
      },
    });

    if (launch.canvasUserId && launch.assignment?.courseId) {
      await attachCanvasUserIdToEnrollment({
        userId,
        courseId: launch.assignment.courseId,
        canvasUserId: launch.canvasUserId,
      });
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
