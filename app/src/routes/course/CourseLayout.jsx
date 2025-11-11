import React from "react";
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

const getCourseId = (enrollment) =>
  enrollment.course?.id ?? enrollment.courseId ?? null;

export const CourseLayout = () => {
  const { courseId } = useParams();
  const { enrollments, loading } = useEnrollments();
  const { viewAsStudent } = useAuthContext();

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
      <Page>
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
  ].filter(Boolean);

  const courseName = enrollment.course?.name ?? "Course";
  const courseAbbr = enrollment.course?.abbr;
  const studentInviteCode = enrollment.course?.studentInviteCode;
  const taInviteCode = enrollment.course?.taInviteCode;

  return (
    <Page>
      <header style={{ marginTop: 16 }}>
        <H1>{courseName}</H1>
        {courseAbbr && <p style={{ color: "#555" }}>{courseAbbr}</p>}
      </header>
      {hasStaffPrivileges && (studentInviteCode || taInviteCode) && (
        <>
          <Spacer />
          <Card>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Share invite codes
            </div>
            <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
              Students and staff can join this course using the codes below.
            </p>
            <Spacer />
            {studentInviteCode && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", color: "#777" }}>
                  Student code
                </div>
                <code style={{ fontSize: 16 }}>{studentInviteCode}</code>
              </div>
            )}
            {taInviteCode && (
              <div>
                <div style={{ fontSize: 12, textTransform: "uppercase", color: "#777" }}>
                  TA / instructor code
                </div>
                <code style={{ fontSize: 16 }}>{taInviteCode}</code>
              </div>
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
                (isActiveOverride ?? isActive) ? styles.active : ""
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
          }}
        />
      </Card>
    </Page>
  );
};
