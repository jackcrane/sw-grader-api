import classNames from "classnames";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import { Prohibit, Hourglass, SignOut } from "@phosphor-icons/react";
import { H2 } from "../../components/typography/Typography";
import { Spacer } from "../../components/spacer/Spacer";
import { SubmissionPreviewModal } from "../../components/submissionPreview/SubmissionPreviewModal";
import { Modal } from "../../components/modal/Modal";
import { Button } from "../../components/button/Button";
import { Section } from "../../components/form/Section";
import {
  CanvasPersonMatcher,
  buildCanvasPersonMatches,
} from "../../components/canvas/CanvasPersonMatcher";
import {
  CanvasAssignmentMatcher,
  buildCanvasAssignmentMatches,
} from "../../components/canvas/CanvasAssignmentMatcher";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { calculateAverageGrade } from "../../utils/calculateAverageGrade";
import { fetchJson } from "../../utils/fetchJson";
import {
  getSubmissionGradeLabel,
  getLatePenaltyLabel,
  getSubmissionGradeStatus,
  parseGradeValue,
} from "../../utils/gradeUtils";
import styles from "./CourseGradebook.module.css";
import assignmentStyles from "./AssignmentDetails.module.css";
import { useDocs } from "../../context/DocsContext";

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

const extractCanvasAssignments = (headerRow = [], pointsRow = []) => {
  return headerRow
    .map((rawName, columnIndex) => {
      if (columnIndex < 4) return null;
      const displayName = rawName?.trim();
      const pointsRaw = pointsRow?.[columnIndex]?.trim() ?? "";
      if (!displayName || !pointsRaw || pointsRaw === "(read only)") {
        return null;
      }
      const pointsNumber = Number(pointsRaw);
      if (!Number.isFinite(pointsNumber)) return null;
      const baseName = displayName.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const key = `${normalizeNameValue(displayName)}-${columnIndex}`;
      return {
        key,
        columnIndex,
        displayName,
        baseName,
        normalizedName: normalizeNameValue(baseName),
        pointsPossible: pointsNumber,
      };
    })
    .filter(Boolean);
};

const makeCanvasStudentKey = (displayName, rowIndex) =>
  `${normalizeNameValue(displayName)}-${rowIndex + 2}`;

const parseCanvasGradebook = (text = "") => {
  const rows = parseCsvRows(text);
  if (!rows.length)
    return {
      students: [],
      assignments: [],
      headerRow: [],
      pointsRow: [],
      dataRows: [],
    };
  const headerRow = rows[0] ?? [];
  const pointsRow = rows[1] ?? [];
  const dataRows = rows.slice(2);

  const assignments = extractCanvasAssignments(headerRow, pointsRow);

  const students = dataRows
    .map((row, index) => {
      const rawStudent = row[0]?.trim();
      if (!rawStudent) return null;
      const normalizedStudent = rawStudent.replace(/^"+|"+$/g, "");
      const normalizedLower = normalizedStudent.toLowerCase();
      if (normalizedLower === "student") return null;
      if (normalizedLower.includes("points possible")) return null;
      const { displayName, firstName, lastName } =
        parseCanvasName(normalizedStudent);
      if (!displayName) return null;
      const key = makeCanvasStudentKey(displayName, index);
      const normalizedFirst = normalizeNameValue(firstName);
      const normalizedLast = normalizeNameValue(lastName);
      return {
        key,
        canvasId: String(row[1]?.trim() || `row-${index}`),
        sisLoginId: row[2]?.trim() || "",
        section: row[3]?.trim() || "",
        displayName,
        firstName,
        lastName,
        normalizedFirst,
        normalizedLast,
        rowIndex: index,
      };
    })
    .filter(Boolean);

  return { students, assignments, headerRow, pointsRow, dataRows };
};

