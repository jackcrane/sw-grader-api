import classNames from "classnames";
import React, { useMemo } from "react";
import { Navigate, useOutletContext } from "react-router-dom";
import { H2 } from "../../components/typography/Typography";
import { Spacer } from "../../components/spacer/Spacer";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { calculateAverageGrade } from "../../utils/calculateAverageGrade";
import {
  getSubmissionGradeLabel,
  getSubmissionGradeStatus,
  parseGradeValue,
} from "../../utils/gradeUtils";
import styles from "./CourseGradebook.module.css";

const roleLabels = {
  STUDENT: "Student",
  TA: "Teaching assistant",
};

const formatName = (user) => {
  if (!user) return "Unknown student";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed student";
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
};

const formatGradeCell = (submission, assignment) => {
  const gradeValue = parseGradeValue(submission?.grade);
  const pointsPossibleNumber = Number(assignment?.pointsPossible);
  const label = getSubmissionGradeLabel({
    gradeValue,
    hasSubmission: Boolean(submission),
    pointsPossible: assignment?.pointsPossible,
    dueDate: assignment?.dueDate,
  });
  const status = getSubmissionGradeStatus({
    gradeValue,
    hasSubmission: Boolean(submission),
    dueDate: assignment?.dueDate,
  });

  let percent = "—";
  if (
    gradeValue != null &&
    Number.isFinite(pointsPossibleNumber) &&
    pointsPossibleNumber > 0
  ) {
    const clamped = Math.min(Math.max(gradeValue, 0), pointsPossibleNumber);
    percent = `${((clamped / pointsPossibleNumber) * 100).toFixed(1)}%`;
  }

  return { label, percent, status };
};

const buildSubmissionLookup = (submissions = []) =>
  submissions.reduce((acc, submission) => {
    if (!submission?.assignmentId) return acc;
    acc[submission.assignmentId] = submission;
    return acc;
  }, {});

export const CourseGradebook = () => {
  const { canViewRoster, courseId } = useOutletContext();
  const canViewGradebook = Boolean(canViewRoster);
  const { roster, assignments, loading, error } = useCourseRoster(courseId, {
    enabled: canViewGradebook,
  });

  const students = useMemo(
    () =>
      roster
        .filter((entry) => entry.type !== "TEACHER")
        .sort((a, b) => formatName(a.user).localeCompare(formatName(b.user))),
    [roster]
  );

  const rows = useMemo(() => {
    if (!assignments.length) {
      return students.map((student) => ({
        id: student.id,
        name: formatName(student.user),
        email: student.user?.email ?? "No email provided",
        role: roleLabels[student.type] ?? student.type,
        average: calculateAverageGrade([], student.submissions),
        grades: [],
      }));
    }

    return students.map((student) => {
      const lookup = buildSubmissionLookup(student.submissions);
      const grades = assignments.map((assignment) => ({
        assignmentId: assignment.id,
        ...formatGradeCell(lookup[assignment.id], assignment),
      }));

      return {
        id: student.id,
        name: formatName(student.user),
        email: student.user?.email ?? "No email provided",
        role: roleLabels[student.type] ?? student.type,
        average: calculateAverageGrade(assignments, student.submissions),
        grades,
      };
    });
  }, [assignments, students]);

  if (!canViewGradebook) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  return (
    <section className={styles.gradebook}>
      <div className={styles.header}>
        <div>
          <H2>Gradebook</H2>
          <p className={styles.meta}>
            Track earned points for each assignment. Switch to the roster to
            drill into a student&apos;s submissions.
          </p>
        </div>
        <p className={styles.legend}>Scores shown as earned / possible.</p>
      </div>

      <Spacer />

      {loading && <p className={styles.state}>Loading gradebook…</p>}
      {error && (
        <p className={styles.error}>
          Failed to load course data: {error.message ?? "Unknown error"}
        </p>
      )}

      {!loading && !error && students.length === 0 && (
        <p className={styles.state}>No students enrolled yet.</p>
      )}

      {!loading &&
        !error &&
        students.length > 0 &&
        assignments.length === 0 && (
          <p className={styles.state}>
            Create an assignment to start recording grades.
          </p>
        )}

      {!loading && !error && students.length > 0 && assignments.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.studentColumn}>Student</th>
                {assignments.map((assignment) => (
                  <th key={assignment.id}>
                    <span className={styles.assignmentName}>
                      {assignment.name}
                    </span>
                    <span className={styles.assignmentMeta}>
                      {Number.isFinite(Number(assignment.pointsPossible))
                        ? `${assignment.pointsPossible} pts`
                        : "Ungraded"}
                    </span>
                  </th>
                ))}
                <th className={styles.averageColumn}>Average</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.studentCell}>
                    <span className={styles.studentName}>{row.name}</span>
                    {/* <span className={styles.studentMeta}>
                      {row.email} • {row.role}
                    </span> */}
                  </td>
                  {row.grades.map((grade) => (
                    <td
                      key={grade.assignmentId}
                      className={classNames(styles.gradeCell, {
                        [styles.gradeCellNoSubmission]:
                          grade.status === "no-submission",
                        [styles.gradeCellMissing]: grade.status === "missing",
                        [styles.gradeCellWaiting]: grade.status === "waiting",
                      })}
                    >
                      <span className={styles.gradeValue}>{grade.label}</span>
                      <span className={styles.gradePercent}>
                        {grade.percent}
                      </span>
                    </td>
                  ))}
                  <td className={styles.averageCell}>
                    <span className={styles.gradeValue}>
                      {formatPercent(row.average)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
