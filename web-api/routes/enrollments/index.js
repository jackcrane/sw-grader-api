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

const createPaymentError = (message, code, course) => {
  const error = new Error(message);
  error.statusCode = 402;
  error.code = code;
  if (course) {
    error.course = { id: course.id, name: course.name };
  }
  return error;
};

const chargePerStudentEnrollment = async (userId, course) => {
  if (!userId) {
    throw new Error("User is required to charge enrollment fee");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("User not found for enrollment fee");
  }

  const stripe = getStripeClient();
  const { customerId } = await ensureStripeCustomerForUser(user);
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
      "Add a payment method before joining this course.",
      "payment_method_required",
      course
    );
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PER_STUDENT_ENROLLMENT_FEE_CENTS,
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: course?.name
        ? `FeatureBench enrollment fee – ${course.name}`
        : "FeatureBench enrollment fee",
      metadata: {
        courseId: course?.id ?? "",
        enrollmentFee: "per_student",
        userId,
      },
      receipt_email: user.email || undefined,
    });

    if (paymentIntent.status !== "succeeded") {
      throw createPaymentError(
        "Unable to process payment for this enrollment.",
        "payment_failed",
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
          "Your card was declined while processing this enrollment.",
        "payment_failed",
        course
      );
    }

    throw err;
  }
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
