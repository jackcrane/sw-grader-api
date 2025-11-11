import React, { useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import { Navigate, useOutletContext } from "react-router-dom";
import { H2 } from "../../components/typography/Typography";
import { Spacer } from "../../components/spacer/Spacer";
import { Button } from "../../components/button/Button";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { calculateAverageGrade } from "../../utils/calculateAverageGrade";
import styles from "./CourseRoster.module.css";

const roleLabels = {
  STUDENT: "Student",
  TA: "Teaching assistant",
  TEACHER: "Teacher",
};

const formatName = (user) => {
  if (!user) return "Unknown";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed student";
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "–";
  return `${value.toFixed(1)}%`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const nextRole = (type) => (type === "STUDENT" ? "TA" : "STUDENT");

export const CourseRoster = () => {
  const {
    canViewRoster,
    courseId,
    enrollment,
    viewerEnrollmentType,
    isViewingAsStudent,
  } = useOutletContext();
  const {
    roster,
    assignments,
    loading,
    error,
    updateEnrollmentType,
    removeEnrollment,
  } = useCourseRoster(courseId, { enabled: canViewRoster });

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const visibleRoster = useMemo(
    () => roster.filter((entry) => entry.type !== "TEACHER"),
    [roster]
  );

  useEffect(() => {
    if (visibleRoster.length === 0) {
      setSelectedEnrollmentId(null);
      return;
    }
    if (
      selectedEnrollmentId &&
      visibleRoster.some((entry) => entry.id === selectedEnrollmentId)
    ) {
      return;
    }
    setSelectedEnrollmentId(visibleRoster[0]?.id ?? null);
  }, [visibleRoster, selectedEnrollmentId]);

  const activeEnrollment = visibleRoster.find(
    (entry) => entry.id === selectedEnrollmentId
  );

  const submissions = activeEnrollment?.submissions ?? [];
  const averageGrade = useMemo(
    () => calculateAverageGrade(assignments, submissions),
    [assignments, submissions]
  );
  const gradedCount = submissions.filter((entry) =>
    Number.isFinite(Number(entry?.grade))
  ).length;
  const totalAssignments = assignments.length;
  const lastSubmissionDate = submissions.reduce((latest, entry) => {
    if (!entry?.updatedAt) return latest;
    if (!latest) return entry.updatedAt;
    return new Date(entry.updatedAt) > new Date(latest) ? entry.updatedAt : latest;
  }, null);
  const statsCards = useMemo(
    () => [
      {
        label: "Overall average",
        value: formatPercent(averageGrade),
        subtext:
          totalAssignments > 0
            ? `${gradedCount}/${totalAssignments} graded`
            : "No graded work yet",
      },
      {
        label: "Submission rate",
        value: totalAssignments
          ? formatPercent((gradedCount / totalAssignments) * 100)
          : "–",
        subtext:
          totalAssignments > 0
            ? "Share of assignments with scores"
            : "Assignments pending",
      },
      {
        label: "Last submission",
        value: submissions.length > 0 ? formatDateTime(lastSubmissionDate) : "—",
        subtext: submissions.length > 0 ? "Latest upload time" : "No submissions yet",
      },
    ],
    [averageGrade, gradedCount, totalAssignments, submissions.length, lastSubmissionDate]
  );

  const canManageRoster =
    viewerEnrollmentType === "TEACHER" && !isViewingAsStudent;

  const handleToggleRole = async () => {
    if (!activeEnrollment) return;
    setActionError(null);
    setPendingAction("role");
    try {
      await updateEnrollmentType(activeEnrollment.id, nextRole(activeEnrollment.type));
    } catch (err) {
      setActionError(err?.message || "Failed to update roster role.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async () => {
    if (!activeEnrollment) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Remove ${formatName(activeEnrollment.user)} from the course?`)
    ) {
      return;
    }
    setActionError(null);
    setPendingAction("remove");
    try {
      await removeEnrollment(activeEnrollment.id);
    } catch (err) {
      setActionError(err?.message || "Failed to remove user from course.");
    } finally {
      setPendingAction(null);
    }
  };

  if (!canViewRoster) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  return (
    <section className={styles.roster}>
      <div className={classNames(styles.column, styles.left)}>
        <div className={styles.listHeader}>
          <H2>Students</H2>
          <p>
            {visibleRoster.length === 1
              ? "1 member"
              : `${visibleRoster.length} members`}
          </p>
        </div>
        {loading && <p className={styles.state}>Loading roster…</p>}
        {error && (
          <p className={styles.error}>
            Failed to load roster: {error.message ?? "Unknown error"}
          </p>
        )}
        {!loading && !error && visibleRoster.length === 0 && (
          <p className={styles.state}>No students enrolled yet.</p>
        )}
        {visibleRoster.map((entry) => {
          const isActive = entry.id === activeEnrollment?.id;
          return (
            <button
              key={entry.id}
              type="button"
              className={classNames(styles.studentRow, {
                [styles.studentRowActive]: isActive,
              })}
              onClick={() => setSelectedEnrollmentId(entry.id)}
            >
              <div>
                <div className={styles.studentName}>{formatName(entry.user)}</div>
                <div className={styles.studentMeta}>
                  {entry.user?.email || "No email"} • {roleLabels[entry.type] ?? entry.type}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className={classNames(styles.column, styles.details)}>
        {!activeEnrollment ? (
          <p className={styles.state}>Select a student to view details.</p>
        ) : (
          <div className={styles.detailContent}>
            <div className={styles.detailHeader}>
              <h2>{formatName(activeEnrollment.user)}</h2>
              <p className={styles.detailMeta}>
                {activeEnrollment.user?.email || "No email on file"} •{" "}
                {roleLabels[activeEnrollment.type] ?? activeEnrollment.type}
              </p>
            </div>
            <div className={styles.statsGrid}>
              {statsCards.map((card) => (
                <div key={card.label} className={styles.statCard}>
                  <div className={styles.statLabel}>{card.label}</div>
                  <div className={styles.statValue}>{card.value}</div>
                  <div className={styles.statSubtext}>{card.subtext}</div>
                </div>
              ))}
            </div>
            {canManageRoster && (
              <div className={classNames(styles.sectionCard, styles.actionsCard)}>
                <div>
                  <div className={styles.sectionTitle}>Manage access</div>
                  <p className={styles.sectionMeta}>
                    Promote standout students to TAs or remove inactive accounts.
                  </p>
                </div>
                <div className={styles.actions}>
                  <Button
                    onClick={handleToggleRole}
                    disabled={pendingAction === "role"}
                  >
                    {activeEnrollment.type === "STUDENT"
                      ? "Promote to TA"
                      : "Demote to Student"}
                  </Button>
                  <Button
                    onClick={handleRemove}
                    disabled={pendingAction === "remove"}
                    className={styles.removeButton}
                  >
                    Remove from course
                  </Button>
                </div>
              </div>
            )}
            {actionError && <p className={styles.error}>{actionError}</p>}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Assignment grades</div>
                  <p className={styles.sectionMeta}>
                    {gradedCount}/{totalAssignments || 0} submissions recorded
                  </p>
                </div>
              </div>
              {assignments.length === 0 ? (
                <p className={styles.state}>No assignments available yet.</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.gradeTable}>
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Grade</th>
                        <th>Percent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => {
                        const submission = submissions.find(
                          (entry) => entry.assignmentId === assignment.id
                        );
                        const gradeValue = Number(submission?.grade);
                        const pointsPossible = Number(assignment.pointsPossible);
                        const hasGrade = Number.isFinite(gradeValue);
                        const percent =
                          hasGrade &&
                          Number.isFinite(pointsPossible) &&
                          pointsPossible > 0
                            ? `${((gradeValue / pointsPossible) * 100).toFixed(1)}%`
                            : "–";
                        return (
                          <tr key={assignment.id}>
                            <td>
                              <div className={styles.assignmentName}>{assignment.name}</div>
                              <div className={styles.assignmentMeta}>
                                {pointsPossible} pts
                              </div>
                            </td>
                            <td>{hasGrade ? `${gradeValue}/${pointsPossible}` : "–"}</td>
                            <td>{percent}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
