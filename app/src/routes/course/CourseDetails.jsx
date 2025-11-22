import React, { useEffect, useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { Card } from "../../components/card/Card";
import { Spacer } from "../../components/spacer/Spacer";
import { H2 } from "../../components/typography/Typography";
import { Button } from "../../components/button/Button";
import { Modal } from "../../components/modal/Modal";
import { SetupElement } from "../../components/stripe/SetupElement";
import setupStyles from "../../components/stripe/SetupElement.module.css";
import { fetchJson } from "../../utils/fetchJson";
import { Section } from "../../components/form/Section";
import { CanvasIntegrationContent } from "../../components/integrations/CanvasIntegrationContent";

const maskCode = (value) => {
  if (!value) return "";
  return "•".repeat(Math.max(value.length, 8));
};

const smallButtonStyle = {
  padding: "4px 12px",
  fontSize: 12,
  minHeight: 0,
};

const billingSchemeCopy = {
  PER_COURSE: {
    title: "The course pays for student access.",
    description:
      "Your saved payment method will be charged $12 per enrolled student. This billing scheme cannot be changed.",
  },
  PER_STUDENT: {
    title: "Students pay for their own access.",
    description:
      "Each student is charged $20 when they enroll. This billing scheme cannot be changed.",
  },
};

export const CourseDetails = () => {
  const { courseId, enrollment, regenerateInviteCode, hasStaffPrivileges } =
    useOutletContext();
  const navigate = useNavigate();
  const course = enrollment?.course ?? {};
  const isStaff =
    typeof hasStaffPrivileges === "boolean"
      ? hasStaffPrivileges
      : ["TEACHER", "TA"].includes(enrollment?.type ?? "");
  const isTeacher = (enrollment?.type ?? "") === "TEACHER";
  const [studentVisible, setStudentVisible] = useState(false);
  const [taVisible, setTaVisible] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [taLoading, setTaLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false);
  const [paymentMethodError, setPaymentMethodError] = useState(null);
  const [paymentMethodRefreshIndex, setPaymentMethodRefreshIndex] = useState(0);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [canvasModalOpen, setCanvasModalOpen] = useState(false);

  if (!isStaff) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  useEffect(() => {
    setStudentVisible(false);
  }, [course.studentInviteCode]);

  useEffect(() => {
    setTaVisible(false);
  }, [course.taInviteCode]);

  useEffect(() => {
    if (!isTeacher || course.billingScheme !== "PER_COURSE") {
      return;
    }

    let isCancelled = false;
    const loadPaymentMethod = async () => {
      setPaymentMethodLoading(true);
      setPaymentMethodError(null);
      try {
        const payload = await fetchJson("/api/billing/payment-method");
        if (!isCancelled) {
          setPaymentMethod(payload?.paymentMethod ?? null);
        }
      } catch (err) {
        if (!isCancelled) {
          setPaymentMethod(null);
          setPaymentMethodError(
            err?.message || "Unable to load your payment method."
          );
        }
      } finally {
        if (!isCancelled) {
          setPaymentMethodLoading(false);
        }
      }
    };

    loadPaymentMethod();

    return () => {
      isCancelled = true;
    };
  }, [isTeacher, course.billingScheme, paymentMethodRefreshIndex]);

  const handleRegenerate = async (inviteType) => {
    if (!regenerateInviteCode) return;
    setError(null);
    const setLoading =
      inviteType === "student" ? setStudentLoading : setTaLoading;
    const setVisible =
      inviteType === "student" ? setStudentVisible : setTaVisible;
    setLoading(true);
    try {
      await regenerateInviteCode(inviteType);
      setVisible(false);
    } catch (err) {
      setError(err?.message ?? "Failed to regenerate invite code");
    } finally {
      setLoading(false);
    }
  };

  const hasInviteCodes = course.studentInviteCode || course.taInviteCode;
  const handlePaymentMethodSaved = (payload) => {
    setPaymentMethod(payload?.paymentMethod ?? null);
    setPaymentMethodError(null);
    setBillingModalOpen(false);
    setPaymentMethodRefreshIndex((value) => value + 1);
  };

  const handleOpenCanvasSetup = () => setCanvasModalOpen(true);

  return (
    <div style={{ padding: 16 }}>
      <H2>Course details</H2>
      <p style={{ color: "#555" }}>
        Reference the course metadata and invite codes at any time.
      </p>
      <Spacer />
      <Card>
        <div style={{ marginBottom: 12 }}>
          <strong>Course name</strong>
          <p style={{ margin: "4px 0 0", color: "#333" }}>{course.name}</p>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Abbreviation</strong>
          <p style={{ margin: "4px 0 0", color: "#333" }}>{course.abbr}</p>
        </div>
        {isTeacher && (
          <div>
            <strong>Billing Scheme</strong>
            <div style={{ margin: "4px 0 0", color: "#333" }}>
              {course.billingScheme ? (
                <>
                  <p style={{ margin: "4px 0 0" }}>
                    {billingSchemeCopy[course.billingScheme]?.title ??
                      "Billing scheme in effect."}
                  </p>
                  <p style={{ margin: "4px 0 0", color: "#555" }}>
                    {billingSchemeCopy[course.billingScheme]?.description ??
                      "Contact support if you believe this is incorrect."}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, color: "#555" }}>
                  Billing has not been configured yet.
                </p>
              )}
            </div>
            {course.billingScheme === "PER_STUDENT" && (
              <>
                <Spacer size={1} />
                <p style={{ margin: 0, color: "#555" }}>
                  Students will submit their own payment information when they
                  join this course.
                </p>
              </>
            )}
            {course.billingScheme === "PER_COURSE" && (
              <>
                <Spacer size={1} />
                {paymentMethodLoading ? (
                  <p style={{ margin: 0, color: "#555" }}>
                    Loading payment method...
                  </p>
                ) : paymentMethod ? (
                  <div className={setupStyles.cardSummary}>
                    <p className={setupStyles.cardSummaryTitle}>
                      Active payment method
                    </p>
                    <p className={setupStyles.cardSummaryMessage}>
                      We will charge your{" "}
                      {paymentMethod.brand
                        ? paymentMethod.brand.charAt(0).toUpperCase() +
                          paymentMethod.brand.slice(1)
                        : "card"}{" "}
                      ending in {paymentMethod.last4}.
                    </p>
                    <Button
                      onClick={() => setBillingModalOpen(true)}
                      style={{ marginTop: 12 }}
                    >
                      Update payment method
                    </Button>
                  </div>
                ) : (
                  <>
                    <p style={{ margin: 0, color: "#555" }}>
                      No payment method has been saved for this course yet.
                    </p>
                    <Spacer size={1} />
                    <Button
                      onClick={() => setBillingModalOpen(true)}
                      style={smallButtonStyle}
                      disabled={paymentMethodLoading}
                    >
                      Add payment method
                    </Button>
                  </>
                )}
                {paymentMethodError && (
                  <>
                    <Spacer size={0.5} />
                    <p
                      style={{
                        margin: 0,
                        color: "var(--danger-text, #c62828)",
                      }}
                    >
                      {paymentMethodError}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
        {hasStaffPrivileges && (
          <>
            <Spacer size={2} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <strong>Canvas integration</strong>
              <p style={{ margin: 0, color: "#555" }}>
                Walk through the Canvas connection checklist any time.
              </p>
              <Button
                onClick={handleOpenCanvasSetup}
                style={{ alignSelf: "flex-start" }}
              >
                Open Canvas integration setup
              </Button>
            </div>
          </>
        )}
      </Card>
      {isTeacher &&
        (hasInviteCodes ? (
          <>
            <Spacer size={2} />
            <Card>
              <div style={{ marginBottom: 12 }}>
                <strong>Invite codes</strong>
                <p style={{ margin: "4px 0 0", color: "#555" }}>
                  Share the appropriate code depending on the role of the person
                  joining the course.
                </p>
              </div>
              {course.studentInviteCode && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      color: "#777",
                    }}
                  >
                    Student code
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <code style={{ fontSize: 16 }}>
                      {studentVisible
                        ? course.studentInviteCode
                        : maskCode(course.studentInviteCode)}
                    </code>
                    <Button
                      onClick={() => setStudentVisible((prev) => !prev)}
                      style={smallButtonStyle}
                    >
                      {studentVisible ? "Hide" : "Show"}
                    </Button>
                    <Button
                      onClick={() => handleRegenerate("student")}
                      disabled={studentLoading}
                      style={smallButtonStyle}
                    >
                      {studentLoading ? "Regenerating..." : "Regenerate"}
                    </Button>
                  </div>
                </div>
              )}
              {course.taInviteCode && (
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      textTransform: "uppercase",
                      color: "#777",
                    }}
                  >
                    TA / instructor code
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <code style={{ fontSize: 16 }}>
                      {taVisible
                        ? course.taInviteCode
                        : maskCode(course.taInviteCode)}
                    </code>
                    <Button
                      onClick={() => setTaVisible((prev) => !prev)}
                      style={smallButtonStyle}
                    >
                      {taVisible ? "Hide" : "Show"}
                    </Button>
                    <Button
                      onClick={() => handleRegenerate("ta")}
                      disabled={taLoading}
                      style={smallButtonStyle}
                    >
                      {taLoading ? "Regenerating..." : "Regenerate"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </>
        ) : (
          <>
            <Spacer size={2} />
            <Card>
              <p style={{ margin: 0, color: "#555" }}>
                Invite codes will appear here once they are generated for this
                course.
              </p>
            </Card>
          </>
        ))}
      {error && (
        <>
          <Spacer />
          <p style={{ color: "#b00020" }}>{error}</p>
        </>
      )}
      {hasStaffPrivileges && (
        <Modal
          title="Connect FeatureBench to Canvas"
          open={canvasModalOpen}
          onClose={() => setCanvasModalOpen(false)}
          footer={
            <Button onClick={() => setCanvasModalOpen(false)}>Close</Button>
          }
        >
          <CanvasIntegrationContent />
        </Modal>
      )}
      {isTeacher && course.billingScheme === "PER_COURSE" && (
        <Modal
          title="Manage payment method"
          open={billingModalOpen}
          onClose={() => setBillingModalOpen(false)}
          footer={
            <Button onClick={() => setBillingModalOpen(false)}>Close</Button>
          }
        >
          <Section title="Payment method" last>
            <p style={{ margin: 0, color: "#555" }}>
              Update the card used to pay for students enrolled in this course.
            </p>
            <Spacer size={2} />
            <SetupElement
              onReady={handlePaymentMethodSaved}
              loadSavedPaymentMethod={false}
            />
          </Section>
        </Modal>
      )}
    </div>
  );
};
