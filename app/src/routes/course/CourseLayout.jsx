import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  NavLink,
  Outlet,
  useParams,
  Navigate,
  useMatch,
} from "react-router-dom";
import { Page } from "../../components/page/Page";
import { Card } from "../../components/card/Card";
import { Spacer } from "../../components/spacer/Spacer";
import { useEnrollments } from "../../hooks/useEnrollments";
import styles from "./CourseTabs.module.css";
import { H1 } from "../../components/typography/Typography";
import { useAuthContext } from "../../context/AuthContext";
import { Button } from "../../components/button/Button";

const maskCode = (value) => {
  if (!value) return "";
  return "•".repeat(Math.max(value.length, 8));
};

const smallButtonStyle = {
  padding: "4px 12px",
  fontSize: 12,
  minHeight: 0,
};

const getCourseId = (enrollment) =>
  enrollment.course?.id ?? enrollment.courseId ?? null;

export const CourseLayout = () => {
  const { courseId } = useParams();
  const { enrollments, loading, refetch } = useEnrollments();
  const { viewAsStudent } = useAuthContext();
  const [inviteCardDismissed, setInviteCardDismissed] = useState(false);
  const [studentCodeVisible, setStudentCodeVisible] = useState(false);
  const [taCodeVisible, setTaCodeVisible] = useState(false);
  const [inviteCardError, setInviteCardError] = useState(null);
  const [regenerating, setRegenerating] = useState({
    student: false,
    ta: false,
  });

  const inviteDismissKey = useMemo(
    () => (courseId ? `courseInviteCardDismissed:${courseId}` : null),
    [courseId]
  );

  useEffect(() => {
    setStudentCodeVisible(false);
    setTaCodeVisible(false);
    setInviteCardError(null);
    if (!inviteDismissKey || typeof window === "undefined") {
      setInviteCardDismissed(false);
      return;
    }
    const stored = window.localStorage.getItem(inviteDismissKey);
    setInviteCardDismissed(stored === "true");
  }, [inviteDismissKey]);

  const rotateInviteCode = useCallback(
    async (inviteType) => {
      if (!courseId) {
        throw new Error("Course not found");
      }

      const response = await fetch(`/api/courses/${courseId}/invite-codes`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: inviteType }),
      });

      if (!response.ok) {
        let message = "Failed to regenerate invite code";
        try {
          const payload = await response.json();
          message = payload?.message ?? message;
        } catch {
          const text = await response.text();
          message = text || message;
        }
        throw new Error(message);
      }

      const payload = await response.json();
      await refetch?.();
      return payload?.course ?? null;
    },
    [courseId, refetch]
  );

  const setRegeneratingFor = (inviteType, value) => {
    setRegenerating((prev) => ({ ...prev, [inviteType]: value }));
  };

  const handleInviteRegenerate = async (inviteType) => {
    setInviteCardError(null);
    setRegeneratingFor(inviteType, true);
    try {
      await rotateInviteCode(inviteType);
      if (inviteType === "student") {
        setStudentCodeVisible(false);
      } else {
        setTaCodeVisible(false);
      }
    } catch (error) {
      setInviteCardError(error?.message ?? "Failed to regenerate invite code");
    } finally {
      setRegeneratingFor(inviteType, false);
    }
  };

  const assignmentsRootMatch = useMatch({ path: "/:courseId", end: true });
  const assignmentsDetailsMatch = useMatch("/:courseId/assignments/*");
  const isAssignmentsActive = Boolean(
    assignmentsRootMatch || assignmentsDetailsMatch
  );

  if (!courseId) {
    return <Navigate to="/app" replace />;
  }

  if (loading) {
    return (
      <Page title="FeatureBench – Loading course">
        <Card>
          <p>Loading course...</p>
        </Card>
      </Page>
    );
  }

  const enrollment = enrollments?.find(
    (entry) => getCourseId(entry) === courseId
  );

  if (!enrollment) {
    return <Navigate to="/app" replace />;
  }

  const hasStaffPrivileges = ["TEACHER", "TA"].includes(enrollment.type);
  const isTeacher = enrollment.type === "TEACHER";
  const isViewingAsStudent = viewAsStudent && hasStaffPrivileges;
  const effectiveEnrollment = isViewingAsStudent
    ? { ...enrollment, type: "STUDENT" }
    : enrollment;
  const canViewRoster = ["TEACHER", "TA"].includes(effectiveEnrollment.type);
  const canViewGradebook = canViewRoster;

  const tabs = [
    {
      path: `/${courseId}`,
      label: "Assignments",
      end: true,
      isActiveOverride: isAssignmentsActive,
    },
    canViewRoster ? { path: `/${courseId}/roster`, label: "Roster" } : null,
    canViewGradebook
      ? { path: `/${courseId}/gradebook`, label: "Gradebook" }
      : null,
    hasStaffPrivileges
      ? { path: `/${courseId}/details`, label: "Course Details" }
      : null,
  ].filter(Boolean);

  const courseNameRaw = enrollment.course?.name ?? "";
  const courseName = courseNameRaw.trim() || "Course";
  const courseAbbr = enrollment.course?.abbr;
  const studentInviteCode = enrollment.course?.studentInviteCode;
  const taInviteCode = enrollment.course?.taInviteCode;
  const pageTitle =
    courseNameRaw.trim().length > 0
      ? `${courseName} – FeatureBench`
      : "FeatureBench";

  const shouldShowInviteCard =
    isTeacher && !inviteCardDismissed && (studentInviteCode || taInviteCode);

  const handleDismissInviteCard = () => {
    if (inviteDismissKey && typeof window !== "undefined") {
      window.localStorage.setItem(inviteDismissKey, "true");
    }
    setInviteCardDismissed(true);
  };

  return (
    <Page title={pageTitle}>
      <header style={{ marginTop: 16 }}>
        <H1>{courseName}</H1>
        {courseAbbr && <p style={{ color: "#555" }}>{courseAbbr}</p>}
      </header>
      {shouldShowInviteCard && (
        <>
          <Spacer />
          <Card style={{ position: "relative" }}>
            <button
              type="button"
              onClick={handleDismissInviteCard}
              aria-label="Dismiss invite codes"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                border: "none",
                background: "transparent",
                fontSize: 18,
                cursor: "pointer",
                color: "#666",
              }}
            >
              ×
            </button>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Share invite codes
            </div>
            <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
              Students and staff can join this course using the codes below.
            </p>
            <Spacer />
            {studentInviteCode && (
              <div style={{ marginBottom: 12 }}>
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
                    {studentCodeVisible
                      ? studentInviteCode
                      : maskCode(studentInviteCode)}
                  </code>
                  <Button
                    onClick={() => setStudentCodeVisible((prev) => !prev)}
                    style={smallButtonStyle}
                  >
                    {studentCodeVisible ? "Hide" : "Show"}
                  </Button>
                  <Button
                    onClick={() => handleInviteRegenerate("student")}
                    disabled={regenerating.student}
                    style={smallButtonStyle}
                  >
                    {regenerating.student ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
              </div>
            )}
            {taInviteCode && (
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
                    {taCodeVisible ? taInviteCode : maskCode(taInviteCode)}
                  </code>
                  <Button
                    onClick={() => setTaCodeVisible((prev) => !prev)}
                    style={smallButtonStyle}
                  >
                    {taCodeVisible ? "Hide" : "Show"}
                  </Button>
                  <Button
                    onClick={() => handleInviteRegenerate("ta")}
                    disabled={regenerating.ta}
                    style={smallButtonStyle}
                  >
                    {regenerating.ta ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
              </div>
            )}
            {inviteCardError && (
              <p style={{ color: "#b00020", marginTop: 12 }}>
                {inviteCardError}
              </p>
            )}
          </Card>
        </>
      )}
      <nav className={styles.tabs}>
        {tabs.map(({ path, label, end, isActiveOverride }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `${styles.tab} ${
                isActiveOverride ?? isActive ? styles.active : ""
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Spacer size={2} />
      <Card style={{ padding: 0 }}>
        <Outlet
          context={{
            courseId,
            enrollment: effectiveEnrollment,
            canViewRoster,
            isViewingAsStudent,
            hasStaffPrivileges,
            regenerateInviteCode: rotateInviteCode,
            viewerEnrollmentType: enrollment.type,
          }}
        />
      </Card>
    </Page>
  );
};
