import React, { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./Header.module.css";
import { Modal } from "../modal/Modal";
import { Section } from "../form/Section";
import { Button } from "../button/Button";
import { Spacer } from "../spacer/Spacer";
import { SetupElement } from "../stripe/SetupElement";
import { getStripePromise } from "../../utils/stripeClient";
import { useSavedPaymentMethod } from "../../hooks/useSavedPaymentMethod";

export const PaymentAuthorizationModal = ({
  state,
  onClose,
  onAuthorizationSuccess,
  updateState,
}) => {
  const hasSession =
    state &&
    state.notification &&
    state.notificationId &&
    state.requestAuthorization;
  const successState = state?.status === "success";
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [charging, setCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");
  const [setupKey, setSetupKey] = useState(0);
  const stripePromise = useMemo(() => {
    if (!state?.publishableKey) return null;
    return getStripePromise(state.publishableKey);
  }, [state?.publishableKey]);

  const {
    paymentMethod,
    loading,
    error: paymentMethodError,
    refresh,
  } = useSavedPaymentMethod({
    enabled: Boolean(hasSession),
    reloadKey: state?.notificationId,
  });

  useEffect(() => {
    if (!hasSession) return;
    setShowSetupForm(false);
    setChargeError("");
    setSetupKey((value) => value + 1);
  }, [hasSession, state?.notificationId]);

  useEffect(() => {
    if (!successState && !loading && !paymentMethod) {
      setShowSetupForm(true);
    }
  }, [loading, paymentMethod, successState]);

  const processAuthorizationResponse = useCallback(
    async (response) => {
      if (!response) {
        throw new Error("Unable to authorize this payment.");
      }

      if (response.clientSecret) {
        updateState?.({ clientSecret: response.clientSecret });
      }
      if (response.publishableKey) {
        updateState?.({ publishableKey: response.publishableKey });
      }

      if (response.status === "succeeded") {
        await onAuthorizationSuccess?.(state.notificationId);
        return { done: true };
      }

      if (response.status === "requires_action") {
        const publishableKey =
          response.publishableKey ?? state.publishableKey ?? null;
        const clientSecret =
          response.clientSecret ?? state.clientSecret ?? null;
        if (!publishableKey || !clientSecret) {
          throw new Error("Unable to continue authorization.");
        }
        const stripePromise = getStripePromise(publishableKey);
        if (!stripePromise) {
          throw new Error("Unable to load Stripe to continue authorization.");
        }
        const stripe = await stripePromise;
        if (!stripe) {
          throw new Error("Unable to load Stripe to continue authorization.");
        }
        const confirmResult = await stripe.confirmCardPayment(clientSecret);
        if (confirmResult.error) {
          throw new Error(
            confirmResult.error.message || "Unable to authorize the payment."
          );
        }
        const finalResponse = await state.requestAuthorization({
          checkStatusOnly: true,
        });
        return processAuthorizationResponse(finalResponse);
      }

      if (response.status === "requires_payment_method") {
        setShowSetupForm(true);
        throw new Error(
          response.message ||
            "The saved payment method was declined. Add a new card to continue."
        );
      }

      throw new Error(
        response.message ||
          "Unable to authorize this payment right now. Try again soon."
      );
    },
    [onAuthorizationSuccess, state, updateState]
  );

  const handleChargeSavedPaymentMethod = useCallback(async () => {
    if (!state?.clientSecret || !stripePromise || !paymentMethod?.id) {
      setChargeError(
        "Unable to load your saved payment method for confirmation."
      );
      return;
    }
    setCharging(true);
    setChargeError("");
    try {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Unable to load Stripe to authorize the payment.");
      }
      const result = await stripe.confirmCardPayment(state.clientSecret, {
        payment_method: paymentMethod.id,
      });
      if (result.error) {
        throw new Error(
          result.error.message || "Unable to authorize the payment."
        );
      }
      const finalResponse = await state.requestAuthorization({
        checkStatusOnly: true,
      });
      await processAuthorizationResponse(finalResponse);
    } catch (err) {
      setChargeError(err?.message || "Unable to authorize the payment.");
    } finally {
      setCharging(false);
    }
  }, [paymentMethod?.id, processAuthorizationResponse, state, stripePromise]);

  const handlePaymentMethodSaved = useCallback(async () => {
    await refresh();
    setShowSetupForm(false);
    await handleChargeSavedPaymentMethod();
  }, [handleChargeSavedPaymentMethod, refresh]);

  if (!hasSession) {
    return null;
  }

  const notificationData =
    state.notification && typeof state.notification.data === "object"
      ? state.notification.data
      : {};
  const studentName = notificationData.studentName;
  const courseName = notificationData.courseName;

  return (
    <Modal
      open={Boolean(hasSession)}
      onClose={onClose}
      title="Authorize payment"
      closeOnBackdrop={false}
    >
      <Section title="Authorize payment">
        <div className={styles.authorizationModalContent}>
          {successState ? (
            <AuthorizationSuccess onClose={onClose} />
          ) : (
            <AuthorizationForm
              studentName={studentName}
              courseName={courseName}
              loadingPaymentMethod={loading}
              paymentMethod={paymentMethod}
              paymentMethodError={paymentMethodError}
              onChargeSaved={handleChargeSavedPaymentMethod}
              charging={charging}
              stripeReady={Boolean(stripePromise)}
              chargeError={chargeError}
              showSetupForm={showSetupForm}
              onToggleSetup={() => setShowSetupForm((value) => !value)}
              setupKey={setupKey}
              onPaymentMethodSaved={handlePaymentMethodSaved}
            />
          )}
        </div>
      </Section>
    </Modal>
  );
};

const AuthorizationSuccess = ({ onClose }) => (
  <div className={styles.authorizationSuccess}>
    <p className={styles.authorizationSuccessTitle}>Payment complete</p>
    <p className={styles.authorizationSuccessMessage}>
      The payment was successful and the student is now fully enrolled in your
      course.
    </p>
    <Button
      variant="primary"
      type="button"
      className={styles.authorizationSubmit}
      onClick={onClose}
    >
      Close
    </Button>
  </div>
);

const AuthorizationForm = ({
  studentName,
  courseName,
  loadingPaymentMethod,
  paymentMethod,
  paymentMethodError,
  onChargeSaved,
  charging,
  stripeReady,
  chargeError,
  showSetupForm,
  onToggleSetup,
  setupKey,
  onPaymentMethodSaved,
}) => (
  <>
    <p className={styles.authorizationIntro}>
      {studentName && courseName
        ? `Charge the saved card for ${studentName}'s enrollment in ${courseName}.`
        : "Charge your saved card to complete this enrollment."}
    </p>
    <div className={styles.authorizationSummary}>
      {loadingPaymentMethod ? (
        <p>Loading your saved payment method…</p>
      ) : paymentMethod ? (
        <p>
          Using {paymentMethod.brand?.toUpperCase() || "card"} ending in{" "}
          {paymentMethod.last4}.
        </p>
      ) : (
        <p>No saved payment method found.</p>
      )}
      {paymentMethodError && (
        <p className={styles.authorizationError}>{paymentMethodError}</p>
      )}
    </div>
    <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
      <Button
        variant="primary"
        type="button"
        onClick={onChargeSaved}
        disabled={
          charging || loadingPaymentMethod || !paymentMethod || !stripeReady
        }
        style={{ fontSize: "0.8em" }}
      >
        {charging ? "Authorizing…" : "Charge saved payment method"}
      </Button>
      <Button
        type="button"
        onClick={onToggleSetup}
        style={{ fontSize: "0.8em" }}
      >
        {showSetupForm ? "Hide card form" : "Use a different card"}
      </Button>
    </div>
    {chargeError && <p className={styles.authorizationError}>{chargeError}</p>}
    {showSetupForm && (
      <div className={styles.authorizationSetupWrapper}>
        <SetupElement
          key={setupKey}
          loadSavedPaymentMethod={false}
          allowUpdatingPaymentMethod={false}
          onReady={onPaymentMethodSaved}
        />
      </div>
    )}
  </>
);
