const DEFAULT_MODE = "BEST";
const VALID_MODES = new Set(["BEST", "MOST_RECENT"]);

const normalizeMode = (mode) => {
  if (mode == null) {
    return DEFAULT_MODE;
  }
  const normalized = String(mode).trim().toUpperCase();
  if (!VALID_MODES.has(normalized)) {
    return DEFAULT_MODE;
  }
  return normalized;
};

export const SUBMISSION_RETENTION_OPTIONS = [
  { value: "BEST", label: "Keep the best submission" },
  { value: "MOST_RECENT", label: "Keep the most recent submission" },
];

export const describeSubmissionRetentionMode = (mode) => {
  const normalized = normalizeMode(mode);
  if (normalized === "MOST_RECENT") {
    return "Keep the most recent submission.";
  }
  return "Keep the highest graded submission.";
};

export const resolveAssignmentSubmissionRetention = (assignment, course) => {
  const courseMode = normalizeMode(course?.submissionRetentionMode);
  if (assignment?.submissionRetentionInheritFromCourse === false) {
    return {
      mode: normalizeMode(assignment?.submissionRetentionMode),
      source: "ASSIGNMENT",
    };
  }
  return {
    mode: courseMode,
    source: "COURSE",
  };
};
