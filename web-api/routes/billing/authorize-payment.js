import { prisma } from "#prisma";
import { withAuth } from "#withAuth";
import { getStripeClient, getStripePublishableKey } from "../../util/stripe.js";
import { resolveEnrollmentFollowUps } from "../../services/enrollmentFollowUps.js";

const getUserIdFromRequest = (req) => req.user?.localUserId ?? req.user?.id;

const buildResponseForStatus = async ({ res, paymentIntent }) => {
  if (!paymentIntent) {
    return res
      .status(404)
      .json({ error: "payment_intent_not_found", status: "not_found" });
  }

  if (paymentIntent.status === "requires_action") {
    const publishableKey = getStripePublishableKey();
    return res.json({
      status: "requires_action",
      clientSecret: paymentIntent.client_secret,
      publishableKey,
    });
  }

  if (paymentIntent.status === "requires_payment_method") {
    const publishableKey = getStripePublishableKey();
    return res.json({
      status: "requires_payment_method",
      clientSecret: paymentIntent.client_secret,
      publishableKey,
    });
  }

  if (paymentIntent.status === "succeeded") {
    return res.json({
      status: "succeeded",
      paymentIntentId: paymentIntent.id,
    });
  }

  return res.json({
    status: paymentIntent.status,
    message: "Payment is currently processing. Please try again soon.",
  });
};

const retrieveNotificationForUser = async ({ notificationId, userId }) => {
  if (!notificationId || !userId) return null;
  return prisma.notification.findFirst({
    where: {
      id: notificationId,
      userId,
      deleted: false,
    },
  });
};

const clearPaymentNotification = async (notification) => {
  if (!notification?.id) {
    return;
  }

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      readAt: notification.readAt ?? new Date(),
      deleted: true,
    },
  });
};

const handleSuccessfulAuthorization = async ({ notification, paymentIntent }) => {
  const metadata = paymentIntent?.metadata ?? {};
  const enrollmentId = metadata?.enrollmentId || null;
  const studentId = metadata?.studentUserId || null;
  const courseId = metadata?.courseId || null;

  const promises = [];
  if (notification) {
    promises.push(clearPaymentNotification(notification));
  }
  if (enrollmentId || (studentId && courseId)) {
    promises.push(
      resolveEnrollmentFollowUps({
        enrollmentId: enrollmentId || undefined,
        studentId: studentId || undefined,
        courseId: courseId || undefined,
      })
    );
  }

  if (promises.length) {
    await Promise.all(promises);
  }
};

export const post = [
  withAuth,
  async (req, res) => {
    const { notificationId, paymentIntentId, checkStatusOnly = false } =
      req.body ?? {};
    const userId = getUserIdFromRequest(req);
    if (!notificationId || !userId) {
      return res.status(400).json({ error: "missing_parameters" });
    }

    const notification = await retrieveNotificationForUser({
      notificationId,
      userId,
    });
    if (!notification) {
      return res.status(404).json({ error: "notification_not_found" });
    }

    const storedPaymentIntentId =
      notification?.data && typeof notification.data === "object"
        ? notification.data.paymentIntentId ?? null
        : null;
    const targetPaymentIntentId =
      typeof paymentIntentId === "string" && paymentIntentId
        ? paymentIntentId
        : storedPaymentIntentId;

    if (!targetPaymentIntentId) {
      return res
        .status(400)
        .json({ error: "missing_payment_intent", status: "invalid_request" });
    }

    const stripe = getStripeClient();
    let paymentIntent;

    try {
      if (checkStatusOnly) {
        paymentIntent = await stripe.paymentIntents.retrieve(
          targetPaymentIntentId
        );
      } else {
        const manualAuthorizationMetadata = {
          manualAuthorizationFlow: "teacher_portal",
          manualAuthorizationLastAttemptAt: new Date().toISOString(),
        };
        if (userId) {
          manualAuthorizationMetadata.manualAuthorizationUserId =
            String(userId);
        }

        let mergedMetadata = manualAuthorizationMetadata;
        try {
          const currentPaymentIntent = await stripe.paymentIntents.retrieve(
            targetPaymentIntentId
          );
          if (currentPaymentIntent?.metadata) {
            mergedMetadata = {
              ...currentPaymentIntent.metadata,
              ...manualAuthorizationMetadata,
            };
          }
        } catch (metadataRetrieveError) {
          console.warn(
            "Unable to retrieve payment intent metadata before manual authorization",
            metadataRetrieveError
          );
        }

        try {
          await stripe.paymentIntents.update(targetPaymentIntentId, {
            metadata: mergedMetadata,
          });
        } catch (metadataUpdateError) {
          console.warn(
            "Unable to set manual authorization metadata before confirmation",
            metadataUpdateError
          );
        }

        paymentIntent = await stripe.paymentIntents.confirm(
          targetPaymentIntentId
        );
      }
    } catch (err) {
      if (err?.payment_intent) {
        paymentIntent = err.payment_intent;
      } else {
        throw err;
      }
    }

    if (
      paymentIntent?.metadata?.teacherUserId &&
      paymentIntent.metadata.teacherUserId !== userId
    ) {
      return res.status(403).json({ error: "forbidden" });
    }

    if (paymentIntent?.status === "succeeded") {
      await handleSuccessfulAuthorization({ notification, paymentIntent });
    }

    return buildResponseForStatus({
      res,
      paymentIntent,
    });
  },
];
