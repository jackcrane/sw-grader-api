import { prisma } from "#prisma";
import { evaluateSubmissionAgainstSignatures } from "./submissionUtils.js";
import { withSignedAssetUrls } from "../util/submissionAssets.js";
import { sendEmail } from "../util/postmark.js";
import { posthog } from "../util/posthog.js";
import {
  applyLatePolicyToGrade,
  resolveLatePolicy,
} from "./latePolicy.js";

const SIGNATURE_TREND_TYPE = "SIGNATURE_TREND";

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const formatTrendKey = (volume, surfaceArea) => {
  const vol = toNumber(volume);
  const area = toNumber(surfaceArea);
  if (vol == null || area == null) return null;
  return `${vol.toFixed(6)}|${area.toFixed(6)}`;
};

const getCourseContext = async (courseId) => {
  if (!courseId) return { course: null, studentCount: null, teachers: [] };

  const [course, studentCount, teachers] = await Promise.all([
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.enrollment.count({
      where: { courseId, deleted: false, type: "STUDENT" },
    }),
    prisma.enrollment.findMany({
      where: { courseId, deleted: false, type: "TEACHER" },
      include: { user: true },
    }),
  ]);

  return { course, studentCount, teachers };
};

const deriveThreshold = (studentCount) => {
  if (!Number.isFinite(studentCount)) return 5;
  return studentCount < 20 ? 3 : 5;
};

const buildSignatureSeed = async ({ submission, assignment }) => {
  const seed = {
    unitSystem: assignment?.unitSystem ?? null,
    volume: submission?.volume ?? null,
    surfaceArea: submission?.surfaceArea ?? null,
    screenshotUrl: submission?.screenshotUrl ?? null,
    trendKey: formatTrendKey(submission?.volume, submission?.surfaceArea),
  };

  const signed = await withSignedAssetUrls(submission);
  if (signed?.screenshotUrl) {
    seed.screenshotUrl = signed.screenshotUrl;
  }

  return seed;
};

const formatPersonName = (user) => {
  if (!user) return "there";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || "there";
};

const sendTrendEmail = async ({
  teacher,
  assignment,
  course,
  occurrenceCount,
}) => {
  if (!teacher?.email) return;
  const teacherName = formatPersonName(teacher);
  const assignmentName = assignment?.name || "an assignment";
  const courseName = course?.name || "your course";
  const body = [
    `Hi ${teacherName},`,
    "",
    `${occurrenceCount} students submitted the same geometry in ${assignmentName}, but it didn't match any of your signatures.`,
    "Please log into FeatureBench to review the new trend and add comments or an auto-grading result for it.",
    "",
    courseName ? `Course: ${courseName}` : null,
    "",
    "Thanks,",
    "The FeatureBench team",
  ]
    .filter(Boolean)
    .join("\n");

  await sendEmail({
    to: teacher.email,
    subject: `New signature trend on ${assignmentName}`,
    text: body,
  });
};

const upsertTrendNotification = async ({
  teacher,
  assignment,
  courseId,
  courseName,
  trendKey,
  occurrenceCount,
  signatureSeed,
}) => {
  if (!teacher?.id) return null;

  const existing = await prisma.notification.findFirst({
    where: {
      userId: teacher.id,
      type: SIGNATURE_TREND_TYPE,
      data: {
        path: ["trendKey"],
        equals: trendKey,
      },
    },
  });

  if (existing?.deleted) {
    // User already dismissed; don't recreate.
    return null;
  }

  const title = `New signature trend${assignment?.name ? ` in ${assignment.name}` : ""}`;
  const content = `${occurrenceCount} students submitted the same mass properties. Add a signature to capture it.`;

  const dataPayload = {
    hasCta: true,
    ctaLabel: "Add signature",
    action: "ADD_SIGNATURE_TREND",
    assignmentId: assignment?.id ?? null,
    courseId: courseId ?? null,
    courseName: courseName ?? null,
    trendKey,
    occurrenceCount,
    signatureSeed,
    dismissible: true,
    emailSent: existing?.data?.emailSent ?? false,
  };

  if (existing) {
    return prisma.notification.update({
      where: { id: existing.id },
      data: {
        title,
        content,
        data: { ...existing.data, ...dataPayload },
        deleted: false,
        readAt: existing.readAt,
      },
    });
  }

  return prisma.notification.create({
    data: {
      userId: teacher.id,
      type: SIGNATURE_TREND_TYPE,
      title,
      content,
      data: dataPayload,
    },
  });
};

