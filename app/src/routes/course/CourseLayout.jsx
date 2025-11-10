import React from "react";
import { NavLink, Outlet, useParams, Navigate } from "react-router-dom";
import { Page } from "../../components/page/Page";
import { Card } from "../../components/card/Card";
import { Spacer } from "../../components/spacer/Spacer";
import { useEnrollments } from "../../hooks/useEnrollments";
import styles from "./CourseTabs.module.css";
import { H1 } from "../../components/typography/Typography";

const getCourseId = (enrollment) =>
  enrollment.course?.id ?? enrollment.courseId ?? null;

export const CourseLayout = () => {
  const { courseId } = useParams();
  const { enrollments, loading } = useEnrollments();

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

  const canViewRoster = ["TEACHER", "TA"].includes(enrollment.type);

  const tabs = [
    { path: `/${courseId}`, label: "Assignments", end: true },
    canViewRoster ? { path: `/${courseId}/roster`, label: "Roster" } : null,
    { path: `/${courseId}/gradebook`, label: "Gradebook" },
  ].filter(Boolean);

  const courseName = enrollment.course?.name ?? "Course";
  const courseAbbr = enrollment.course?.abbr;

  return (
    <Page>
      <header style={{ marginTop: 16 }}>
        <H1>{courseName}</H1>
        {courseAbbr && <p style={{ color: "#555" }}>{courseAbbr}</p>}
      </header>
      <nav className={styles.tabs}>
        {tabs.map(({ path, label, end }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.active : ""}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Spacer size={2} />
      <Card style={{ padding: 0 }}>
        <Outlet context={{ courseId, enrollment, canViewRoster }} />
      </Card>
    </Page>
  );
};
