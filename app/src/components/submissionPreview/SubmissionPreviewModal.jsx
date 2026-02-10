import React from "react";
import { Modal } from "../modal/Modal";
import { Button } from "../button/Button";
import { Spinner } from "../spinner/Spinner";
import {
  parseGradeValue,
  SUBMISSION_STATUS_LABELS,
} from "../../utils/gradeUtils";
import styles from "./SubmissionPreviewModal.module.css";

const getTitle = (status) => {
  if (status === "success") return "Submission results";
  if (status === "error") return "Upload failed";
  return "Uploading submission";
};

const getGradeColorClass = (grade) => {
  const gradeValue = parseGradeValue(grade);
  if (gradeValue == null) return null;
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
  feedback,
  downloadUrl,
  downloadFilename,
  error,
  queueStatus,
  onClose,
  latePenaltyLabel,
  manualGradeEnabled = false,
  manualGradeValue = "",
  manualGradeError = null,
  manualGradeSaving = false,
  onManualGradeChange = () => {},
  onManualGradeSubmit = () => {},
  navigation,
}) => {
  if (!open) return null;

  const queueAheadCount =
    queueStatus?.queueAheadCount ?? queueStatus?.aheadCount ?? 0;
  const queuePosition =
    queueStatus?.queuePosition ?? queueStatus?.position ?? queueAheadCount + 1;
  const queueSize = queueStatus?.queueSize ?? queueStatus?.queueDepth ?? null;
  const queueState =
    queueStatus?.state ?? (queueAheadCount > 0 ? "queued" : "processing");

  const navigationIndex = navigation?.currentIndex ?? 0;
  const navigationTotal = navigation?.totalSubmissions ?? 0;
  const canNavigate =
    navigationTotal > 1 &&
    typeof navigation?.onPrevious === "function" &&
    typeof navigation?.onNext === "function";

  const manualGradeInputValue =
    manualGradeValue == null ? "" : String(manualGradeValue);
  const manualGradeHasValue = manualGradeInputValue.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={status !== "loading"}
      title={getTitle(status)}
      footer={
        status === "loading" ? null : (
          <div className={styles.footer}>
            {canNavigate && (
              <div className={styles.footerNav}>
                <Button
                  onClick={navigation.onPrevious}
                  disabled={navigationIndex <= 0}
                >
                  Previous
                </Button>
                <span className={styles.footerNavLabel}>
                  Submission {navigationIndex + 1} of {navigationTotal}
                </span>
                <Button
                  onClick={navigation.onNext}
                  disabled={navigationIndex >= navigationTotal - 1}
                >
                  Next
                </Button>
              </div>
            )}
            {manualGradeEnabled && (
              <div className={styles.manualGrade}>
                <div className={styles.manualGradeControls}>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    value={manualGradeInputValue}
                    className={styles.manualGradeInput}
                    onChange={(event) =>
                      onManualGradeChange(event.target.value ?? "")
                    }
                    data-cy="manual-grade-input"
                  />
                  <Button
                    variant="primary"
                    onClick={onManualGradeSubmit}
                    isLoading={manualGradeSaving}
                    disabled={!manualGradeHasValue}
                    data-cy="manual-grade-save"
                  >
                    Save
                  </Button>
                </div>
                {manualGradeError && (
                  <p className={styles.manualGradeError}>{manualGradeError}</p>
                )}
              </div>
            )}
            <div className={styles.footerActions}>
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
          </div>
        )
      }
    >
      <div className={styles.content}>
        {status === "loading" && (
          <div className={styles.loading}>
            <Spinner />
            <p className={styles.loadingText}>
              {queueState === "processing"
                ? "Grading your part…"
                : "Waiting for your turn…"}
            </p>
            {queueStatus ? (
              <>
                <p className={styles.queuePosition}>
                  {queueAheadCount > 0
                    ? `${queueAheadCount} ${
                        queueAheadCount === 1 ? "submission" : "submissions"
                      } ahead of you`
                    : "You're up next!"}
                </p>
                {queueSize != null && (
                  <p className={styles.queueHelper}>
                    Position {queuePosition} of {queueSize}
                  </p>
                )}
                {queueStatus.error && (
                  <p className={styles.queueError}>{queueStatus.error}</p>
                )}
              </>
            ) : (
              <p className={styles.hint}>
                Hang tight while we analyze your submission.
              </p>
            )}
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
            <p
              className={`${styles.grade} ${getGradeColorClass(gradeValue) ?? ""}`}
            >
              Grade earned:{" "}
              {gradeValue != null ? (
                <strong>
                  {gradeLabel ?? SUBMISSION_STATUS_LABELS.WAITING_FOR_GRADE}
                </strong>
              ) : (
                (gradeLabel ?? SUBMISSION_STATUS_LABELS.WAITING_FOR_GRADE)
              )}
            </p>
            {latePenaltyLabel && (
              <p className={styles.penaltyNote}>{latePenaltyLabel}</p>
            )}
            {feedback && (
              <div className={styles.feedback}>
                <strong>Hint:</strong> {feedback}
              </div>
            )}
          </>
        )}
        {status === "error" && (
          <p className={styles.error}>
            {error ?? "Unable to preview submission."}
          </p>
        )}
      </div>
    </Modal>
  );
};

export { getGradeColorClass };
