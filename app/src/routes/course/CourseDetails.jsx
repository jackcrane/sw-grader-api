import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { Card } from "../../components/card/Card";
import { Spacer } from "../../components/spacer/Spacer";
import { H2 } from "../../components/typography/Typography";
import { Button } from "../../components/button/Button";
import { Input, Select } from "../../components/input/Input";
import { Modal } from "../../components/modal/Modal";
import { SetupElement } from "../../components/stripe/SetupElement";
import setupStyles from "../../components/stripe/SetupElement.module.css";
import { fetchJson } from "../../utils/fetchJson";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { Section } from "../../components/form/Section";
import { SegmentedControl } from "../../components/segmentedControl/SegmentedControl";
import {
  describeLatePolicy,
  hoursToMinutesValue,
  minutesToHoursValue,
  normalizeLatePolicy,
} from "../../utils/latePolicy";
import { describeSubmissionRetentionMode } from "../../utils/submissionRetention";

const maskCode = (value) => {
  if (!value) return "";
  return "•".repeat(Math.max(value.length, 8));
};

const smallButtonStyle = {
  padding: "4px 12px",
  fontSize: 12,
  minHeight: 0,
};

const billingTableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const billingHeaderStyle = {
  padding: "6px",
  borderBottom: "1px solid #e5e5e5",
  textAlign: "left",
  color: "#666",
  fontSize: 11,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const billingCellStyle = {
  padding: "8px 6px",
  borderBottom: "1px solid #eee",
  color: "#333",
  verticalAlign: "top",
};

const escapeCsvValue = (value) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  if (stringValue.includes('"') || stringValue.includes(",") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
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

const formatStaffName = (user) => {
  if (!user) return "Unnamed TA";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed TA";
};
const NEW_STUDENT_ACCESS_OPTIONS = [
  { value: true, label: "Allow new enrollments" },
  { value: false, label: "Block new enrollments" },
];

export const CourseDetails = () => {
  const {
    courseId,
    enrollment,
    regenerateInviteCode,
    hasStaffPrivileges,
    refetchEnrollments,
  } = useOutletContext();
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
  const [billingHistory, setBillingHistory] = useState([]);
  const [billingHistoryLoading, setBillingHistoryLoading] = useState(false);
  const [billingHistoryError, setBillingHistoryError] = useState(null);
  const [billingSummary, setBillingSummary] = useState({
    totalChargedCents: 0,
    totalPendingCents: 0,
    totalFailedCents: 0,
  });
  const [billingHistoryRefreshIndex, setBillingHistoryRefreshIndex] = useState(0);
  const normalizedLatePolicy = useMemo(
    () =>
      normalizeLatePolicy({
        allowLateSubmissions: course?.latePolicyAllowLateSubmissions,
        maxLatenessMinutes: course?.latePolicyMaxLatenessMinutes,
        penaltyPercent: course?.latePolicyPenaltyPercent,
        penaltyType: course?.latePolicyPenaltyType,
      }),
    [course]
  );
  const [lateAllowLateSubmissions, setLateAllowLateSubmissions] = useState(
    normalizedLatePolicy.allowLateSubmissions
  );
  const [lateMaxLatenessHours, setLateMaxLatenessHours] = useState(
    minutesToHoursValue(normalizedLatePolicy.maxLatenessMinutes)
  );
  const [latePenaltyPercent, setLatePenaltyPercent] = useState(
    normalizedLatePolicy.penaltyPercent != null
      ? String(normalizedLatePolicy.penaltyPercent)
      : ""
  );
  const [latePenaltyType, setLatePenaltyType] = useState(
    normalizedLatePolicy.penaltyType ?? "FLAT"
  );
  const [submissionRetentionMode, setSubmissionRetentionMode] = useState(
    course?.submissionRetentionMode ?? "BEST"
  );
  const [latePolicySaving, setLatePolicySaving] = useState(false);
  const [latePolicyError, setLatePolicyError] = useState(null);
  const [latePolicySuccess, setLatePolicySuccess] = useState(null);
  const {
    roster: courseRoster = [],
    loading: rosterLoading,
    updateEnrollmentType,
  } = useCourseRoster(courseId, { enabled: isTeacher });
  const fallbackPrimaryTeacherId = useMemo(() => {
    return (
      courseRoster.find((entry) => entry.type === "TEACHER" && entry.user?.id)
        ?.user?.id ?? null
    );
  }, [courseRoster]);
  const primaryTeacherId =
    course.primaryTeacherUserId ?? fallbackPrimaryTeacherId ?? null;
  const isPrimaryTeacher =
    isTeacher &&
    primaryTeacherId != null &&
    primaryTeacherId === enrollment?.userId;
  const canSeePaymentInfo =
    isPrimaryTeacher && course.billingScheme === "PER_COURSE";
  const [adminSelection, setAdminSelection] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState(null);
  const [adminSuccess, setAdminSuccess] = useState(null);
  const taOptions = useMemo(
    () =>
      courseRoster
        .filter((entry) => entry.type === "TA" && entry.user?.id)
        .map((entry) => ({
          value: entry.id,
          label: formatStaffName(entry.user),
        })),
    [courseRoster]
  );
  const additionalAdmin = useMemo(
    () =>
      courseRoster.find(
        (entry) =>
          entry.type === "TEACHER" && entry.user?.id !== enrollment?.userId
      ),
    [courseRoster, enrollment?.userId]
  );
  const additionalAdminOption = additionalAdmin
    ? {
        value: additionalAdmin.id,
        label: formatStaffName(additionalAdmin.user),
      }
    : null;
  const adminSelectOptions = useMemo(
    () => [
      { value: "", label: "None (teacher only)" },
      ...(additionalAdminOption ? [additionalAdminOption] : []),
      ...taOptions,
    ],
    [taOptions, additionalAdminOption]
  );
  const [allowNewEnrollments, setAllowNewEnrollments] = useState(
    course?.allowNewEnrollments ?? true
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsSuccess, setSettingsSuccess] = useState(null);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }),
    []
  );

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
    setLateAllowLateSubmissions(normalizedLatePolicy.allowLateSubmissions);
    setLateMaxLatenessHours(
      minutesToHoursValue(normalizedLatePolicy.maxLatenessMinutes)
    );
    setLatePenaltyPercent(
      normalizedLatePolicy.penaltyPercent != null
        ? String(normalizedLatePolicy.penaltyPercent)
        : ""
    );
    setLatePenaltyType(normalizedLatePolicy.penaltyType ?? "FLAT");
  }, [normalizedLatePolicy]);

  useEffect(() => {
    setSubmissionRetentionMode(course?.submissionRetentionMode ?? "BEST");
  }, [course?.submissionRetentionMode]);

  useEffect(() => {
    if (!isPrimaryTeacher || course.billingScheme !== "PER_COURSE") {
      return;
    }
    setAllowNewEnrollments(course.allowNewEnrollments ?? true);
  }, [course.allowNewEnrollments, isPrimaryTeacher, course.billingScheme]);

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
  }, [isPrimaryTeacher, course.billingScheme, paymentMethodRefreshIndex]);

  useEffect(() => {
    if (!isTeacher || course.billingScheme !== "PER_COURSE") {
      setBillingHistory([]);
      setBillingHistoryLoading(false);
      setBillingHistoryError(null);
      setBillingSummary({
        totalChargedCents: 0,
        totalPendingCents: 0,
        totalFailedCents: 0,
      });
      return;
    }

    let isCancelled = false;
    const loadBillingHistory = async () => {
      setBillingHistoryLoading(true);
      setBillingHistoryError(null);
      try {
        const payload = await fetchJson(
          `/api/courses/${courseId}/billing-history`
        );
        if (isCancelled) return;
        setBillingHistory(payload?.items ?? []);
        setBillingSummary({
          totalChargedCents: payload?.summary?.totalChargedCents ?? 0,
          totalPendingCents: payload?.summary?.totalPendingCents ?? 0,
          totalFailedCents: payload?.summary?.totalFailedCents ?? 0,
        });
      } catch (err) {
        if (!isCancelled) {
          setBillingHistory([]);
          setBillingSummary({
            totalChargedCents: 0,
            totalPendingCents: 0,
            totalFailedCents: 0,
          });
          setBillingHistoryError(
            err?.message || "Unable to load billing history."
          );
        }
      } finally {
        if (!isCancelled) {
          setBillingHistoryLoading(false);
        }
      }
    };

    loadBillingHistory();

    return () => {
      isCancelled = true;
    };
  }, [courseId, isTeacher, course.billingScheme, billingHistoryRefreshIndex]);

  useEffect(() => {
    const handleRefresh = () => {
      setBillingHistoryRefreshIndex((value) => value + 1);
    };

    window.addEventListener("billing-history:refresh", handleRefresh);
    return () => {
      window.removeEventListener("billing-history:refresh", handleRefresh);
    };
  }, []);

  useEffect(() => {
    if (additionalAdmin) {
      setAdminSelection((prev) =>
        prev === additionalAdmin.id ? prev : additionalAdmin.id
      );
    } else {
      setAdminSelection((prev) => (prev ? "" : prev));
    }
  }, [additionalAdmin]);

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

  const latePolicyValidation = useMemo(() => {
    const errors = {
      maxLateness: false,
      penaltyPercent: false,
    };
    if (lateMaxLatenessHours !== "") {
      const hoursValue = Number(lateMaxLatenessHours);
      if (!Number.isFinite(hoursValue) || hoursValue < 0) {
        errors.maxLateness = true;
      } else if (hoursValue * 60 > 10000) {
        errors.maxLateness = true;
      }
    }
    if (
      latePenaltyPercent !== "" &&
      (!Number.isFinite(Number(latePenaltyPercent)) ||
        Number(latePenaltyPercent) < 0 ||
        Number(latePenaltyPercent) > 100)
    ) {
      errors.penaltyPercent = true;
    }
    return {
      ...errors,
      invalid: errors.maxLateness || errors.penaltyPercent,
    };
  }, [lateMaxLatenessHours, latePenaltyPercent]);

  const handleSaveCourseSettings = async () => {
    if (latePolicyValidation.invalid) {
      setSettingsError("Fix the highlighted late policy fields.");
      setSettingsSuccess(null);
      return;
    }
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    try {
      if (course?.allowNewEnrollments !== allowNewEnrollments) {
        await fetchJson(`/api/courses/${courseId}/new-student-access`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            allowNewEnrollments,
          }),
        });
      }

      await fetchJson(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latePolicy: {
            allowLateSubmissions: lateAllowLateSubmissions,
            maxLatenessMinutes: hoursToMinutesValue(lateMaxLatenessHours),
            penaltyPercent:
              latePenaltyPercent === "" ? null : Number(latePenaltyPercent),
            penaltyType:
              latePenaltyPercent !== "" && Number(latePenaltyPercent) > 0
                ? latePenaltyType
                : null,
          },
          submissionRetentionMode,
        }),
      });
      await refetchEnrollments?.();
      setSettingsSuccess("Course settings saved.");
    } catch (err) {
      setSettingsError(err?.message || "Unable to save course settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handlePromoteToAdmin = async () => {
    setAdminSaving(true);
    setAdminError(null);
    setAdminSuccess(null);
    try {
      if (!adminSelection) {
        if (!additionalAdmin) {
          setAdminError("No additional admin is assigned.");
          return;
        }
        await updateEnrollmentType(additionalAdmin.id, "TA");
        setAdminSuccess(
          `${formatStaffName(additionalAdmin.user)} was removed from admin access.`
        );
        setAdminSelection("");
        return;
      }

      if (adminSelection === additionalAdmin?.id) {
        setAdminSuccess("The selected TA already has admin access.");
        return;
      }

      const target = courseRoster.find((entry) => entry.id === adminSelection);
      if (!target || target.type !== "TA") {
        setAdminError("Select an available teaching assistant.");
        return;
      }

      await updateEnrollmentType(adminSelection, "TEACHER");
      setAdminSuccess(`${formatStaffName(target.user)} is now an admin.`);
    } catch (err) {
      setAdminError(err?.message || "Unable to update admin assignment.");
    } finally {
      setAdminSaving(false);
    }
  };

  const formatCurrency = (value) =>
    currencyFormatter.format((Number(value) || 0) / 100);

  const formatBillingStatus = (status) => {
    switch (status) {
      case "succeeded":
        return "Paid";
      case "processing":
        return "Processing";
      case "requires_action":
        return "Action required";
      case "requires_payment_method":
        return "Pending authorization";
      case "requires_confirmation":
        return "Pending confirmation";
      case "canceled":
        return "Canceled";
      default:
        return "Pending";
    }
  };

  const handleDownloadBillingCsv = () => {
    if (!billingHistory.length) return;
    const headers = [
      "payment_intent_id",
      "date_time",
      "student_name",
      "student_email",
      "student_id",
      "description",
      "status",
      "amount",
    ];
    const rows = billingHistory.map((item) => {
      const dateTime = new Date(item.created * 1000).toISOString();
      return [
        item.id,
        dateTime,
        item.studentName || "",
        item.studentEmail || "",
        item.studentId || "",
        item.description || "",
        item.status || "",
        ((Number(item.amountCents) || 0) / 100).toFixed(2),
      ]
        .map(escapeCsvValue)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `course-${courseId}-billing-history.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
        {isPrimaryTeacher && (
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
                {canSeePaymentInfo ? (
                  paymentMethodLoading ? (
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
                  )
                ) : (
                  <p style={{ margin: 0, color: "#555" }}>
                    Payment information is restricted to the primary admin.
                  </p>
                )}
                {paymentMethodError && canSeePaymentInfo && (
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
      </Card>
      {isTeacher && course.billingScheme === "PER_COURSE" && (
        <>
          <Spacer size={2} />
          <Card>
            <div style={{ marginBottom: 12 }}>
              <strong>Billing history</strong>
              <p style={{ margin: "4px 0 0", color: "#555" }}>
                Review enrollment charges billed to this course.
              </p>
            </div>
            {billingHistoryLoading && (
              <p style={{ margin: 0, color: "#555" }}>
                Loading billing history...
              </p>
            )}
            {billingHistoryError && (
              <p style={{ margin: 0, color: "#c62828" }}>
                {billingHistoryError}
              </p>
            )}
            {!billingHistoryLoading &&
              !billingHistoryError &&
              billingHistory.length === 0 && (
                <p style={{ margin: 0, color: "#555" }}>
                  No charges have been recorded yet.
                </p>
              )}
            {!billingHistoryLoading &&
              !billingHistoryError &&
              billingHistory.length > 0 && (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 24,
                      flexWrap: "wrap",
                      marginBottom: 12,
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Current balance
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>
                          {formatCurrency(billingSummary.totalPendingCents)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Total billed
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600 }}>
                          {formatCurrency(billingSummary.totalChargedCents)}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleDownloadBillingCsv}
                      style={smallButtonStyle}
                      disabled={!billingHistory.length}
                    >
                      Download CSV
                    </Button>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={billingTableStyle}
                      data-cy="billing-history-table"
                    >
                      <thead>
                        <tr>
                          <th style={billingHeaderStyle}>Date</th>
                          <th style={billingHeaderStyle}>Student</th>
                          <th style={billingHeaderStyle}>Description</th>
                          <th style={billingHeaderStyle}>Status</th>
                          <th
                            style={{
                              ...billingHeaderStyle,
                              textAlign: "right",
                            }}
                          >
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingHistory.map((item) => (
                          <tr key={item.id}>
                            <td style={billingCellStyle}>
                              {new Date(item.created * 1000).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )}
                            </td>
                            <td style={billingCellStyle}>{item.studentName}</td>
                            <td style={billingCellStyle}>
                              {item.description || "Enrollment charge"}
                            </td>
                            <td style={billingCellStyle}>
                              {formatBillingStatus(item.status)}
                            </td>
                            <td
                              style={{
                                ...billingCellStyle,
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatCurrency(item.amountCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
          </Card>
        </>
      )}
      {isPrimaryTeacher && (
        <>
          <Spacer size={2} />
          <Card>
            <div style={{ marginBottom: 12 }}>
              <strong>Additional admin</strong>
              <p style={{ margin: "4px 0 0", color: "#555" }}>
                Pick an existing TA from within your course to have admin
                rights, including course configuration, modifying and creating
                assignments, exporting grades, and more.
              </p>
            </div>
            <Select
              label="Pick an additional admin"
              value={adminSelection}
              onChange={(event) => {
                setAdminSelection(event.target.value);
                setAdminError(null);
                setAdminSuccess(null);
              }}
              options={adminSelectOptions}
              disabled={rosterLoading || adminSaving}
              data-cy="additional-admin-select"
            />
            {rosterLoading && (
              <p style={{ margin: "8px 0 0", color: "#555" }}>
                Loading teaching assistant list...
              </p>
            )}
            {adminError && (
              <p style={{ margin: "8px 0 0", color: "#c62828" }}>
                {adminError}
              </p>
            )}
            {adminSuccess && (
              <p style={{ margin: "8px 0 0", color: "#0a7d29" }}>
                {adminSuccess}
              </p>
            )}
            <Spacer size={0.5} />
            <Button
              onClick={handlePromoteToAdmin}
              disabled={adminSaving || rosterLoading}
              data-cy="save-additional-admin"
              isLoading={adminSaving}
            >
              Save additional admin
            </Button>
          </Card>
        </>
      )}
      <Spacer size={2} />
      <Card>
        <div>
          {isTeacher ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <strong>New Student Access</strong>
                <p style={{ margin: "4px 0 8px", color: "#555" }}>
                  {allowNewEnrollments
                    ? "Students can use the student invite code to join this course."
                    : "Blocking new enrollments prevents the student invite code from creating new accounts; TA/instructor codes remain active."}
                </p>
                <SegmentedControl
                  options={NEW_STUDENT_ACCESS_OPTIONS}
                  value={allowNewEnrollments}
                  onChange={setAllowNewEnrollments}
                />
              </div>
              <strong>Late submission policy</strong>
              <p style={{ color: "#555", marginTop: 8, marginBottom: 8 }}>
                Current policy: {describeLatePolicy(normalizedLatePolicy)}
              </p>
              <Select
                label="Allow late submissions?"
                value={lateAllowLateSubmissions ? "yes" : "no"}
                onChange={(event) =>
                  setLateAllowLateSubmissions(event.target.value === "yes")
                }
                options={[
                  { value: "yes", label: "Yes, accept late submissions" },
                  { value: "no", label: "No, close at the deadline" },
                ]}
                data-cy="allow-late-submissions"
              />
              {lateAllowLateSubmissions && (
                <>
                  <Input
                    label="Max lateness (hours)"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Leave blank for unlimited"
                    value={lateMaxLatenessHours}
                    onChange={(event) =>
                      setLateMaxLatenessHours(event.target.value)
                    }
                    data-cy="max-lateness"
                  />
                  {latePolicyValidation.maxLateness && (
                    <p style={{ color: "#b00020", marginTop: -8 }}>
                      Max lateness must be between 0 and 10,000 minutes (about
                      0‑167 hours). Enter 0 for unlimited.
                    </p>
                  )}
                </>
              )}
              <Input
                label="Penalty percent"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="Leave blank for no penalty"
                value={latePenaltyPercent}
                onChange={(event) => setLatePenaltyPercent(event.target.value)}
                data-cy="penalty-percent"
              />
              {latePolicyValidation.penaltyPercent && (
                <p style={{ color: "#b00020", marginTop: -8 }}>
                  Enter a penalty between 0 and 100.
                </p>
              )}
              <Select
                label="Penalty type"
                value={latePenaltyType}
                onChange={(event) => setLatePenaltyType(event.target.value)}
                disabled={
                  latePenaltyPercent === "" || Number(latePenaltyPercent) <= 0
                }
                options={[
                  { value: "FLAT", label: "Flat penalty" },
                  { value: "PER_DAY", label: "Penalty per day" },
                ]}
                data-cy="penalty-type"
              />
              <Spacer size={1} />
              <strong>Submission retention</strong>
              <Spacer size={1} />
              <Select
                label="Retain submissions"
                value={submissionRetentionMode}
                onChange={(event) =>
                  setSubmissionRetentionMode(event.target.value)
                }
                options={[
                  { value: "BEST", label: "Keep the best submission" },
                  {
                    value: "MOST_RECENT",
                    label: "Keep the most recent submission",
                  },
                ]}
                data-cy="submission-retention-mode"
              />
              {settingsError && (
                <p style={{ color: "#b00020" }}>{settingsError}</p>
              )}
              {settingsSuccess && (
                <p style={{ color: "#0a7d29" }}>{settingsSuccess}</p>
              )}
              <Button
                onClick={handleSaveCourseSettings}
                disabled={settingsSaving}
              >
                {settingsSaving ? "Saving..." : "Save course settings"}
              </Button>
            </>
          ) : (
            <p style={{ color: "#555", margin: 0 }}>
              {describeLatePolicy(normalizedLatePolicy)}
            </p>
          )}
        </div>
      </Card>
      {error && (
        <>
          <Spacer />
          <p style={{ color: "#b00020" }}>{error}</p>
        </>
      )}
      {isPrimaryTeacher && course.billingScheme === "PER_COURSE" && (
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
