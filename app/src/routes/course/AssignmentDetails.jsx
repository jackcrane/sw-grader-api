import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { Button } from "../../components/button/Button";
import { SubmissionPreviewModal } from "../../components/submissionPreview/SubmissionPreviewModal";
import { useAssignmentDetails } from "../../hooks/useAssignmentDetails";
import { useGraderStatus } from "../../hooks/useGraderStatus";
import { parseGradeValue } from "../../utils/gradeUtils";
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

const formatName = (user) => {
  if (!user) return "Unknown";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed student";
};

const formatAttemptCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return "0 attempts";
  }
  return count === 1 ? "1 attempt" : `${count} attempts`;
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
    teacherSubmissions,
  } = useAssignmentDetails(courseId, assignmentId);
  const { online: graderOnline } = useGraderStatus();

  const isStudent = enrollmentType === "STUDENT";
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalState, setPreviewModalState] = useState({
    status: "idle",
    screenshotUrl: null,
    gradeValue: null,
    gradeLabel: null,
    feedback: null,
    error: null,
    downloadUrl: null,
    downloadFilename: null,
  });
  const [queueStatus, setQueueStatus] = useState(null);
  const [trackingSubmissionId, setTrackingSubmissionId] = useState(null);
  const eventSourceRef = useRef(null);

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
  const graderOffline = graderOnline === false;

  const formatSubmissionGrade = useCallback(
    (submission) => {
      const gradeValue = parseGradeValue(submission?.grade);
      if (gradeValue == null) {
        return "Not yet graded";
      }
      const pointsPossibleValue = Number(assignment?.pointsPossible);
      if (Number.isFinite(pointsPossibleValue)) {
        return `${gradeValue}/${pointsPossibleValue}`;
      }
      return `${gradeValue}`;
    },
    [assignment]
  );

  const stopQueueTracking = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setTrackingSubmissionId(null);
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setSuccessMessage(null);
    setQueueStatus(null);
    stopQueueTracking();
  };

  const closePreviewModal = () => {
    stopQueueTracking();
    setQueueStatus(null);
    setPreviewModalOpen(false);
    setPreviewModalState({
      status: "idle",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      feedback: null,
      error: null,
      downloadUrl: null,
      downloadFilename: null,
    });
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setUploadError("Choose a .sldprt file to upload.");
      return;
    }

    setUploading(true);
    stopQueueTracking();
    setQueueStatus(null);
    setTrackingSubmissionId(null);
    setPreviewModalOpen(true);
    setPreviewModalState({
      status: "loading",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      feedback: null,
      downloadUrl: null,
      downloadFilename: null,
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
      const queuePayload = payload?.queue ?? null;
      const hintFeedback =
        submissionPayload?.feedback ?? payload?.analysis?.feedback ?? null;
      const autoGradingPending =
        payload?.autoGradingPending ??
        submissionPayload?.autoGradingPending ??
        submissionPayload?.grade == null;

      setSelectedFile(null);
      setSuccessMessage(
        payload?.message ||
          (autoGradingPending
            ? "Submission queued for grading."
            : "Submission uploaded successfully.")
      );
      const successGradeValue = submissionPayload?.grade ?? null;
      if (!autoGradingPending) {
        setPreviewModalState({
          status: "success",
          screenshotUrl: submissionPayload?.screenshotUrl ?? null,
          gradeValue: successGradeValue,
          gradeLabel: formatSubmissionGrade({
            grade: successGradeValue,
          }),
          feedback: hintFeedback,
          downloadUrl: submissionPayload?.fileUrl ?? null,
          downloadFilename: submissionPayload?.fileName ?? null,
          error: null,
        });
      } else {
        setQueueStatus(() => {
          if (!queuePayload) return null;
          const queueAheadCount =
            queuePayload.queueAheadCount ?? queuePayload.aheadCount ?? 0;
          return {
            state: queueAheadCount > 0 ? "queued" : "processing",
            queueAheadCount,
            queuePosition:
              queuePayload.queuePosition ?? queuePayload.position ?? null,
            queueSize: queuePayload.queueSize ?? null,
          };
        });
        if (submissionPayload?.id) {
          setTrackingSubmissionId(submissionPayload.id);
        }
      }
      await refetch();
    } catch (err) {
      setUploadError(err?.message || "Failed to upload submission.");
      setQueueStatus(null);
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: null,
        feedback: null,
        downloadUrl: null,
        downloadFilename: null,
        error: err?.message || "Failed to upload submission.",
      });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!trackingSubmissionId || !courseId || !assignmentId) return undefined;
    const statusUrl = `/api/courses/${courseId}/assignments/${assignmentId}/submissions/${trackingSubmissionId}/status`;
    const source = new EventSource(statusUrl);
    eventSourceRef.current = source;

    const handleStatus = (event) => {
      if (!event?.data) return;
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload) return;

      if (payload.state === "graded" && payload.submission) {
        const gradedSubmission = payload.submission;
        const gradeValue = parseGradeValue(gradedSubmission?.grade);
        setPreviewModalState({
          status: "success",
          screenshotUrl: gradedSubmission?.screenshotUrl ?? null,
          gradeValue,
          gradeLabel: formatSubmissionGrade(gradedSubmission),
          feedback: gradedSubmission?.feedback ?? null,
          downloadUrl: gradedSubmission?.fileUrl ?? null,
          downloadFilename:
            gradedSubmission?.fileName ??
            gradedSubmission?.fileKey?.split?.("/")?.pop?.() ??
            null,
          error: null,
        });
        setQueueStatus(null);
        setSuccessMessage("Submission graded.");
        stopQueueTracking();
        refetch();
        return;
      }

      if (payload.state === "error" || payload.state === "missing") {
        setPreviewModalState({
          status: "error",
          screenshotUrl: null,
          gradeValue: null,
          gradeLabel: null,
          feedback: null,
          downloadUrl: null,
          downloadFilename: null,
          error:
            payload.error ||
            "Unable to monitor the grading request. Check your submissions list.",
        });
        setQueueStatus(payload);
        stopQueueTracking();
        return;
      }

      if (payload.state === "timeout") {
        setPreviewModalState({
          status: "error",
          screenshotUrl: null,
          gradeValue: null,
          gradeLabel: null,
          feedback: null,
          downloadUrl: null,
          downloadFilename: null,
          error:
            payload.error ||
            "Grading is taking longer than expected. We'll keep working on it.",
        });
        setQueueStatus(payload);
        stopQueueTracking();
        return;
      }

      setQueueStatus(payload);
    };

    source.addEventListener("status", handleStatus);
    source.onerror = () => {
      setQueueStatus((prev) =>
        prev
          ? { ...prev, error: "Connection lost. Attempting to reconnect…" }
          : { state: "queued", error: "Connection lost. Attempting to reconnect…" }
      );
    };

    return () => {
      source.removeEventListener("status", handleStatus);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [
    trackingSubmissionId,
    courseId,
    assignmentId,
    formatSubmissionGrade,
    refetch,
    stopQueueTracking,
  ]);

  useEffect(() => {
    return () => {
      stopQueueTracking();
    };
  }, [stopQueueTracking]);

  const showSubmissionInModal = (submission) => {
    stopQueueTracking();
    setQueueStatus(null);
    const previewGradeValue = parseGradeValue(submission?.grade);
    setPreviewModalOpen(true);
    setPreviewModalState({
      status: "success",
      screenshotUrl: submission?.screenshotUrl ?? null,
      gradeValue: previewGradeValue,
      gradeLabel: formatSubmissionGrade({
        grade: previewGradeValue,
      }),
      feedback: submission?.feedback ?? null,
      downloadUrl: submission?.fileUrl ?? null,
      downloadFilename:
        submission?.fileName ||
        submission?.fileKey?.split?.("/")?.pop?.() ||
        null,
      error: null,
    });
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

  const teacherStudentCount = teacherSubmissions.length;
  const teacherTotalAttempts = teacherSubmissions.reduce(
    (sum, submission) => sum + (Number(submission?.attemptCount) || 0),
    0
  );

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
          {graderOffline && (
            <p className={styles.statusWarning}>
              Auto-grading is temporarily offline. You can still submit, and
              we&rsquo;ll grade it automatically once the worker comes back
              online.
            </p>
          )}
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
                          <span>
                            Grade: {formatSubmissionGrade(submission)}
                          </span>
                        </div>
                      </div>
                      {fileUrl && (
                        <Button
                          onClick={() => showSubmissionInModal(submission)}
                        >
                          View
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

      {!isStudent && teacherSubmissions?.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.teacherSubmissionsHeader}>
            <div className={styles.sectionTitle}>Student submissions</div>
            <p className={styles.sectionMeta}>
              Latest submission from {teacherStudentCount} student
              {teacherStudentCount === 1 ? "" : "s"} · {teacherTotalAttempts} attempt
              {teacherTotalAttempts === 1 ? "" : "s"}
            </p>
          </div>
          <div className={styles.teacherSubmissionList}>
            {teacherSubmissions.map((submission, index) => (
              <React.Fragment
                key={submission?.id ?? `${submission?.userId}-${index}`}
              >
                <div className={styles.teacherSubmissionEntry}>
                  <div className={styles.teacherSubmissionInfo}>
                    <div className={styles.teacherSubmissionName}>
                      {formatName(submission.user)}
                    </div>
                    <div className={styles.teacherSubmissionDetails}>
                      <span>{formatDateTime(submission.updatedAt)}</span>
                      <span>Grade: {formatSubmissionGrade(submission)}</span>
                      <span>{formatAttemptCount(submission.attemptCount)}</span>
                    </div>
                  </div>
                  <Button onClick={() => showSubmissionInModal(submission)}>
                    View
                  </Button>
                </div>
                {index < teacherSubmissions.length - 1 && (
                  <div className={styles.rowDivider} />
                )}
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {!isStudent && hasSubmission && (
        <div className={styles.submissionInfo}>
          Last submission recorded {formatDateTime(submissionTimestamp)}.
        </div>
      )}
      <SubmissionPreviewModal
        open={previewModalOpen}
        status={previewModalState.status}
        screenshotUrl={previewModalState.screenshotUrl}
        gradeValue={previewModalState.gradeValue}
        gradeLabel={previewModalState.gradeLabel}
        feedback={previewModalState.feedback}
        downloadUrl={previewModalState.downloadUrl}
        downloadFilename={previewModalState.downloadFilename}
        error={previewModalState.error}
        queueStatus={queueStatus}
        onClose={closePreviewModal}
      />
    </div>
  );
};
