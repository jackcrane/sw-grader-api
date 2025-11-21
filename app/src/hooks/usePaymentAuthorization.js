import { useCallback, useState } from "react";
import { fetchJson } from "../utils/fetchJson";
import { getStripePromise } from "../utils/stripeClient";

export const usePaymentAuthorization = ({ onSuccess } = {}) => {
  const [notificationActions, setNotificationActions] = useState({});
  const [authorizationModal, setAuthorizationModal] = useState(null);

  const updateActionState = useCallback((notificationId, updates) => {
    if (!notificationId) return;
    setNotificationActions((prev) => ({
      ...prev,
      [notificationId]: {
        ...(prev[notificationId] ?? {}),
        ...updates,
      },
    }));
  }, []);

  const clearActionState = useCallback((notificationId) => {
    if (!notificationId) return;
    setNotificationActions((prev) => {
      if (!prev[notificationId]) return prev;
      const next = { ...prev };
      delete next[notificationId];
      return next;
    });
  }, []);

  const markAuthorizationSuccess = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      updateActionState(notificationId, {
        loading: false,
        success: true,
        error: null,
      });
      try {
        await onSuccess?.();
      } finally {
        clearActionState(notificationId);
      }
    },
    [clearActionState, onSuccess, updateActionState]
  );

  const closeAuthorizationModal = useCallback(() => {
    setAuthorizationModal(null);
  }, []);

  const updateAuthorizationModalState = useCallback((updates) => {
    setAuthorizationModal((prev) => (prev ? { ...prev, ...updates } : prev));
  }, []);

  const handleModalSuccess = useCallback(
    async (notificationId) => {
      await markAuthorizationSuccess(notificationId);
      setAuthorizationModal((prev) =>
        prev ? { ...prev, status: "success" } : prev
      );
    },
    [markAuthorizationSuccess]
  );

  const authorizePaymentNotification = useCallback(
    async (notification) => {
      const notificationId = notification?.id;
      const paymentIntentId = notification?.data?.paymentIntentId;
      if (!notificationId || !paymentIntentId) {
        return false;
      }

      updateActionState(notificationId, {
        loading: true,
        error: null,
        success: false,
      });

      const requestAuthorization = (extraBody = {}) =>
        fetchJson("/api/billing/authorize-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId,
            paymentIntentId,
            ...extraBody,
          }),
        });

      const openModal = ({ clientSecret, publishableKey }) => {
        setAuthorizationModal({
          notification,
          notificationId,
          paymentIntentId,
          clientSecret,
          publishableKey,
          requestAuthorization,
          status: "form",
        });
        updateActionState(notificationId, {
          loading: false,
          error: null,
          success: false,
        });
      };

      const ensureStripe = async (publishableKey) => {
        if (!publishableKey) {
          throw new Error("Unable to load Stripe to authorize the payment.");
        }
        const stripePromise = getStripePromise(publishableKey);
        if (!stripePromise) {
          throw new Error("Unable to load Stripe to authorize the payment.");
        }
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Unable to load Stripe to authorize the payment.");
        }
        return stripe;
      };

      const processResponse = async (response) => {
        if (!response) {
          throw new Error("Unable to authorize this payment.");
        }

        if (response.status === "succeeded") {
          await markAuthorizationSuccess(notificationId);
          return true;
        }

        if (response.status === "requires_action") {
          const stripe = await ensureStripe(response.publishableKey);
          const confirmResult = await stripe.confirmCardPayment(
            response.clientSecret
          );

          if (confirmResult.error) {
            throw new Error(
              confirmResult.error.message || "Unable to authorize the payment."
            );
          }

          const resultStatus = confirmResult.paymentIntent?.status;
          if (resultStatus === "succeeded") {
            const finalResponse = await requestAuthorization({
              checkStatusOnly: true,
            });
            return processResponse(finalResponse);
          }

          if (resultStatus === "requires_payment_method") {
            const nextClientSecret =
              confirmResult.paymentIntent?.client_secret ??
              response.clientSecret;
            openModal({
              clientSecret: nextClientSecret,
              publishableKey: response.publishableKey,
            });
            return false;
          }

          throw new Error(
            "Verification was not completed. Please try again to authorize the payment."
          );
        }

        if (response.status === "requires_payment_method") {
          openModal({
            clientSecret: response.clientSecret,
            publishableKey: response.publishableKey,
          });
          return false;
        }

        throw new Error(
          response.message ||
            "Unable to authorize this payment right now. Try again shortly."
        );
      };

      try {
        const response = await requestAuthorization();
        return await processResponse(response);
      } catch (err) {
        updateActionState(notificationId, {
          loading: false,
          error: err?.message || "Unable to authorize the payment.",
          success: false,
        });
        return false;
      }
    },
    [markAuthorizationSuccess, updateActionState]
  );

  return {
    authorizationModal,
    authorizePaymentNotification,
    closeAuthorizationModal,
    handleModalSuccess,
    notificationActions,
    updateAuthorizationModalState,
  };
};
