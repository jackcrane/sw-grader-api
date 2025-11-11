import React from "react";
import { Modal } from "../modal/Modal";
import { Button } from "../button/Button";
import { Spinner } from "../spinner/Spinner";
import styles from "./SubmissionPreviewModal.module.css";

const getTitle = (status) => {
  if (status === "success") return "Submission results";
  if (status === "error") return "Upload failed";
  return "Uploading submission";
};

const getGradeColorClass = (grade) => {
  const gradeValue = Number(grade);
  if (!Number.isFinite(gradeValue)) return null;
  if (gradeValue >= 85) return styles.gradeSuccess;
  if (gradeValue >= 60) return styles.gradeWarning;
  return styles.gradeError;
};

export const SubmissionPreviewModal = ({
  open,
  status,
  screenshotUrl,
  gradeValue,
  gradeLabel,
  downloadUrl,
  downloadFilename,
  error,
  onClose,
}) => {
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={status === "loading" ? undefined : onClose}
      closeOnBackdrop={status !== "loading"}
      title={getTitle(status)}
      footer={
        status === "loading" ? null : (
          <div className={styles.footer}>
            <Button onClick={onClose}>Close</Button>
            {downloadUrl && (
              <Button
                href={downloadUrl}
                download={downloadFilename ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                Download submission
              </Button>
            )}
          </div>
        )
      }
    >
      <div className={styles.content}>
        {status === "loading" && (
          <div className={styles.loading}>
            <Spinner />
            <p className={styles.loadingText}>Grading your part…</p>
            <p className={styles.hint}>Hang tight while we analyze your submission.</p>
          </div>
        )}
        {status === "success" && (
          <>
            {screenshotUrl ? (
              <img
                src={screenshotUrl}
                alt="Submission screenshot"
                className={styles.screenshot}
              />
            ) : (
              <div className={styles.noScreenshot}>
                Screenshot not available for this submission.
              </div>
            )}
            <p className={`${styles.grade} ${getGradeColorClass(gradeValue) ?? ""}`}>
              Grade earned: <strong>{gradeLabel ?? "Pending"}</strong>
            </p>
          </>
        )}
        {status === "error" && (
          <p className={styles.error}>{error ?? "Unable to preview submission."}</p>
        )}
      </div>
    </Modal>
  );
};

export { getGradeColorClass };
