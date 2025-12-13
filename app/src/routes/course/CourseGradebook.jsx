import classNames from "classnames";
import React, { useMemo, useRef, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { Prohibit, Hourglass, SignOut } from "@phosphor-icons/react";
import { H2 } from "../../components/typography/Typography";
import { Spacer } from "../../components/spacer/Spacer";
import { SubmissionPreviewModal } from "../../components/submissionPreview/SubmissionPreviewModal";
import { Modal } from "../../components/modal/Modal";
import { Button } from "../../components/button/Button";
import { Section } from "../../components/form/Section";
import { CanvasPersonMatcher } from "../../components/canvas/CanvasPersonMatcher";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { calculateAverageGrade } from "../../utils/calculateAverageGrade";
import { fetchJson } from "../../utils/fetchJson";
import {
  getSubmissionGradeLabel,
  getSubmissionGradeStatus,
  parseGradeValue,
} from "../../utils/gradeUtils";
import styles from "./CourseGradebook.module.css";
import assignmentStyles from "./AssignmentDetails.module.css";

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

const deriveSubmissionFilename = (submission) => {
  if (!submission) return null;
  return (
    submission.fileName || submission.fileKey?.split?.("/")?.pop?.() || null
  );
};

const normalizeNameValue = (value) =>
  value ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const parseCsvRows = (text = "") => {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
};

const parseCanvasName = (raw) => {
  const cleaned = raw?.trim();
  if (!cleaned) {
    return { displayName: "", firstName: "", lastName: "" };
  }
  const [last = "", first = ""] = cleaned.split(",").map((part) => part.trim());
  return {
    displayName: cleaned,
    firstName: first,
    lastName: last,
  };
};

const parseCanvasGradebook = (text = "") => {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const [, ...dataRows] = rows;

  return dataRows
    .map((row, index) => {
      const rawStudent = row[0]?.trim();
      if (!rawStudent) return null;
      const normalizedStudent = rawStudent.replace(/^"+|"+$/g, "");
      const normalizedLower = normalizedStudent.toLowerCase();
      if (normalizedLower === "student") return null;
      if (normalizedLower.includes("points possible")) return null;
      const { displayName, firstName, lastName } = parseCanvasName(
        normalizedStudent
      );
      if (!displayName) return null;
      const normalizedFirst = normalizeNameValue(firstName);
      const normalizedLast = normalizeNameValue(lastName);
      return {
        canvasId: String(row[1]?.trim() || `row-${index}`),
        sisLoginId: row[2]?.trim() || "",
        section: row[3]?.trim() || "",
        displayName,
        firstName,
        lastName,
        normalizedFirst,
        normalizedLast,
        normalizedFull: normalizeNameValue(`${firstName} ${lastName}`),
        normalizedReverse: normalizeNameValue(`${lastName} ${firstName}`),
      };
    })
    .filter(Boolean);
};

const submissionPreviewInitialState = {
  status: "idle",
  screenshotUrl: null,
  gradeValue: null,
  gradeLabel: null,
  downloadUrl: null,
  downloadFilename: null,
  feedback: null,
  error: null,
  queueStatus: null,
};

export const CourseGradebook = () => {
  const { canViewRoster, courseId } = useOutletContext();
  const canViewGradebook = Boolean(canViewRoster);
  const { roster, assignments, loading, error } = useCourseRoster(courseId, {
    enabled: canViewGradebook,
  });

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalState, setPreviewModalState] = useState(
    submissionPreviewInitialState
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [canvasGradebookFile, setCanvasGradebookFile] = useState(null);
  const [canvasGradebookEntries, setCanvasGradebookEntries] = useState([]);
  const [canvasParseError, setCanvasParseError] = useState(null);
  const canvasFileInputRef = useRef(null);

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
        enrollmentId: student.id,
        userId: student.user?.id ?? null,
        name: formatName(student.user),
        user: student.user ?? null,
        email: student.user?.email ?? "No email provided",
        role: roleLabels[student.type] ?? student.type,
        average: calculateAverageGrade([], student.submissions),
        grades: [],
      }));
    }

    return students.map((student) => {
      const lookup = buildSubmissionLookup(student.submissions);
      const grades = assignments.map((assignment) => {
        const submission = lookup[assignment.id];
        return {
          assignmentId: assignment.id,
          submission,
          ...formatGradeCell(submission, assignment),
        };
      });

      return {
        id: student.id,
        enrollmentId: student.id,
        userId: student.user?.id ?? null,
        name: formatName(student.user),
        user: student.user ?? null,
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

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewModalState(submissionPreviewInitialState);
  };

  const showLoadingPreview = () => {
    setPreviewModalOpen(true);
    setPreviewModalState({
      status: "loading",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      downloadUrl: null,
      downloadFilename: null,
      feedback: null,
      error: null,
      queueStatus: null,
    });
  };

  const showSubmissionPreview = (submission, gradeLabel) => {
    if (!submission) return;
    setPreviewModalOpen(true);
    setPreviewModalState({
      status: "success",
      screenshotUrl: submission?.screenshotUrl ?? null,
      gradeValue: submission?.grade ?? null,
      gradeLabel,
      feedback: submission?.feedback ?? null,
      downloadUrl: submission?.fileUrl ?? null,
      downloadFilename: deriveSubmissionFilename(submission),
      error: null,
      queueStatus: submission?.queueStatus ?? null,
    });
  };

  const handleViewSubmission = async (assignmentId, userId, gradeLabel) => {
    if (!assignmentId || !userId) return;
    showLoadingPreview();
    try {
      const params = new URLSearchParams();
      params.set("userId", userId);
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions?${params}`
      );
      const submission = payload?.submissions?.[0] ?? null;
      if (!submission) {
        throw new Error("No submission recorded for this assignment.");
      }
      showSubmissionPreview(submission, gradeLabel);
    } catch (err) {
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: gradeLabel ?? null,
        downloadUrl: null,
        downloadFilename: null,
        feedback: null,
        error: err?.message || "Unable to load submission.",
        queueStatus: null,
      });
    }
  };

  const handleCanvasUploadChange = async (event) => {
    const file = event?.target?.files?.[0] ?? null;
    setCanvasGradebookFile(file);
    setCanvasParseError(null);

    if (!file) {
      setCanvasGradebookEntries([]);
      return;
    }

    try {
      const text = await file.text();
      const entries = parseCanvasGradebook(text);
      setCanvasGradebookEntries(entries);
      if (!entries.length) {
        setCanvasParseError(
          "No student rows were detected in this Canvas CSV."
        );
      }
    } catch (err) {
      console.error("Failed to parse Canvas gradebook", err);
      setCanvasGradebookEntries([]);
      setCanvasParseError("Unable to parse the Canvas gradebook file.");
    }
  };

  const closeExportModal = () => {
    setExportModalOpen(false);
    setCanvasGradebookFile(null);
    setCanvasGradebookEntries([]);
    setCanvasParseError(null);
    if (canvasFileInputRef.current) {
      canvasFileInputRef.current.value = "";
    }
  };

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
        <div>
          <p className={styles.legend}>Scores shown as earned / possible.</p>
          <Spacer size={2} />
          <Button variant="primary" onClick={() => setExportModalOpen(true)}>
            Download for Canvas
          </Button>
        </div>
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
                    <Link
                      className={styles.assignmentHeaderLink}
                      to={`/${courseId}/assignments/${assignment.id}`}
                    >
                      <span className={styles.assignmentName}>
                        {assignment.name}
                      </span>
                      <span className={styles.assignmentMeta}>
                        {Number.isFinite(Number(assignment.pointsPossible))
                          ? `${assignment.pointsPossible} pts`
                          : "Ungraded"}
                      </span>
                    </Link>
                  </th>
                ))}
                <th className={styles.averageColumn}>Average</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.studentCell}>
                    {row.enrollmentId ? (
                      <Link
                        to={`/${courseId}/roster/${row.enrollmentId}`}
                        className={styles.studentLink}
                      >
                        <span className={styles.studentName}>{row.name}</span>
                      </Link>
                    ) : (
                      <span className={styles.studentName}>{row.name}</span>
                    )}
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
                      <div className={styles.gradeCellInner}>
                        <div className={styles.gradeCellDetails}>
                          <span className={styles.gradeValue}>{grade.label}</span>
                          <span className={styles.gradePercent}>
                            {grade.percent}
                          </span>
                        </div>
                        {(() => {
                          if (grade.status === "no-submission") {
                            return null;
                          }

                          if (grade.status === "missing") {
                            return (
                              <button
                                type="button"
                                className={styles.gradeCellIcon}
                                disabled
                                aria-label="Assignment missing"
                              >
                                <Prohibit size={16} />
                              </button>
                            );
                          }

                          if (grade.status === "waiting") {
                            return (
                              <button
                                type="button"
                                className={styles.gradeCellIcon}
                                disabled
                                aria-label="Awaiting grading"
                              >
                                <Hourglass size={16} />
                              </button>
                            );
                          }

                          if (grade.status === "scored") {
                            return (
                              <button
                                type="button"
                                className={styles.gradeCellIcon}
                                aria-label="View submission"
                                onClick={() =>
                                  handleViewSubmission(
                                    grade.assignmentId,
                                    row.userId,
                                    grade.label
                                  )
                                }
                              >
                                <SignOut size={16} />
                              </button>
                            );
                          }

                          return null;
                        })()}
                      </div>
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
      <Modal
        open={exportModalOpen}
        onClose={closeExportModal}
        title="Download for Canvas"
        initialFocusRef={canvasFileInputRef}
        footer={
          <>
            <Button onClick={closeExportModal}>Close</Button>
            <Button variant="primary" disabled={!canvasGradebookFile}>
              Download for Canvas
            </Button>
          </>
        }
      >
        <Section
          title="Upload your Canvas gradebook"
          subtitle="Use the latest CSV export from Canvas so we can match students."
        >
          <div className={assignmentStyles.uploadBox}>
            <strong>Canvas CSV</strong>
            <p className={assignmentStyles.uploadHelper}>
              We keep this file in your browser only. Nothing gets uploaded yet.
            </p>
            <input
              id="canvasGradebookUpload"
              type="file"
              accept=".csv"
              ref={canvasFileInputRef}
              className={assignmentStyles.fileInput}
              onChange={handleCanvasUploadChange}
            />
            {canvasParseError ? (
              <p
                className={`${assignmentStyles.status} ${assignmentStyles.statusError}`}
              >
                {canvasParseError}
              </p>
            ) : canvasGradebookEntries.length > 0 ? (
              <p
                className={`${assignmentStyles.status} ${assignmentStyles.statusSuccess}`}
              >
                Found {canvasGradebookEntries.length} Canvas students.
              </p>
            ) : canvasGradebookFile ? (
              <p
                className={`${assignmentStyles.status} ${assignmentStyles.statusSuccess}`}
              >
                Selected file: {canvasGradebookFile.name}
              </p>
            ) : (
              <p className={assignmentStyles.status}>
                Choose the CSV you just downloaded from Canvas.
              </p>
            )}
          </div>
        </Section>
        {canvasGradebookEntries.length > 0 && (
          <Section
            title="Match Canvas students"
            subtitle="Connect Canvas records to FeatureBench students."
          >
            <CanvasPersonMatcher
              canvasPeople={canvasGradebookEntries}
              students={students}
            />
          </Section>
        )}
        <Section
          title="What happens next?"
          subtitle="We'll generate a gradebook file that Canvas can import."
          last
        >
          <p className={styles.meta}>
            Uploading the Canvas CSV lets us align your roster before we build
            the export. When you click Download for Canvas we'll hand you
            a CSV that Canvas accepts without extra mapping.
          </p>
          <p className={styles.meta}>
            Double-check that you're using the most recent Canvas export
            so names and IDs line up exactly.
          </p>
        </Section>
      </Modal>
      <SubmissionPreviewModal
        open={previewModalOpen}
        status={previewModalState.status}
        screenshotUrl={previewModalState.screenshotUrl}
        gradeValue={previewModalState.gradeValue}
        gradeLabel={previewModalState.gradeLabel}
        downloadUrl={previewModalState.downloadUrl}
        downloadFilename={previewModalState.downloadFilename}
        error={previewModalState.error}
        feedback={previewModalState.feedback}
        queueStatus={previewModalState.queueStatus}
        onClose={closePreviewModal}
      />
    </section>
  );
};
