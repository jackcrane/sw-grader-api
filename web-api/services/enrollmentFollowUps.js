import { enqueueBillingJob } from "./billingQueue.js";

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
};
