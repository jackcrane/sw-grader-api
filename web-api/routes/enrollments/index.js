import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import {
  findCourseByInviteCode,
  generateCourseInviteCodes,
  normalizeInviteCode,
} from "../../util/inviteCodes.js";
import { ensureStripeCustomerForUser } from "../../services/stripeCustomers.js";
import { getStripeClient } from "../../util/stripe.js";

const normalizeBillingScheme = (value) => {
  if (typeof value !== "string" || !value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "PER_COURSE" || normalized === "PER_STUDENT") {
    return normalized;
  }

  if (value === "pay-per-course") {
    return "PER_COURSE";
  }

  if (value === "pay-per-student") {
    return "PER_STUDENT";
  }

  return null;
};

const PER_STUDENT_ENROLLMENT_FEE_CENTS = 2000;
const PER_COURSE_ENROLLMENT_FEE_CENTS = 1200;

const createPaymentError = (message, code, course) => {
  const error = new Error(message);
  error.statusCode = 402;
  error.code = code;
  if (course) {
    error.course = { id: course.id, name: course.name };
  }
  return error;
};

const chargeEnrollmentFeeForUser = async ({
  user: userOrId,
  course,
  amount,
  description,
  metadata = {},
  missingPaymentMethodMessage,
  missingPaymentMethodCode = "payment_method_required",
  paymentFailedMessage,
  paymentFailedCode = "payment_failed",
}) => {
  if (!userOrId) {
    throw new Error("User is required to charge enrollment fee");
  }

  const stripe = getStripeClient();
  const { customerId, user } = await ensureStripeCustomerForUser(userOrId);
  if (!user) {
    throw new Error("User not found for enrollment fee");
  }
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  });

  const defaultPaymentMethod =
    customer?.invoice_settings?.default_payment_method;
  const paymentMethodId =
    typeof defaultPaymentMethod === "string"
      ? defaultPaymentMethod
      : defaultPaymentMethod?.id ?? null;

  if (!paymentMethodId) {
    throw createPaymentError(
      missingPaymentMethodMessage ||
        "Add a payment method before joining this course.",
      missingPaymentMethodCode,
      course
    );
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description:
        description ||
        (course?.name
          ? `FeatureBench enrollment fee – ${course.name}`
          : "FeatureBench enrollment fee"),
      metadata: {
        courseId: course?.id ?? "",
        ...metadata,
      },
      receipt_email: user.email || undefined,
    });

    if (paymentIntent.status !== "succeeded") {
      throw createPaymentError(
        paymentFailedMessage ||
          "Unable to process payment for this enrollment.",
        paymentFailedCode,
        course
      );
    }

    return paymentIntent;
  } catch (err) {
    if (
      err?.statusCode === 402 ||
      err?.code === "card_declined" ||
      err?.type === "StripeCardError"
    ) {
      throw createPaymentError(
        err?.message ||
          paymentFailedMessage ||
          "Unable to process payment for this enrollment.",
        paymentFailedCode,
        course
      );
    }

    throw err;
  }
};

const chargePerStudentEnrollment = (userId, course) =>
  chargeEnrollmentFeeForUser({
    user: userId,
    course,
    amount: PER_STUDENT_ENROLLMENT_FEE_CENTS,
    metadata: {
      enrollmentFee: "per_student",
      payerRole: "student",
      userId,
    },
    missingPaymentMethodMessage:
      "Add a payment method before joining this course.",
    missingPaymentMethodCode: "payment_method_required",
    paymentFailedMessage:
      "Unable to process payment for this enrollment. Please update your payment method.",
    paymentFailedCode: "payment_failed",
  });

const chargeTeacherForCourseEnrollment = async (course, studentUserId) => {
  if (!course?.id) {
    throw new Error("Course is required to charge enrollment fee");
  }

  const teacherEnrollment = await prisma.enrollment.findFirst({
    where: {
      courseId: course.id,
      type: "TEACHER",
      deleted: false,
    },
    include: {
      user: true,
    },
  });

  if (!teacherEnrollment?.user) {
    throw createPaymentError(
      "We could not find a billing account for this course. Ask the instructor to update payment information.",
      "course_payment_missing_teacher",
      course
    );
  }

  return chargeEnrollmentFeeForUser({
    user: teacherEnrollment.user,
    course,
    amount: PER_COURSE_ENROLLMENT_FEE_CENTS,
    description: course.name
      ? `FeatureBench student enrollment – ${course.name}`
      : "FeatureBench student enrollment",
    metadata: {
      enrollmentFee: "per_course",
      payerRole: "teacher",
      teacherUserId: teacherEnrollment.user.id,
      studentUserId,
    },
    missingPaymentMethodMessage:
      "We couldn’t charge the instructor for this course. Ask them to update their payment method and try again.",
    missingPaymentMethodCode: "course_payment_method_required",
    paymentFailedMessage:
      "We couldn’t charge the instructor for this enrollment. Ask them to update their payment method.",
    paymentFailedCode: "course_payment_failed",
  });
};

