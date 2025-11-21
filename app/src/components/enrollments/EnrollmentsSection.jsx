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
  const [studentBillingEnrollment, setStudentBillingEnrollment] =
    useState(null);
  const enrollmentsList = enrollments ?? [];

  const handleJoinCourse = async () => {
    const trimmedCode = inviteCode.trim();
    if (!trimmedCode || !createEnrollment) return;
    setJoining(true);
    setJoinError(null);
    try {
      const createdEnrollment = await createEnrollment({
        inviteCode: trimmedCode,
      });
      setInviteCode("");
      if (
        (createdEnrollment?.type ?? "").toUpperCase() === "STUDENT" &&
        createdEnrollment?.course?.billingScheme === "PER_STUDENT"
      ) {
        setStudentBillingEnrollment(createdEnrollment);
      }
    } catch (err) {
      setJoinError(err?.message ?? "Failed to join course");
    } finally {
      setJoining(false);
    }
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
        title="Add a payment method"
        open={Boolean(studentBillingEnrollment)}
        onClose={() => setStudentBillingEnrollment(null)}
        footer={
          <Button onClick={() => setStudentBillingEnrollment(null)}>
            Close
          </Button>
        }
      >
        <Section
          title="Payment method"
          last
          subtitle={
            <>
              <p
                style={{
                  marginBottom: 8,
                }}
              >
                You will be charged $20 to enroll in this course.
              </p>
              <p>
                FeatureBench partners with Stripe to securely process payments.
              </p>
            </>
          }
        >
          <Spacer size={2} />
          <SetupElement
            loadSavedPaymentMethod={false}
            onReady={() => setStudentBillingEnrollment(null)}
          />
        </Section>
      </Modal>
    </div>
  );
};
