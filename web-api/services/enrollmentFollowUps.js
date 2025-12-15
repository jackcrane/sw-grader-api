import { prisma } from "#prisma";
import { enqueueBillingJob } from "./billingQueue.js";
import { posthog } from "../util/posthog.js";

export const EnrollmentFollowUpType = {
  WARNING: "WARNING",
  DROP: "DROP",
};

export const BILLING_FOLLOW_UP_JOB = "ENROLLMENT_FOLLOW_UP_TASK";

const HOURS = 60 * 60 * 1000;
const WARNING_DELAY_MS = 42 * HOURS; // 48h - 6h warning window
const DROP_DELAY_MS = 48 * HOURS;

const enqueueFollowUpJob = async (payload, delayMs) => {
  await enqueueBillingJob(
    {
      ...payload,
      type: BILLING_FOLLOW_UP_JOB,
    },
    { delayMs }
  );
  posthog.capture({
    distinctId: payload.teacherId ?? payload.studentId ?? "billing",
    event: "billing follow-up enqueued",
    properties: {
      action: payload.action,
      enrollmentId: payload.enrollmentId ?? null,
      teacherId: payload.teacherId ?? null,
      studentId: payload.studentId ?? null,
      courseId: payload.courseId ?? null,
      runAt: payload.runAt,
    },
  });
};

const createJobPayload = ({
  action,
  runAt,
  enrollmentId,
  teacherId,
  studentId,
  courseId,
}) => ({
  jobKey: `${enrollmentId}:${action}`,
  action,
  runAt: runAt.toISOString(),
  enrollmentId,
  teacherId,
  studentId,
  courseId,
});

export const scheduleEnrollmentFollowUps = async ({
  enrollmentId,
  teacherId,
  studentId,
  courseId,
}) => {
  if (!enrollmentId || !teacherId || !studentId || !courseId) {
    return;
  }

  const now = Date.now();
  const warningRunAt = new Date(now + WARNING_DELAY_MS);
  const dropRunAt = new Date(now + DROP_DELAY_MS);

  await prisma.enrollment.updateMany({
    where: { id: enrollmentId },
    data: { billingFollowUpResolvedAt: null },
  });

  const warningDelay = Math.max(0, warningRunAt.getTime() - now);
  const dropDelay = Math.max(0, dropRunAt.getTime() - now);

  await Promise.all([
    enqueueFollowUpJob(
      createJobPayload({
        action: EnrollmentFollowUpType.WARNING,
        runAt: warningRunAt,
        enrollmentId,
        teacherId,
        studentId,
        courseId,
      }),
      warningDelay
    ),
    enqueueFollowUpJob(
      createJobPayload({
        action: EnrollmentFollowUpType.DROP,
        runAt: dropRunAt,
        enrollmentId,
        teacherId,
        studentId,
        courseId,
      }),
      dropDelay
    ),
  ]);

  posthog.capture({
    distinctId: teacherId,
    event: "billing follow-up scheduled",
    properties: {
      enrollmentId,
      teacherId,
      studentId,
      courseId,
      warningRunAt: warningRunAt.toISOString(),
      dropRunAt: dropRunAt.toISOString(),
    },
  });
};

export const resolveEnrollmentFollowUps = async ({
  enrollmentId,
  studentId,
  courseId,
}) => {
  const where = { deleted: false };
  if (enrollmentId) {
    where.id = enrollmentId;
  } else {
    if (!studentId || !courseId) {
      return;
    }
    where.userId = studentId;
    where.courseId = courseId;
  }

  await prisma.enrollment.updateMany({
    where,
    data: { billingFollowUpResolvedAt: new Date() },
  });

  posthog.capture({
    distinctId: studentId ?? courseId ?? "billing",
    event: "billing follow-up resolved",
    properties: {
      enrollmentId: enrollmentId ?? null,
      studentId: where.userId ?? studentId ?? null,
      courseId: where.courseId ?? courseId ?? null,
    },
  });
};
