import { prisma } from "#prisma";
import { consumeBillingJobs } from "./billingQueue.js";
import {
  BILLING_FOLLOW_UP_JOB,
  EnrollmentFollowUpType,
} from "./enrollmentFollowUps.js";
import { sendEmail } from "../util/postmark.js";

const formatName = (user) => {
  if (!user) return "";
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
};

const sendWarningEmail = async ({ teacher, student, course, testOverride }) => {
  const targetEmail = testOverride?.email || teacher?.email;
  if (!targetEmail) return;
  const teacherName =
    testOverride?.teacherName || formatName(teacher) || "there";
  const studentName =
    testOverride?.studentName || formatName(student) || "a student";
  const courseName = testOverride?.courseName || course?.name || "your course";

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

  await sendEmail({
    to: targetEmail,
    subject: `Action required soon: ${courseName}`,
    text: lines.join("\n"),
  });
};

const dropEnrollment = async ({ enrollment, teacher, student, course }) => {
  if (!enrollment) return;
  await prisma.enrollment.updateMany({
    where: { id: enrollment.id },
    data: { deleted: true },
  });

  if (teacher?.email) {
    const teacherName = formatName(teacher) || "there";
    const studentName = formatName(student) || "a student";
    const courseName = course?.name || "your course";
    const lines = [
      `Hi ${teacherName},`,
      "",
      `${studentName} has been removed from ${courseName} because we still couldn't charge your saved payment method.`,
      "Update your billing details if you'd like to invite them back.",
      "",
      "Thanks,",
      "The FeatureBench team",
    ];

    await sendEmail({
      to: teacher.email,
      subject: `${studentName} removed from ${courseName}`,
      text: lines.join("\n"),
    });
  }
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
      testOverride: job.testEmailOverride,
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

  if (enrollment.billingFollowUpResolvedAt || enrollment.deleted) {
    return;
  }

  if (action === EnrollmentFollowUpType.WARNING) {
    await sendWarningEmail({
      teacher,
      student,
      course,
      testOverride: job.testEmailOverride,
    });
  } else if (action === EnrollmentFollowUpType.DROP) {
    await dropEnrollment({ enrollment, teacher, student, course });
  }
};

export const startBillingFollowUpWorker = async () => {
  try {
    await consumeBillingJobs(handleJob);
  } catch (error) {
    console.error("Unable to start billing follow-up consumer", error);
  }
};
