import { prisma } from "#prisma";
import { sendEmail } from "../../../util/postmark.js";

const SUPPORT_EMAIL = "support@featurebench.com";
const CANVAS_STAFF_ROLE_TOKENS = [
  "instructor",
  "teacher",
  "teachingassistant",
  "urn:lti:instrole:ims/lis/instructor",
  "urn:lti:role:ims/lis/instructor",
  "urn:lti:role:ims/lis/teachingassistant",
  ":ta",
];
const CANVAS_STUDENT_ROLE_TOKENS = [
  "student",
  "learner",
  "urn:lti:role:ims/lis/learner",
  "urn:lti:role:ims/lis/student",
];

const formatName = (user) => {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
};

export const resolveCanvasRoleCategory = (body = {}) => {
  const combined = [body.roles, body.ext_roles]
    .filter((value) => typeof value === "string" && value.trim())
    .join(",")
    .toLowerCase();
  if (!combined) return "unknown";
  if (CANVAS_STAFF_ROLE_TOKENS.some((token) => combined.includes(token))) {
    return "staff";
  }
  if (CANVAS_STUDENT_ROLE_TOKENS.some((token) => combined.includes(token))) {
    return "student";
  }
  return "unknown";
};

export const resolveFeatureBenchRoleCategory = (enrollmentType) => {
  if (["TEACHER", "TA"].includes(enrollmentType)) return "staff";
  if (enrollmentType === "STUDENT") return "student";
  return "unknown";
};

export const shouldForceReauthentication = (
  canvasRoleCategory,
  featureBenchRoleCategory
) => {
  if (
    canvasRoleCategory === "unknown" ||
    featureBenchRoleCategory === "unknown"
  ) {
    return false;
  }
  return canvasRoleCategory !== featureBenchRoleCategory;
};

const getCourseTeachers = async (courseId) => {
  if (!courseId) return [];
  const enrollments = await prisma.enrollment.findMany({
    where: {
      courseId,
      type: "TEACHER",
      deleted: false,
      user: {
        deleted: false,
      },
    },
    include: {
      user: true,
    },
  });
  return enrollments
    .map((entry) => entry.user)
    .filter((user) => user?.email);
};

export const notifyTeachersOfPointsMismatch = async ({
  assignment,
  courseName,
  canvasPoints,
  featureBenchPoints,
}) => {
  if (!assignment?.courseId) return;

  const teachers = await getCourseTeachers(assignment.courseId);

  if (!teachers.length) {
    console.warn(
      `[Canvas LTI] Points mismatch detected for assignment ${assignment.id}, but no teacher email recipients were found.`
    );
    return;
  }

  const assignmentName = assignment.name || "a FeatureBench assignment";
  const courseSegment = courseName ? ` in ${courseName}` : "";

  await Promise.all(
    teachers.map((teacher) => {
      const teacherName = formatName(teacher) || "there";
      const lines = [
        `Hi ${teacherName},`,
        "",
        `Canvas launched "${assignmentName}"${courseSegment}, but Canvas reported ${canvasPoints} point${
          canvasPoints === 1 ? "" : "s"
        } while FeatureBench has ${featureBenchPoints}.`,
        "Please update the point value in Canvas or FeatureBench so they stay in sync.",
        "",
        "Thanks,",
        "The FeatureBench team",
      ];
      return sendEmail({
        to: teacher.email,
        subject: `Canvas points mismatch for ${assignmentName}`,
        text: lines.join("\n"),
      });
    })
  );

  console.log(
    `[Canvas LTI] Notified ${teachers.length} teacher(s) about points mismatch for assignment ${assignment.id}. Canvas=${canvasPoints}, FeatureBench=${featureBenchPoints}.`
  );
};

