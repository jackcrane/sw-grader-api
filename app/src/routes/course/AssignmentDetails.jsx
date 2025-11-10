import React, { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { Button } from "../../components/button/Button";
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
    loading,
    error,
    refetch,
  } = useAssignmentDetails(courseId, assignmentId);

  const isStudent = enrollmentType === "STUDENT";
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  const hasSubmission = Boolean(userSubmission);
  const submissionTimestamp =
    userSubmission?.updatedAt ?? userSubmission?.createdAt;

  const dueDateLabel = formatDateTime(assignment?.dueDate);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setUploadError("Choose a .sldprt file to upload.");
      return;
    }

    setUploading(true);
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

      if (!response.ok) {
        let message = "Failed to upload submission.";
        try {
          const payload = await response.json();
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      setSelectedFile(null);
      setSuccessMessage("Submission uploaded successfully.");
      await refetch();
    } catch (err) {
      setUploadError(err?.message || "Failed to upload submission.");
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
        <p className={styles.description}>{assignment.description}</p>
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
          {hasSubmission && (
            <div className={styles.submissionInfo}>
              Last submitted {formatDateTime(submissionTimestamp)} – Grade:{" "}
              {Number.isFinite(userSubmission?.grade)
                ? `${userSubmission.grade}/${assignment.pointsPossible}`
                : "Pending"}
            </div>
          )}
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
    </div>
  );
};
