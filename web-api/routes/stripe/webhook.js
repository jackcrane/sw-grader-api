import { prisma } from "#prisma";
import { getStripeClient } from "../../util/stripe.js";
import { sendEmail } from "../../util/postmark.js";
import { scheduleEnrollmentFollowUps } from "../../services/enrollmentFollowUps.js";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = getStripeClient();

const formatName = (user) => {
  if (!user) return "";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName.trim();
};

const createTeacherPaymentNotification = async ({
  teacherId,
  course,
  student,
  paymentIntentId,
  intro,
  warningSentence,
  failureMessage,
}) => {
  if (!teacherId) return;

  const notificationExists =
    paymentIntentId &&
    (await prisma.notification.findFirst({
      where: {
        userId: teacherId,
        deleted: false,
        data: {
          path: ["paymentIntentId"],
          equals: paymentIntentId,
        },
      },
    }));

  if (notificationExists) {
    return notificationExists;
  }

  const studentDisplayName =
    formatName(student) || student?.firstName || "a student";
  const courseName = course?.name || "your course";
  const notificationTitle = studentDisplayName
    ? `Confirm payment for ${studentDisplayName}`
    : "Confirm an enrollment payment";

  const contentParts = [intro];
  if (failureMessage) {
    contentParts.push(`Stripe reported: ${failureMessage}`);
  }
  if (warningSentence) {
    contentParts.push(warningSentence);
  }
  const content = contentParts.join(" ");

  const data = {
    hasCta: true,
    ctaLabel: "Authorize payment",
    ctaHref: null,
    action: "AUTHORIZE_PAYMENT",
    paymentIntentId: paymentIntentId ?? null,
    failureMessage: failureMessage ?? null,
    courseId: course?.id ?? null,
    courseName,
    studentId: student?.id ?? null,
    studentName: studentDisplayName,
  };

  return prisma.notification.create({
    data: {
      userId: teacherId,
      type: "PAYMENT_ISSUE",
      title: notificationTitle,
      content,
      data,
    },
  });
};

const notifyTeacherOfFailedCharge = async (
  paymentIntent,
  { isAuthenticationFailure = false } = {}
) => {
  const metadata = paymentIntent?.metadata ?? {};
  if (!metadata || (metadata.payerRole && metadata.payerRole !== "teacher")) {
    return;
  }

  const teacherId = metadata.teacherUserId;
  const courseId = metadata.courseId;
  if (!teacherId || !courseId) {
    return;
  }

  const [teacher, course, student] = await Promise.all([
    prisma.user.findUnique({ where: { id: teacherId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
    metadata.studentUserId
      ? prisma.user.findUnique({ where: { id: metadata.studentUserId } })
      : null,
  ]);

  const enrollment =
    student && course
      ? await prisma.enrollment.findFirst({
          where: {
            userId: student.id,
            courseId: course.id,
            deleted: false,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

  const studentFirstName = student?.firstName?.trim();
  const teacherName = formatName(teacher) || "there";
  const courseName = course?.name ?? "your course";
  const studentDisplayName =
    formatName(student) || studentFirstName || "a student";
  const failureMessage =
    paymentIntent?.last_payment_error?.message ||
    "The card issuer rejected the charge.";

  const intro = studentDisplayName
    ? `We couldn't charge your saved card for ${studentDisplayName}'s enrollment in ${courseName}.`
    : `We couldn't charge your saved card for a new enrollment in ${courseName}.`;

  const warningSentence = studentFirstName
    ? `We have still allowed ${studentFirstName} to join your class, but they will be automatically removed in 48 hours if you do not fix your payment method.`
    : "We have still allowed this student to join your class, but they will be automatically removed in 48 hours if you do not fix your payment method.";

  const body = [
    `Hi ${teacherName},`,
    "",
    intro,
    `Stripe reported: ${failureMessage}`,
    "",
    warningSentence,
    "",
    "Please update your payment method in FeatureBench right away.",
    "",
    "Thanks,",
    "The FeatureBench team",
  ].join("\n");

  if (!isAuthenticationFailure) {
    if (teacher?.email) {
      await sendEmail({
        to: teacher.email,
        subject: `Action needed: Unable to charge for ${courseName}`,
        text: body,
      });
    } else {
      console.warn(
        "Stripe webhook unable to send failure email: missing teacher email",
        { teacherId }
      );
    }
  }

  if (enrollment && student && course) {
    await scheduleEnrollmentFollowUps({
      enrollmentId: enrollment.id,
      teacherId,
      studentId: student.id,
      courseId,
    });
  }

  if (isAuthenticationFailure && teacherId) {
    await createTeacherPaymentNotification({
      teacherId,
      course,
      student,
      paymentIntentId: paymentIntent?.id,
      intro,
      warningSentence,
      failureMessage,
    });
  }
};

export const post = async (req, res) => {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "stripe_webhook_unconfigured" });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).send("Missing Stripe signature header");
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return res.status(400).send("Missing raw request body for verification");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (
      event.type === "payment_intent.payment_failed" ||
      event.type === "payment_intent.requires_action"
    ) {
      const paymentIntent = event.data.object;
      const isAuthenticationFailure =
        event.type === "payment_intent.requires_action" ||
        paymentIntent?.last_payment_error?.code === "authentication_required";
      await notifyTeacherOfFailedCharge(paymentIntent, {
        isAuthenticationFailure,
      });
    }
  } catch (err) {
    console.error("Error handling Stripe webhook event", err);
    return res.status(500).send("Webhook handler error");
  }

  return res.json({ received: true });
};