export const get = [
  withAuth,
  async (req, res) => {
    const userId = req.user.localUserId ?? req.user.id;
    const enrollments = await prisma.enrollment.findMany({
      where: {
        userId,
        deleted: false,
        course: {
          deleted: false,
        },
      },
      include: {
        course: true,
      },
    });

    return res.json(enrollments);
  },
];

export const post = [
  withAuth,
  async (req, res) => {
    const { inviteCode } = req.body ?? {};
    const confirmPayment = Boolean(req.body?.confirmPayment);

    const userId = req.user.localUserId;
    if (!userId) {
      return res
        .status(400)
        .json({ message: "No local user found for enrollment creation" });
    }

    if (inviteCode) {
      const normalizedCode = normalizeInviteCode(inviteCode);
      if (!normalizedCode) {
        return res.status(400).json({ message: "Invite code is required" });
      }

      const courseAndType = await findCourseByInviteCode(normalizedCode);
      if (!courseAndType) {
        return res.status(404).json({ message: "Invalid invite code" });
      }

      const existingEnrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          courseId: courseAndType.course.id,
          deleted: false,
        },
        include: {
          course: true,
        },
      });

      if (existingEnrollment) {
        return res.json(existingEnrollment);
      }

      if (
        courseAndType.enrollmentType === "STUDENT" &&
        courseAndType.course.billingScheme === "PER_STUDENT"
      ) {
        if (!confirmPayment) {
          return res.status(402).json({
            error: "payment_confirmation_required",
            message:
              "Review your payment method before joining this course.",
            course: {
              id: courseAndType.course.id,
              name: courseAndType.course.name,
            },
          });
        }

        try {
          await chargePerStudentEnrollment(userId, courseAndType.course);
        } catch (err) {
          if (err?.statusCode === 402) {
            return res.status(402).json({
              error: err?.code ?? "billing_error",
              message:
                err?.message ??
                "Unable to process payment for this enrollment.",
              course: err?.course ?? {
                id: courseAndType.course.id,
                name: courseAndType.course.name,
              },
            });
          }
          throw err;
        }
      } else if (
        courseAndType.enrollmentType === "STUDENT" &&
        courseAndType.course.billingScheme === "PER_COURSE"
      ) {
        try {
          await chargeTeacherForCourseEnrollment(
            courseAndType.course,
            userId
          );
        } catch (err) {
          console.warn("Teacher billing failed for enrollment", {
            courseId: courseAndType.course.id,
            studentId: userId,
            error: err?.message || err,
          });
          // Allow enrollment to continue; Stripe webhook will notify instructor.
        }
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          userId,
          courseId: courseAndType.course.id,
          type: courseAndType.enrollmentType,
        },
        include: {
          course: true,
        },
      });

      return res.status(201).json(enrollment);
    }

    const { name, abbr } = req.body ?? {};
    const normalizedBillingScheme = normalizeBillingScheme(
      req.body?.billingScheme
    );
    if (!name || !abbr) {
      return res
        .status(400)
        .json({ message: "Course name and abbreviation are required" });
    }

    if (!normalizedBillingScheme) {
      return res
        .status(400)
        .json({ message: "A valid billing scheme is required" });
    }

    const trimmedName = name.trim();
    const trimmedAbbr = abbr.trim();
    if (!trimmedName || !trimmedAbbr) {
      return res
        .status(400)
        .json({ message: "Course name and abbreviation cannot be empty" });
    }

    const { studentInviteCode, taInviteCode } =
      await generateCourseInviteCodes();

    const course = await prisma.course.create({
      data: {
        name: trimmedName,
        abbr: trimmedAbbr,
        studentInviteCode,
        taInviteCode,
        billingScheme: normalizedBillingScheme,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        userId,
        courseId: course.id,
        type: "TEACHER",
      },
      include: {
        course: true,
      },
    });

    return res.status(201).json(enrollment);
  },
];