const markResolvedNotifications = async ({ assignmentId, activeKeys }) => {
  if (!assignmentId) return;
  const notifications = await prisma.notification.findMany({
    where: {
      type: SIGNATURE_TREND_TYPE,
      deleted: false,
      data: {
        path: ["assignmentId"],
        equals: assignmentId,
      },
    },
  });

  const obsolete = notifications.filter(
    (notification) => !activeKeys.has(notification.data?.trendKey)
  );
  if (obsolete.length === 0) return;

  await Promise.all(
    obsolete.map((notification) =>
      prisma.notification.update({
        where: { id: notification.id },
        data: {
          deleted: true,
          readAt: notification.readAt ?? new Date(),
        },
      })
    )
  );
};

export const checkSignatureTrendsForAssignment = async ({
  assignmentId,
  courseId: explicitCourseId = null,
} = {}) => {
  if (!assignmentId) return [];

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      signatures: {
        where: { deleted: false },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!assignment) return [];

  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId,
      deleted: false,
      volume: { not: null },
      surfaceArea: { not: null },
    },
    select: {
      id: true,
      userId: true,
      volume: true,
      surfaceArea: true,
      grade: true,
      matchingSignatureId: true,
      screenshotKey: true,
      screenshotUrl: true,
      createdAt: true,
      updatedAt: true,
      courseId: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const tolerance = Number(assignment.tolerancePercent) || 0;
  const trendMap = new Map();
  let courseId = explicitCourseId ?? null;

  for (const submission of submissions) {
    if (!courseId && submission.courseId) {
      courseId = submission.courseId;
    }
    const evalResult = evaluateSubmissionAgainstSignatures({
      assignment,
      measuredVolume: submission.volume,
      measuredSurfaceArea: submission.surfaceArea,
      tolerance,
    });
    if (evalResult?.diffs?.withinTolerance) {
      continue;
    }
    const trendKey = formatTrendKey(submission.volume, submission.surfaceArea);
    if (!trendKey) continue;

    const existing = trendMap.get(trendKey) ?? {
      users: new Set(),
      submissions: [],
    };
    existing.users.add(submission.userId);
    existing.submissions.push(submission);
    trendMap.set(trendKey, existing);
  }

  if (trendMap.size === 0) {
    await markResolvedNotifications({
      assignmentId,
      activeKeys: new Set(),
    });
    return [];
  }

  const { course, studentCount, teachers } = await getCourseContext(courseId);
  const threshold = deriveThreshold(studentCount);

  const activeKeys = new Set();
  const alerts = [];

  for (const [trendKey, entry] of trendMap.entries()) {
    const uniqueStudents = entry.users.size;
    if (uniqueStudents < threshold) continue;

    activeKeys.add(trendKey);
    const sample =
      entry.submissions.sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0) -
          new Date(a.updatedAt ?? a.createdAt ?? 0)
      )[0] ?? null;

    const signatureSeed = await buildSignatureSeed({
      submission: sample,
      assignment,
    });

    posthog.capture({
      distinctId: assignment?.id ?? "signature-trend",
      event: "signature trend identified",
      properties: {
        assignmentId: assignment?.id ?? null,
        courseId,
        trendKey,
        occurrenceCount: uniqueStudents,
      },
    });

    for (const teacherEnrollment of teachers) {
      const teacher = teacherEnrollment?.user ?? null;
      const notification = await upsertTrendNotification({
        teacher,
        assignment,
        courseId,
        courseName: course?.name ?? null,
        trendKey,
        occurrenceCount: uniqueStudents,
        signatureSeed,
      });

      if (!notification) {
        continue;
      }

      const emailAlreadySent =
        notification?.data && notification.data.emailSent;
      if (!emailAlreadySent) {
        await sendTrendEmail({
          teacher,
          assignment,
          course,
          occurrenceCount: uniqueStudents,
        });
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            data: {
              ...notification.data,
              emailSent: true,
            },
          },
        });
      }
    }

    alerts.push({
      trendKey,
      occurrenceCount: uniqueStudents,
    });
  }

  await markResolvedNotifications({ assignmentId, activeKeys });
  return alerts;
};

