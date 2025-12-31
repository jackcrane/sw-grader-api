import { prisma } from "#prisma";
import { consumeBillingJobs } from "./billingQueue.js";
import {
  BILLING_FOLLOW_UP_JOB,
  EnrollmentFollowUpType,
} from "./enrollmentFollowUps.js";
import { sendEmail } from "../util/postmark.js";
import { posthog } from "../util/posthog.js";
import { getActiveTaUserForCourse } from "./courseContacts.js";

const formatName = (user) => {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
};

const sendBillingFollowUpEmail = async ({
  recipient,
  recipientName,
  subject,
  lines,
  context,
}) => {
  if (!recipient?.email) {
    console.warn(
      "Billing follow-up unable to send email: missing address",
      { recipientId: recipient?.id ?? null, context }
    );
    return;
  }

  await sendEmail({
    to: recipient.email,
    subject,
    text: lines.join("\n"),
  });
};

const sendWarningEmail = async ({
  teacher,
  student,
  course,
  billingContact,
  testOverride,
}) => {
  const teacherName =
    testOverride?.teacherName || formatName(teacher) || "there";
  const studentName =
    testOverride?.studentName || formatName(student) || "a student";
  const courseName = testOverride?.courseName || course?.name || "your course";
  const subject = `Action required soon: ${courseName}`;
  const lines = [
    `Hi ${teacherName},`,
    "",
    `We still need a valid payment method for ${studentName}'s enrollment in ${courseName}.`,
    "They were allowed to join when the payment failed, but they'll be removed in roughly 6 hours unless billing is updated.",
    "",
    "Please add a new card in FeatureBench to keep the student enrolled.",
    "",
    "Thanks,",
    "The FeatureBench team",
  ];

  if (testOverride) {
    const targetEmail = testOverride.email;
    if (!targetEmail) return;
    await sendEmail({
      to: targetEmail,
      subject,
      text: lines.join("\n"),
    });
    return;
  }

  const recipients = [
    {
      recipient: teacher,
      recipientName: teacherName,
      context: "teacher",
    },
  ];

  if (billingContact?.id && billingContact.id !== teacher?.id) {
    recipients.push({
      recipient: billingContact,
      recipientName: formatName(billingContact) || "there",
      context: "billing_contact",
    });
  }

  await Promise.all(
    recipients.map(({ recipient, recipientName, context }) =>
      sendBillingFollowUpEmail({
        recipient,
        recipientName,
        subject,
        lines,
        context,
      })
    )
  );
};

const dropEnrollment = async ({
  enrollment,
  teacher,
  student,
  course,
  billingContact,
}) => {
  if (!enrollment) return;
  await prisma.enrollment.updateMany({
    where: { id: enrollment.id },
    data: { deleted: true },
  });

  posthog.capture({
    distinctId: teacher?.id ?? "billing",
    event: "enrollment auto dropped",
    properties: {
      enrollmentId: enrollment.id,
      teacherId: teacher?.id ?? null,
      studentId: student?.id ?? null,
      courseId: course?.id ?? null,
    },
  });

  const teacherName = formatName(teacher) || "there";
  const studentName = formatName(student) || "a student";
  const courseName = course?.name || "your course";
  const subject = `${studentName} removed from ${courseName}`;
  const lines = [
    `Hi ${teacherName},`,
    "",
    `${studentName} has been removed from ${courseName} because we still couldn't charge your saved payment method.`,
    "Update your billing details if you'd like to invite them back.",
    "",
    "Thanks,",
    "The FeatureBench team",
  ];

  const recipients = [
    {
      recipient: teacher,
      recipientName: teacherName,
      context: "teacher",
    },
  ];

  if (billingContact?.id && billingContact.id !== teacher?.id) {
    recipients.push({
      recipient: billingContact,
      recipientName: formatName(billingContact) || "there",
      context: "billing_contact",
    });
  }

  await Promise.all(
    recipients.map(({ recipient, recipientName, context }) =>
      sendBillingFollowUpEmail({
        recipient,
        recipientName,
        subject,
        lines,
        context,
      })
    )
  );
};

const handleJob = async (job = {}) => {
  if (job.type !== BILLING_FOLLOW_UP_JOB) {
    return;
  }
  const { action, enrollmentId, teacherId, studentId, courseId } = job;
  const isTestWarning =
    action === EnrollmentFollowUpType.WARNING && job.testEmailOverride;
  if (
    !action ||
    (!isTestWarning &&
      (!enrollmentId || !teacherId || !studentId || !courseId))
  ) {
    console.warn("Skipping malformed follow-up job", job);
    return;
  }

  if (isTestWarning) {
    await sendWarningEmail({
      teacher: null,
      student: null,
      course: null,
      billingContact,
      testOverride: job.testEmailOverride,
    });
    posthog.capture({
      distinctId: "billing",
      event: "billing warning sent",
      properties: {
        enrollmentId,
        teacherId,
        studentId,
        courseId,
        test: true,
      },
    });
    return;
  }

  const [teacher, student, course, enrollment] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId } }),
    prisma.user.findUnique({ where: { id: studentId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
    prisma.enrollment.findUnique({ where: { id: enrollmentId } }),
  ]);

  if (!teacher || !student || !course || !enrollment) {
    console.warn("Skipping follow-up due to missing context", {
      teacherId,
      studentId,
      courseId,
      enrollmentId,
    });
    return;
  }

  const billingContact = await getActiveTaUserForCourse({
    courseId,
    userId: course.primaryBillingContactUserId ?? null,
  });

  if (enrollment.billingFollowUpResolvedAt || enrollment.deleted) {
    return;
  }

  if (action === EnrollmentFollowUpType.WARNING) {
    await sendWarningEmail({
      teacher,
      student,
      course,
      billingContact,
      testOverride: job.testEmailOverride,
    });
    posthog.capture({
      distinctId: teacher.id,
      event: "billing warning sent",
      properties: {
        enrollmentId,
        teacherId,
        studentId,
        courseId,
      },
    });
  } else if (action === EnrollmentFollowUpType.DROP) {
    await dropEnrollment({
      enrollment,
      teacher,
      student,
      course,
      billingContact,
    });
  }
};

export const startBillingFollowUpWorker = async () => {
  try {
    await consumeBillingJobs(handleJob);
  } catch (error) {
    console.error("Unable to start billing follow-up consumer", error);
  }
};
