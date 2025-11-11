import React, { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { Button } from "../../components/button/Button";
import { Modal } from "../../components/modal/Modal";
import { Spinner } from "../../components/spinner/Spinner";
import { useAssignmentDetails } from "../../hooks/useAssignmentDetails";
import styles from "./AssignmentDetails.module.css";

const formatDateTime = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
};

export const AssignmentDetails = () => {
  const { courseId, enrollmentType } = useOutletContext();
  const { assignmentId } = useParams();
  const {
    assignment,
    stats,
    userSubmission,
    userSubmissions,
    loading,
    error,
    refetch,
  } = useAssignmentDetails(courseId, assignmentId);

  const isStudent = enrollmentType === "STUDENT";
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalState, setPreviewModalState] = useState({
    status: "idle",
    screenshotUrl: null,
    grade: null,
    error: null,
  });

  const submissions =
    (userSubmissions && userSubmissions.length > 0 && userSubmissions) ||
    (userSubmission ? [userSubmission] : []);
  const sortedSubmissions = submissions
    .map((submission) => ({
      ...submission,
      sortTimestamp: submission?.updatedAt ?? submission?.createdAt ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.sortTimestamp ? new Date(a.sortTimestamp).getTime() : 0;
      const bTime = b.sortTimestamp ? new Date(b.sortTimestamp).getTime() : 0;
      return bTime - aTime;
    });
  const hasSubmission = sortedSubmissions.length > 0;
  const latestSubmission = hasSubmission ? sortedSubmissions[0] : null;
  const submissionTimestamp =
    latestSubmission?.updatedAt ?? latestSubmission?.createdAt;

  const dueDateLabel = formatDateTime(assignment?.dueDate);

const formatSubmissionGrade = (submission) => {
  const gradeValue = Number(submission?.grade);
  if (!Number.isFinite(gradeValue)) {
    return "Pending";
  }
  const pointsPossibleValue = Number(assignment?.pointsPossible);
  if (Number.isFinite(pointsPossibleValue)) {
    return `${gradeValue}/${pointsPossibleValue}`;
  }
  return `${gradeValue}`;
};

const getGradeColorClass = (grade) => {
  const gradeValue = Number(grade);
  if (!Number.isFinite(gradeValue)) return null;
  if (gradeValue >= 85) return styles.previewGradeSuccess;
  if (gradeValue >= 60) return styles.previewGradeWarning;
  return styles.previewGradeError;
};

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setSuccessMessage(null);
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewModalState({
      status: "idle",
      screenshotUrl: null,
      grade: null,
      error: null,
    });
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setUploadError("Choose a .sldprt file to upload.");
      return;
    }

    setUploading(true);
    setPreviewModalOpen(true);
    setPreviewModalState({
      status: "loading",
      screenshotUrl: null,
      grade: null,
      error: null,
    });
    setUploadError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          method: "POST",
          body: formData,
        }
      );

      const responseText = await response.text();
      let payload = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          // ignore invalid JSON; fallback messages handled below
        }
      }

      if (!response.ok) {
        let message = "Failed to upload submission.";
        if (payload?.error) {
          message = payload.error;
        } else if (responseText?.trim()) {
          message = responseText.trim();
        }
        throw new Error(message);
      }

      const submissionPayload = payload?.submission ?? null;

      setSelectedFile(null);
      setSuccessMessage("Submission uploaded successfully.");
      setPreviewModalState({
        status: "success",
        screenshotUrl: submissionPayload?.screenshotUrl ?? null,
        grade: submissionPayload?.grade ?? null,
        error: null,
      });
      await refetch();
    } catch (err) {
      setUploadError(err?.message || "Failed to upload submission.");
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        grade: null,
        error: err?.message || "Failed to upload submission.",
      });
    } finally {
      setUploading(false);
    }
  };

  const statsCards = useMemo(() => {
    if (!stats) return null;
    return [
      {
        label: "Turned in",
        value: formatPercent(stats.submittedPercent),
        subtext: `${stats.submittedCount}/${stats.totalStudents} students`,
      },
      {
        label: "Correct",
        value: formatPercent(stats.correctPercent),
        subtext: `${stats.correctCount}/${stats.totalStudents} students`,
      },
    ];
  }, [stats]);

  if (loading) {
    return <p>Loading assignment...</p>;
  }

  if (error) {
    return (
      <p style={{ color: "#b00020" }}>
        Failed to load assignment: {error.message}
      </p>
    );
  }

  if (!assignment) {
    return <p style={{ color: "#666" }}>Assignment not found.</p>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <h2 style={{ margin: 0 }}>{assignment.name}</h2>
      </div>
      {dueDateLabel && (
        <p className={styles.meta}>
          Due {dueDateLabel} • {assignment.pointsPossible} pts
        </p>
      )}
      {assignment.description && (
        <>
          <p className={styles.description}>{assignment.description}</p>
          {isStudent && <div className={styles.sectionDivider} />}
        </>
      )}

      {statsCards && !isStudent && (
        <div className={styles.statsGrid}>
          {statsCards.map((card) => (
            <div key={card.label} className={styles.statCard}>
              <div className={styles.statLabel}>{card.label}</div>
              <div className={styles.statValue}>{card.value}</div>
              <div className={styles.statSubtext}>{card.subtext}</div>
            </div>
          ))}
        </div>
      )}

      {isStudent && (
        <div className={styles.uploadBox}>
          <strong>Upload your part</strong>
          <p className={styles.uploadHelper}>
            Submit a .sldprt file to get graded automatically.
          </p>
          <input
            type="file"
            accept=".sldprt"
            onChange={handleFileChange}
            className={styles.fileInput}
          />
          <Button onClick={handleSubmit} disabled={uploading}>
            {uploading ? "Uploading..." : "Upload submission"}
          </Button>
          {uploadError && (
            <p className={`${styles.status} ${styles.statusError}`}>
              {uploadError}
            </p>
          )}
          {successMessage && (
            <p className={`${styles.status} ${styles.statusSuccess}`}>
              {successMessage}
            </p>
          )}
        </div>
      )}

      {isStudent && hasSubmission && (
        <div className={styles.submissionHistory}>
          <div className={styles.historyDivider} />
          <div className={styles.submissionList}>
            {sortedSubmissions.map((submission, index) => {
              const attemptNumber = sortedSubmissions.length - index;
              const timestamp =
                submission?.updatedAt ?? submission?.createdAt ?? null;
              const fileUrl = submission?.fileUrl;
              const fileName =
                submission?.fileName ||
                submission?.fileKey?.split?.("/")?.pop?.() ||
                `submission-${attemptNumber}.sldprt`;
              return (
                <React.Fragment key={submission?.id ?? index}>
                  <div className={styles.submissionEntry}>
                    <div className={styles.submissionRow}>
                      <div className={styles.submissionInfoBlock}>
                        <div className={styles.submissionAttempt}>
                          Attempt {attemptNumber}
                        </div>
                        <div className={styles.submissionDetails}>
                          <span>{formatDateTime(timestamp)}</span>
                          <span>Grade: {formatSubmissionGrade(submission)}</span>
                        </div>
                      </div>
                      {fileUrl && (
                        <Button
                          href={fileUrl}
                          download={fileName}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.downloadButton}
                        >
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                  {index < sortedSubmissions.length - 1 && (
                    <div className={styles.rowDivider} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className={styles.historyDivider} />
        </div>
      )}

      {!isStudent && !statsCards && (
        <p style={{ color: "#666" }}>
          Stats will appear once students begin submitting.
        </p>
      )}

      {!isStudent && hasSubmission && (
        <div className={styles.submissionInfo}>
          Last submission recorded {formatDateTime(submissionTimestamp)}.
        </div>
      )}
      <Modal
        open={previewModalOpen}
        onClose={
          previewModalState.status === "loading" ? undefined : closePreviewModal
        }
        closeOnBackdrop={previewModalState.status !== "loading"}
        title={
          previewModalState.status === "success"
            ? "Submission results"
            : previewModalState.status === "error"
            ? "Upload failed"
            : "Uploading submission"
        }
        footer={
          previewModalState.status === "loading" ? null : (
            <Button onClick={closePreviewModal}>Close</Button>
          )
        }
      >
        <div className={styles.previewModalContent}>
          {previewModalState.status === "loading" && (
            <div className={styles.previewLoading}>
              <Spinner />
              <p className={styles.previewLoadingText}>
                Grading your part…
              </p>
              <p className={styles.previewHint}>
                Hang tight while we analyze your submission.
              </p>
            </div>
          )}
          {previewModalState.status === "success" && (
            <>
              {previewModalState.screenshotUrl ? (
                <img
                  src={previewModalState.screenshotUrl}
                  alt="Submission screenshot"
                  className={styles.previewScreenshot}
                />
              ) : (
                <div className={styles.previewNoScreenshot}>
                  Screenshot not available for this submission.
                </div>
              )}
              <p
                className={`${styles.previewGrade} ${getGradeColorClass(
                  previewModalState.grade
                ) ?? ""}`}
              >
                Grade earned:{" "}
                <strong>
                  {formatSubmissionGrade({
                    grade: previewModalState.grade,
                  })}
                </strong>
              </p>
            </>
          )}
          {previewModalState.status === "error" && (
            <p className={styles.previewError}>{previewModalState.error}</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