export const enqueueSignatureTrendCheck = ({
  assignmentId,
  courseId = null,
} = {}) => {
  if (!assignmentId) return;
  setImmediate(() => {
    checkSignatureTrendsForAssignment({ assignmentId, courseId }).catch(
      (error) => {
        console.warn(
          `Signature trend detection failed for assignment ${assignmentId}`,
          error
        );
      }
    );
  });
};

const gradeChanged = (a, b) => {
  if (a == null && b == null) return false;
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) > 1e-6;
};

export const rescoreSubmissionsAgainstSignatures = async ({
  assignmentId,
  assignment: providedAssignment = null,
  courseId = null,
}) => {
  if (!assignmentId && !providedAssignment?.id) return;
  const assignment =
    providedAssignment ??
    (await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        signatures: {
          where: { deleted: false },
          orderBy: { sortOrder: "asc" },
        },
      },
    }));

  if (!assignment) return;

  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId: assignment.id,
      deleted: false,
      volume: { not: null },
      surfaceArea: { not: null },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      course: true,
    },
  });

  const tolerance = Number(assignment.tolerancePercent) || 0;
  const courseLookupId =
    courseId ??
    submissions.find((submission) => submission.courseId)?.courseId ??
    null;
  const course =
    courseLookupId != null
      ? await prisma.course.findUnique({ where: { id: courseLookupId } })
      : null;

  for (const submission of submissions) {
    const evaluation = evaluateSubmissionAgainstSignatures({
      assignment,
      measuredVolume: submission.volume,
      measuredSurfaceArea: submission.surfaceArea,
      tolerance,
    });

    const lateResult = applyLatePolicyToGrade({
      policy: resolveLatePolicy({
        course: submission.course ?? course,
        assignment,
      }),
      submittedAt: submission.createdAt,
      dueDate: assignment?.dueDate ?? null,
      rawGrade: evaluation.grade,
    });

    const nextData = {
      grade: lateResult?.grade ?? evaluation.grade ?? null,
      unpenalizedGrade:
        lateResult?.unpenalizedGrade ?? evaluation.grade ?? null,
      feedback: evaluation.feedback ?? null,
      matchingSignatureId: evaluation.matchingSignatureId ?? null,
    };

    const shouldUpdate =
      gradeChanged(submission.grade, nextData.grade) ||
      gradeChanged(submission.unpenalizedGrade, nextData.unpenalizedGrade) ||
      (submission.feedback ?? null) !== nextData.feedback ||
      (submission.matchingSignatureId ?? null) !== nextData.matchingSignatureId;
    const gradeValueChanged = gradeChanged(
      submission.grade,
      nextData.grade
    );

    if (!shouldUpdate) continue;

    await prisma.submission.update({
      where: { id: submission.id },
      data: nextData,
    });

    if (!gradeValueChanged) {
      continue;
    }

    posthog.capture({
      distinctId: submission.user?.id ?? submission.userId ?? "grader",
      event: "submission regraded",
      properties: {
        submissionId: submission.id,
        assignmentId: assignment.id,
        courseId: courseLookupId,
        previousGrade: submission.grade,
        newGrade: nextData.grade,
      },
    });

    if (submission.user?.email) {
      const assignmentName = assignment?.name || "your assignment";
      const body = [
        `Hi ${formatPersonName(submission.user)},`,
        "",
        `Your submission for ${assignmentName} was updated.`,
        "Log into FeatureBench to review the latest results.",
        course?.name ? `Course: ${course.name}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      Promise.resolve()
        .then(() =>
          sendEmail({
            to: submission.user.email,
            subject: `Submission updated for ${assignmentName}`,
            text: body,
          })
        )
        .catch((error) => {
          console.warn(
            `Failed to send submission update email for ${submission.id}`,
            error
          );
        });
    }
  }
};