export const notifyTeachersOfPersistentEntitlementMismatch = async ({
  assignment,
  courseName,
  user,
  requestCanvasUserId,
  storedCanvasUserId,
  canvasRoleCategory,
  featureBenchRoleCategory,
}) => {
  if (!assignment?.courseId) return;

  const teachers = await getCourseTeachers(assignment.courseId);
  if (!teachers.length) {
    console.warn(
      `[Canvas LTI] Enrollment mismatch detected for assignment ${assignment.id}, but no teacher email recipients were found.`
    );
    return;
  }

  const assignmentName = assignment.name || "a FeatureBench assignment";
  const courseSegment = courseName ? ` in ${courseName}` : "";
  const userDisplayName =
    formatName(user) || user?.email || (user?.id ? `User ${user.id}` : "a user");
  const roleSummary = [
    `Canvas described the user as: ${canvasRoleCategory || "unknown"}`,
    `FeatureBench enrollment role: ${featureBenchRoleCategory || "unknown"}`,
  ];
  const identifierSummary = [
    requestCanvasUserId
      ? `Canvas user_id: ${requestCanvasUserId}`
      : "Canvas user_id not provided",
    storedCanvasUserId
      ? `Enrollment Canvas user_id: ${storedCanvasUserId}`
      : "Enrollment Canvas user_id not set",
    user?.email ? `FeatureBench account email: ${user.email}` : null,
    user?.id ? `FeatureBench user ID: ${user.id}` : null,
  ].filter(Boolean);

  await Promise.all(
    teachers.map((teacher) => {
      const teacherName = formatName(teacher) || "there";
      const lines = [
        `Hi ${teacherName},`,
        "",
        `Canvas launched "${assignmentName}"${courseSegment}, but even after forcing the user (${userDisplayName}) to log in again their Canvas role still doesn't match the enrollment in FeatureBench.`,
        "",
        ...roleSummary,
        "",
        ...identifierSummary,
        "",
        "Please verify that this user is enrolled with the correct role in FeatureBench and that Canvas is launching the correct person before trying again.",
        "",
        "Thanks,",
        "The FeatureBench team",
      ];
      return sendEmail({
        to: teacher.email,
        cc: SUPPORT_EMAIL,
        subject: `Canvas role mismatch for ${assignmentName}`,
        text: lines.join("\n"),
      });
    })
  );

  console.log(
    `[Canvas LTI] Notified ${teachers.length} teacher(s) about persistent Canvas entitlement mismatch for assignment ${assignment.id}.`
  );
};

export const attachCanvasUserIdToEnrollment = async ({
  userId,
  courseId,
  canvasUserId,
}) => {
  if (!userId || !courseId || !canvasUserId) return;
  try {
    const { count } = await prisma.enrollment.updateMany({
      where: { userId, courseId, deleted: false },
      data: {
        canvasUserId,
        canvasUserIdUpdatedAt: new Date(),
      },
    });
    if (!count) {
      console.warn(
        `[Canvas LTI] Unable to attach Canvas user ${canvasUserId} to enrollment. No matching enrollment for user ${userId} in course ${courseId}.`
      );
    }
  } catch (error) {
    console.error(
      `[Canvas LTI] Failed to attach Canvas user ${canvasUserId} to enrollment for user ${userId} in course ${courseId}`,
      error
    );
  }
};

export const findEntitlementMismatchRecord = async ({ assignmentId, userId }) => {
  if (!assignmentId || !userId) return null;
  try {
    return await prisma.canvasEntitlementMismatch.findUnique({
      where: {
        assignmentId_featureBenchUserId: {
          assignmentId,
          featureBenchUserId: userId,
        },
      },
    });
  } catch (error) {
    console.error(
      "[Canvas LTI] Failed to load entitlement mismatch record",
      assignmentId,
      userId,
      error
    );
    return null;
  }
};

export const upsertEntitlementMismatchRecord = async ({
  assignmentId,
  courseId,
  userId,
  reasons,
  context,
  notified,
}) => {
  if (!assignmentId || !courseId || !userId) return null;
  try {
    return await prisma.canvasEntitlementMismatch.upsert({
      where: {
        assignmentId_featureBenchUserId: {
          assignmentId,
          featureBenchUserId: userId,
        },
      },
      create: {
        assignmentId,
        courseId,
        featureBenchUserId: userId,
        reasons: reasons || [],
        context: context ?? null,
        notified: Boolean(notified),
      },
      update: {
        reasons: reasons || [],
        context: context ?? null,
        notified: Boolean(notified),
      },
    });
  } catch (error) {
    console.error(
      "[Canvas LTI] Failed to upsert entitlement mismatch record",
      {
        assignmentId,
        courseId,
        userId,
      },
      error
    );
    return null;
  }
};

export const markEntitlementMismatchNotified = async ({
  assignmentId,
  userId,
}) => {
  if (!assignmentId || !userId) return;
  try {
    await prisma.canvasEntitlementMismatch.update({
      where: {
        assignmentId_featureBenchUserId: {
          assignmentId,
          featureBenchUserId: userId,
        },
      },
      data: { notified: true },
    });
  } catch (error) {
    console.error(
      "[Canvas LTI] Failed to mark entitlement mismatch as notified",
      {
        assignmentId,
        userId,
      },
      error
    );
  }
};

export const clearEntitlementMismatchRecord = async ({
  assignmentId,
  userId,
}) => {
  if (!assignmentId || !userId) return;
  try {
    await prisma.canvasEntitlementMismatch.deleteMany({
      where: {
        assignmentId,
        featureBenchUserId: userId,
      },
    });
  } catch (error) {
    console.error(
      "[Canvas LTI] Failed to clear entitlement mismatch record",
      {
        assignmentId,
        userId,
      },
      error
    );
  }
};
