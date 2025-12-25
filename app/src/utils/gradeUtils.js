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

export const formatScoreWithPoints = (score, pointsPossible) => {
  const numericScore = parseGradeValue(score);
  if (numericScore == null) return null;
  const pointsNumber = Number(pointsPossible);
  if (Number.isFinite(pointsNumber)) {
    return `${numericScore}/${pointsNumber}`;
  }
  return `${numericScore}`;
};

export const getLatePenaltyLabel = ({
  grade,
  unpenalizedGrade,
  pointsPossible,
}) => {
  const raw = parseGradeValue(unpenalizedGrade);
  const penalized = parseGradeValue(grade);
  if (raw == null || penalized == null) return null;
  if (raw <= penalized + 0.001) return null;
  const original = formatScoreWithPoints(unpenalizedGrade, pointsPossible);
  return original
    ? `Late penalty applied (original score ${original}).`
    : "Late penalty applied.";
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
