import React, { useState } from "react";
import { Lead } from "../typography/Typography";
import { Spacer } from "../spacer/Spacer";
import { Button } from "../button/Button";
import { Row } from "../flex/Flex";
import { Spinner } from "../spinner/Spinner";
import { EnrollmentRow } from "./EnrollmentRow";
import { Input } from "../input/Input";
import { Modal } from "../modal/Modal";
import { SetupElement } from "../stripe/SetupElement";
import { Section } from "../form/Section";
import { getStripePromise } from "../../utils/stripeClient";

export const EnrollmentsSection = ({
  loading,
  enrollments,
  createEnrollment,
  onCreateCourseClick,
}) => {
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingInviteCode, setPendingInviteCode] = useState("");
  const [paymentModalCourse, setPaymentModalCourse] = useState(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [paymentModalError, setPaymentModalError] = useState(null);
  const [settingUpPaymentMethod, setSettingUpPaymentMethod] = useState(false);
  const [paymentModalSuccess, setPaymentModalSuccess] = useState(false);
  const enrollmentsList = enrollments ?? [];

  const resetPaymentModalState = () => {
    setShowPaymentModal(false);
    setPaymentModalError(null);
    setPendingInviteCode("");
    setPaymentModalCourse(null);
    setSettingUpPaymentMethod(false);
    setPaymentModalSuccess(false);
  };

  const attemptJoinCourse = async (
    rawInviteCode,
    { confirmPayment = false, paymentIntentId = null } = {}
  ) => {
    const trimmedCode = rawInviteCode.trim();
    if (!trimmedCode || !createEnrollment) return null;
    if (confirmPayment) {
      setConfirmingPayment(true);
      setPaymentModalError(null);
    } else {
      setJoining(true);
      setJoinError(null);
    }
    try {
      const createdEnrollment = await createEnrollment({
        inviteCode: trimmedCode,
        confirmPayment,
        paymentIntentId: paymentIntentId || undefined,
      });
      setInviteCode("");
      setPendingInviteCode("");
      setSettingUpPaymentMethod(false);
      setPaymentModalError(null);
      if (confirmPayment) {
        setPaymentModalSuccess(true);
        setPaymentModalCourse(
          (prev) => prev ?? createdEnrollment?.course ?? null
        );
        setShowPaymentModal(true);
      } else {
        setPaymentModalCourse(null);
        resetPaymentModalState();
      }
      return createdEnrollment;
    } catch (err) {
      if (err?.code === "payment_confirmation_required") {
        setPendingInviteCode(trimmedCode);
        setPaymentModalCourse(err?.payload?.course ?? null);
        setShowPaymentModal(true);
        setPaymentModalSuccess(false);
        setPaymentModalError(null);
        setJoinError(null);
      } else if (confirmPayment && err?.code === "payment_action_required") {
        try {
          const confirmedPaymentIntentId = await handlePaymentActionRequired(
            err?.payload
          );
          if (confirmedPaymentIntentId) {
            return await attemptJoinCourse(trimmedCode, {
              confirmPayment: true,
              paymentIntentId: confirmedPaymentIntentId,
            });
          }
        } catch (actionError) {
          setPaymentModalError(
            actionError?.message ||
              "Unable to authorize your payment. Please try again."
          );
        }
      } else if (
        err?.code === "payment_method_required" ||
        err?.code === "payment_failed"
      ) {
        setPendingInviteCode(trimmedCode);
        setPaymentModalCourse((prev) => prev ?? err?.payload?.course ?? null);
        setShowPaymentModal(true);
        setPaymentModalSuccess(false);
        setPaymentModalError(
          err?.message ?? "Unable to process payment for this enrollment."
        );
      } else {
        setJoinError(err?.message ?? "Failed to join course");
      }
      return null;
    } finally {
      if (confirmPayment) {
        setConfirmingPayment(false);
      } else {
        setJoining(false);
      }
    }
  };

  const handlePaymentActionRequired = async (payload) => {
    const clientSecret = payload?.clientSecret;
    const publishableKey = payload?.publishableKey;
    const intentId = payload?.paymentIntentId;
    if (!clientSecret || !publishableKey || !intentId) {
      throw new Error(
        "Unable to continue payment authorization. Please try again."
      );
    }

    const stripePromise = getStripePromise(publishableKey);
    if (!stripePromise) {
      throw new Error("Unable to load Stripe to continue authorization.");
    }
    const stripe = await stripePromise;
    if (!stripe) {
      throw new Error("Unable to load Stripe to continue authorization.");
    }

    const result = await stripe.confirmCardPayment(clientSecret);
    if (result.error) {
      throw new Error(
        result.error.message || "Unable to authorize this payment."
      );
    }

    if (result.paymentIntent?.status !== "succeeded") {
      throw new Error(
        "Payment authorization did not finish. Please try again."
      );
    }

    return result.paymentIntent.id || intentId;
  };

  const handleJoinCourse = async () => {
    await attemptJoinCourse(inviteCode);
  };

  const handlePaymentMethodSaved = () => {
    setPaymentModalError(null);
  };

  const handleConfirmPayment = async () => {
    const codeToRetry = pendingInviteCode || inviteCode;
    if (!codeToRetry) return;
    await attemptJoinCourse(codeToRetry, { confirmPayment: true });
  };

  if (loading) {
    return (
      <Row>
        <Spinner />
        <Lead>Enrollments loading...</Lead>
      </Row>
    );
  }

  return (
    <div>
      {enrollmentsList.length === 0 ? (
        <>
          <Lead>No enrollments</Lead>
          <Spacer />
        </>
      ) : (
        <>
          <Lead>Here are your enrollments</Lead>
          <Spacer />
          <div>
            {enrollmentsList.map((enrollment) => (
              <EnrollmentRow
                key={
                  enrollment.id ?? enrollment.courseId ?? enrollment.course?.id
                }
                enrollment={enrollment}
              />
            ))}
          </div>
        </>
      )}

      <Spacer size={3} />
      <Lead>Have an invite code?</Lead>
      <Spacer />
      <Input
        label="Enter invite code"
        value={inviteCode}
        onChange={(event) => {
          setInviteCode(event.target.value);
          if (joinError) {
            setJoinError(null);
          }
        }}
        placeholder="e.g., STU-1A2B3C"
      />
      <Spacer />
      <Button
        variant="primary"
        disabled={!inviteCode.trim() || joining}
        onClick={handleJoinCourse}
      >
        {joining ? "Joining..." : "Join course"}
      </Button>
      {joinError && (
        <p style={{ color: "#b00020", marginTop: 8 }}>{joinError}</p>
      )}
      <Modal
        title="Confirm enrollment payment"
        open={showPaymentModal}
        onClose={resetPaymentModalState}
        footer={
          paymentModalSuccess ? (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="primary" onClick={resetPaymentModalState}>
                Close
              </Button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={resetPaymentModalState} disabled={confirmingPayment}>
                Cancel
              </Button>
              {!settingUpPaymentMethod && (
                <Button
                  variant="primary"
                  onClick={handleConfirmPayment}
                  disabled={
                    confirmingPayment || !pendingInviteCode || paymentModalSuccess
                  }
                >
                  {confirmingPayment ? "Charging..." : "Confirm and join"}
                </Button>
              )}
            </div>
          )
        }
      >
        <Section
          title={
            paymentModalCourse?.name
              ? `Finish joining ${paymentModalCourse.name}`
              : "Payment method"
          }
          last
          subtitle={
            <>
              <p style={{ marginBottom: 8 }}>
                We&apos;ll charge $20 before you join{" "}
                {paymentModalCourse?.name ?? "this course"}.
              </p>
              <p>
                Stripe securely processes the payment and emails you a receipt
                as soon as it succeeds.
              </p>
            </>
          }
        >
          {paymentModalSuccess ? (
            <div>
              <Spacer size={2} />
              <p style={{ margin: 0 }}>
                Payment confirmed! You&apos;re enrolled in{" "}
                {paymentModalCourse?.name ?? "this course"}.
              </p>
              <Spacer size={1} />
              <p style={{ margin: 0 }}>
                You can close this window to continue exploring FeatureBench.
              </p>
            </div>
          ) : (
            <>
              <Spacer size={2} />
              <SetupElement
                allowUpdatingPaymentMethod
                onReady={handlePaymentMethodSaved}
                onSettingUpPaymentMethodChange={setSettingUpPaymentMethod}
              />
              {paymentModalError && (
                <>
                  <Spacer size={1} />
                  <p
                    style={{
                      margin: 0,
                      color: "var(--danger-text, #c62828)",
                    }}
                  >
                    {paymentModalError}
                  </p>
                </>
              )}
            </>
          )}
        </Section>
      </Modal>
    </div>
  );
};
