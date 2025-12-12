export const parseGradeValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const formatScoredLabel = (gradeValue, pointsPossible) => {
  const pointsNumber = Number(pointsPossible);
  if (Number.isFinite(pointsNumber)) {
    return `${gradeValue}/${pointsNumber}`;
  }
  return `${gradeValue}`;
};

const isDueDatePassed = (dueDate) => {
  if (!dueDate) return false;
  const nextDate = new Date(dueDate).getTime();
  if (!Number.isFinite(nextDate)) return false;
  return Date.now() > nextDate;
};

export const SUBMISSION_STATUS_LABELS = {
  NO_SUBMISSION: "No submission",
  MISSING: "Missing",
  WAITING_FOR_GRADE: "Waiting for grade",
};

export const getSubmissionGradeStatus = ({
  gradeValue,
  hasSubmission,
  dueDate,
}) => {
  if (gradeValue != null) {
    return "scored";
  }
  if (hasSubmission) {
    return "waiting";
  }
  return isDueDatePassed(dueDate) ? "missing" : "no-submission";
};

export const getSubmissionGradeLabel = ({
  gradeValue,
  hasSubmission,
  pointsPossible,
  dueDate,
}) => {
  if (gradeValue != null) {
    return formatScoredLabel(gradeValue, pointsPossible);
  }
  if (hasSubmission) {
    return SUBMISSION_STATUS_LABELS.WAITING_FOR_GRADE;
  }
  return isDueDatePassed(dueDate)
    ? SUBMISSION_STATUS_LABELS.MISSING
    : SUBMISSION_STATUS_LABELS.NO_SUBMISSION;
};
