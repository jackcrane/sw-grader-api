import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { ensureStripeCustomerForUser } from "../../../services/stripeCustomers.js";
import { getStripeClient } from "../../../util/stripe.js";
import { ensureTeacherEnrollment } from "./helpers.js";

const formatName = (user) => {
  if (!user) return "Unknown student";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unknown student";
};

const pendingStatuses = new Set([
  "processing",
  "requires_action",
  "requires_confirmation",
  "requires_payment_method",
]);

export const get = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureTeacherEnrollment(courseId, userId);
    if (!enrollment) {
      return res
        .status(403)
        .json({ error: "Only teachers can view billing history." });
    }

    const course = enrollment.course;
    if (!course || course.billingScheme !== "PER_COURSE") {
      return res.json({
        items: [],
        summary: {
          totalChargedCents: 0,
          totalPendingCents: 0,
          totalFailedCents: 0,
        },
      });
    }

    let billingUser = null;
    if (course.primaryTeacherUserId) {
      billingUser = await prisma.user.findUnique({
        where: { id: course.primaryTeacherUserId },
      });
    }

    if (!billingUser) {
      const fallbackTeacher = await prisma.enrollment.findFirst({
        where: {
          courseId,
          type: "TEACHER",
          deleted: false,
        },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });
      billingUser = fallbackTeacher?.user ?? null;
    }

    if (!billingUser) {
      return res.json({
        items: [],
        summary: {
          totalChargedCents: 0,
          totalPendingCents: 0,
          totalFailedCents: 0,
        },
      });
    }

    const stripe = getStripeClient();
    const { customerId } = await ensureStripeCustomerForUser(billingUser);

    const paymentIntents = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 100,
      expand: [],
    });

    const matchingIntents = paymentIntents.data.filter((intent) => {
      const metadataCourseId = intent?.metadata?.courseId;
      if (!metadataCourseId) return false;
      return String(metadataCourseId) === String(courseId);
    });

    const studentIds = [
      ...new Set(
        matchingIntents
          .map((intent) => intent?.metadata?.studentUserId)
          .filter(Boolean)
      ),
    ];

    const students =
      studentIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: studentIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];

    const studentById = new Map(
      students.map((student) => [
        student.id,
        {
          name: formatName(student),
          email: student.email ?? "",
          id: student.id,
        },
      ])
    );

    const summary = {
      totalChargedCents: 0,
      totalPendingCents: 0,
      totalFailedCents: 0,
    };

    const items = matchingIntents.map((intent) => {
      const amount = intent.amount ?? 0;
      if (intent.status === "succeeded") {
        summary.totalChargedCents += intent.amount_received ?? amount;
      } else if (pendingStatuses.has(intent.status)) {
        summary.totalPendingCents += amount;
      } else if (intent.status === "canceled") {
        summary.totalFailedCents += amount;
      }

      const student =
        studentById.get(intent?.metadata?.studentUserId) ?? null;
      return {
        id: intent.id,
        created: intent.created,
        amountCents: amount,
        status: intent.status,
        description: intent.description ?? "",
        studentName: student?.name || "Unknown student",
        studentEmail: student?.email || "",
        studentId: student?.id || intent?.metadata?.studentUserId || "",
      };
    });

    return res.json({ items, summary });
  },
];