const createEmptyCanvasData = () => ({
  students: [],
  assignments: [],
  headerRow: [],
  pointsRow: [],
  dataRows: [],
});

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
  latePenaltyLabel: null,
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
  const [canvasGradebookData, setCanvasGradebookData] = useState(() =>
    createEmptyCanvasData()
  );
  const [canvasParseError, setCanvasParseError] = useState(null);
  const [canvasPersonMatches, setCanvasPersonMatches] = useState({});
  const [canvasAssignmentMatches, setCanvasAssignmentMatches] = useState({});
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

  useEffect(() => {
    if (!canvasGradebookData.students.length || !students.length) {
      setCanvasPersonMatches({});
      return;
    }
    setCanvasPersonMatches(
      buildCanvasPersonMatches(canvasGradebookData.students, students)
    );
  }, [canvasGradebookData.students, students]);

  useEffect(() => {
    if (!canvasGradebookData.assignments.length || !assignments.length) {
      setCanvasAssignmentMatches({});
      return;
    }
    setCanvasAssignmentMatches(
      buildCanvasAssignmentMatches(canvasGradebookData.assignments, assignments)
    );
  }, [canvasGradebookData.assignments, assignments]);

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
      latePenaltyLabel: null,
    });
  };

  const showSubmissionPreview = (submission, gradeLabel, pointsPossible = null) => {
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
      latePenaltyLabel: getLatePenaltyLabel({
        grade: submission?.grade,
        unpenalizedGrade: submission?.unpenalizedGrade,
        pointsPossible,
      }),
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
      const assignment =
        assignments.find(
          (item) => String(item.id) === String(assignmentId)
        ) ?? null;
      showSubmissionPreview(
        submission,
        gradeLabel,
        assignment?.pointsPossible ?? null
      );
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
        latePenaltyLabel: null,
      });
    }
  };

  const handleCanvasUploadChange = async (event) => {
    const file = event?.target?.files?.[0] ?? null;
    setCanvasGradebookFile(file);
    setCanvasParseError(null);

    if (!file) {
      setCanvasGradebookData(createEmptyCanvasData());
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCanvasGradebook(text);
      setCanvasGradebookData(parsed);
      if (!parsed.students.length) {
        setCanvasParseError(
          "No student rows were detected in this Canvas CSV."
        );
      }
    } catch (err) {
      console.error("Failed to parse Canvas gradebook", err);
      setCanvasGradebookData(createEmptyCanvasData());
      setCanvasParseError("Unable to parse the Canvas gradebook file.");
    }
  };

  const closeExportModal = () => {
    setExportModalOpen(false);
    setCanvasGradebookFile(null);
    setCanvasGradebookData(createEmptyCanvasData());
    setCanvasParseError(null);
    setCanvasPersonMatches({});
    setCanvasAssignmentMatches({});
    if (canvasFileInputRef.current) {
      canvasFileInputRef.current.value = "";
    }
  };

  const handleDownloadCanvasCsv = () => {
    if (
      !canvasGradebookFile ||
      !canvasGradebookData.headerRow.length ||
      !canvasGradebookData.dataRows.length
    ) {
      return;
    }

    const matchedStudentEntries = Object.entries(canvasPersonMatches).filter(
      ([, studentId]) => Boolean(studentId)
    );
    const matchedAssignmentEntries = Object.entries(
      canvasAssignmentMatches
    ).filter(([, assignmentId]) => Boolean(assignmentId));
    if (!matchedStudentEntries.length || !matchedAssignmentEntries.length) {
      return;
    }

    const canvasStudentsByKey = new Map(
      canvasGradebookData.students.map((student) => [student.key, student])
    );
    const canvasAssignmentsByKey = new Map(
      canvasGradebookData.assignments.map((assignment) => [
        assignment.key,
        assignment,
      ])
    );
    const rowsByStudentId = new Map(rows.map((row) => [String(row.id), row]));
    const assignmentsById = new Map(
      assignments.map((assignment) => [String(assignment.id), assignment])
    );

    const updatedDataRows = canvasGradebookData.dataRows.map((row) => [...row]);

    matchedStudentEntries.forEach(([canvasKey, studentId]) => {
      const canvasStudent = canvasStudentsByKey.get(canvasKey);
      const gradeRow = rowsByStudentId.get(String(studentId));
      if (!canvasStudent || !gradeRow) return;
      const rowData = updatedDataRows[canvasStudent.rowIndex];
      if (!rowData) return;

      matchedAssignmentEntries.forEach(
        ([assignmentKey, featureAssignmentId]) => {
          const canvasAssignment = canvasAssignmentsByKey.get(assignmentKey);
          const fbAssignment = assignmentsById.get(String(featureAssignmentId));
          if (!canvasAssignment || !fbAssignment) return;

          const gradeEntry = gradeRow.grades.find(
            (grade) => grade.assignmentId === fbAssignment.id
          );
          const gradeValue = parseGradeValue(gradeEntry?.submission?.grade);
          const fbPoints = Number(fbAssignment.pointsPossible ?? 0);
          if (
            gradeValue == null ||
            !Number.isFinite(fbPoints) ||
            fbPoints <= 0 ||
            canvasAssignment.pointsPossible <= 0
          ) {
            return;
          }

          const percent = Math.max(0, Math.min(1, gradeValue / fbPoints));
          const scaled =
            Math.round(percent * canvasAssignment.pointsPossible * 10) / 10;
          if (canvasAssignment.columnIndex != null) {
            rowData[canvasAssignment.columnIndex] = scaled.toFixed(1);
          }
        }
      );
    });

    const updatedRows = [
      [...canvasGradebookData.headerRow],
      [...canvasGradebookData.pointsRow],
      ...updatedDataRows,
    ];

    const csvContent = updatedRows
      .map((row) =>
        row
          .map((cell = "") => {
            const stringCell =
              cell == null
                ? ""
                : typeof cell === "number"
                  ? String(cell)
                  : String(cell);
            const escaped = stringCell.replace(/"/g, '""');
            return /[",\n]/.test(stringCell) ? `"${escaped}"` : escaped;
          })
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const baseName =
      canvasGradebookFile.name?.replace(/\.csv$/i, "") ?? "canvas-gradebook";
    link.download = `${baseName}-featurebench.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const canDownloadCanvasCsv =
    Boolean(canvasGradebookFile) &&
    canvasGradebookData.dataRows.length > 0 &&
    Object.values(canvasPersonMatches).some(Boolean) &&
    Object.values(canvasAssignmentMatches).some(Boolean);

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <p className={styles.legend}>Scores shown as earned / possible.</p>
          <Spacer size={2} />
          <Button onClick={() => setExportModalOpen(true)}>
            Export for Canvas
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
                <tr key={row.id} data-cy={`gradebook-row-${row.name}`}>
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
                      data-cy={`gradebook-column-${grade.assignmentId}`}
                    >
                      <div className={styles.gradeCellInner}>
                        <div className={styles.gradeCellDetails}>
                          <span className={styles.gradeValue}>
                            {grade.label}
                          </span>
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
                                data-cy={`gradebook-missing-icon-${grade.assignmentId}`}
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
                                data-cy={`gradebook-waiting-icon-${grade.assignmentId}`}
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
                                data-cy={`gradebook-scored-button-${grade.assignmentId}`}
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
            <Button
              variant="primary"
              disabled={!canDownloadCanvasCsv}
              onClick={handleDownloadCanvasCsv}
            >
              Download for Canvas
            </Button>
          </>
        }
      >
        <Section
          title="Upload your Canvas gradebook"
          subtitle="Use the latest CSV export from Canvas so we can match students."
        >
          <p>
            Log in to Canvas and go to your gradebook. Click the "Export"
            button, then select "Export Entire Gradebook".
          </p>
          <div className={assignmentStyles.uploadBox}>
            <strong>Canvas CSV</strong>
            <p className={assignmentStyles.uploadHelper}>
              We keep this file in your browser only. Nothing gets uploaded.
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
            ) : canvasGradebookData.students.length > 0 ? (
              <p
                className={`${assignmentStyles.status} ${assignmentStyles.statusSuccess}`}
              >
                Found {canvasGradebookData.students.length} Canvas students.
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
        {canvasGradebookData.students.length > 0 && (
          <Section
            title="Match Canvas students"
            subtitle="Connect Canvas records to FeatureBench students."
          >
            <CanvasPersonMatcher
              canvasPeople={canvasGradebookData.students}
              students={students}
              matchMap={canvasPersonMatches}
              onMatchesChange={setCanvasPersonMatches}
            />
          </Section>
        )}
        {canvasGradebookData.assignments.length > 0 &&
          assignments.length > 0 && (
            <Section
              title="Match Canvas assignments"
              subtitle="Pair Canvas grade columns with FeatureBench assignments."
            >
              <CanvasAssignmentMatcher
                canvasAssignments={canvasGradebookData.assignments}
                assignments={assignments}
                matchMap={canvasAssignmentMatches}
                onMatchesChange={setCanvasAssignmentMatches}
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
            the export. When you click Download for Canvas we'll hand you a CSV
            that Canvas accepts without extra mapping.
          </p>
          <p className={styles.meta}>
            Double-check that you're using the most recent Canvas export so
            names and IDs line up exactly.
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
        latePenaltyLabel={previewModalState.latePenaltyLabel}
      />
    </section>
  );
};
