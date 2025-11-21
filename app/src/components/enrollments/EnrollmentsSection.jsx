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
  const enrollmentsList = enrollments ?? [];

  const attemptJoinCourse = async (
    rawInviteCode,
    { confirmPayment = false } = {}
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
      });
      setInviteCode("");
      setPendingInviteCode("");
      setPaymentModalCourse(null);
      setShowPaymentModal(false);
      setPaymentModalError(null);
      return createdEnrollment;
    } catch (err) {
      if (err?.code === "payment_confirmation_required") {
        setPendingInviteCode(trimmedCode);
        setPaymentModalCourse(err?.payload?.course ?? null);
        setShowPaymentModal(true);
        setPaymentModalError(null);
        setJoinError(null);
      } else if (
        err?.code === "payment_method_required" ||
        err?.code === "payment_failed"
      ) {
        setPendingInviteCode(trimmedCode);
        setPaymentModalCourse((prev) => prev ?? err?.payload?.course ?? null);
        setShowPaymentModal(true);
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
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentModalError(null);
          setPendingInviteCode("");
          setPaymentModalCourse(null);
        }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentModalError(null);
                setPendingInviteCode("");
                setPaymentModalCourse(null);
              }}
              disabled={confirmingPayment}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmPayment}
              disabled={confirmingPayment || !pendingInviteCode}
            >
              {confirmingPayment ? "Charging..." : "Confirm and join"}
            </Button>
          </div>
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
          <Spacer size={2} />
          <SetupElement
            allowUpdatingPaymentMethod
            onReady={handlePaymentMethodSaved}
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
        </Section>
      </Modal>
    </div>
  );
};
