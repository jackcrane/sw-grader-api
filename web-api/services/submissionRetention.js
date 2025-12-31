import { ValidationError } from "../util/errors.js";

const DEFAULT_MODE = "BEST";
export const SUBMISSION_RETENTION_MODES = new Set(["BEST", "MOST_RECENT"]);

export const normalizeSubmissionRetentionMode = (mode) => {
  if (mode == null) {
    return DEFAULT_MODE;
  }
  const normalized = String(mode).trim().toUpperCase();
  if (!SUBMISSION_RETENTION_MODES.has(normalized)) {
    throw new ValidationError(
      "submission retention mode must be BEST or MOST_RECENT."
    );
  }
  return normalized;
};

const toTimestamp = (submission) => {
  if (!submission) return null;
  const candidate = submission.updatedAt ?? submission.createdAt ?? null;
  if (!candidate) return null;
  const date =
    candidate instanceof Date ? candidate : new Date(candidate);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const parseGradeValue = (submission) => {
  if (!submission) return null;
  const attempt = submission.grade;
  if (Number.isFinite(Number(attempt))) {
    return Number(attempt);
  }
  const unpenalized = submission.unpenalizedGrade;
  if (Number.isFinite(Number(unpenalized))) {
    return Number(unpenalized);
  }
  return null;
};

export const buildAssignmentSubmissionRetentionUpdate = (payload = {}) => {
  const inheritFromCourse =
    payload?.inheritFromCourse === false ? false : true;
  if (inheritFromCourse) {
    return {
      submissionRetentionInheritFromCourse: true,
      submissionRetentionMode: null,
    };
  }

  const normalizedMode = normalizeSubmissionRetentionMode(payload?.mode);

  return {
    submissionRetentionInheritFromCourse: false,
    submissionRetentionMode: normalizedMode,
  };
};

export const buildCourseSubmissionRetention = (course = null) => ({
  mode: course?.submissionRetentionMode ?? DEFAULT_MODE,
});

export const buildAssignmentSubmissionRetention = (assignment = null) => ({
  inheritFromCourse:
    assignment?.submissionRetentionInheritFromCourse === false ? false : true,
  mode: assignment?.submissionRetentionMode ?? DEFAULT_MODE,
});

export const resolveSubmissionRetention = ({ course = null, assignment = null } = {}) => {
  const courseRetention = buildCourseSubmissionRetention(course);
  if (!assignment) {
    return { ...courseRetention, source: "COURSE" };
  }

  const assignmentRetention = buildAssignmentSubmissionRetention(assignment);
  if (assignmentRetention.inheritFromCourse) {
    return { ...courseRetention, source: "COURSE" };
  }

  return {
    mode: assignmentRetention.mode,
    source: "ASSIGNMENT",
  };
};

export const selectSubmissionForRetention = (
  existing,
  candidate,
  mode = DEFAULT_MODE
) => {
  if (!candidate) return existing;
  if (!existing) return candidate;
  const modeValue = normalizeSubmissionRetentionMode(mode);

  if (modeValue === "MOST_RECENT") {
    const existingTs = toTimestamp(existing);
    const candidateTs = toTimestamp(candidate);
    if (candidateTs == null && existingTs == null) return existing;
    if (candidateTs == null) return existing;
    if (existingTs == null) return candidate;
    return candidateTs >= existingTs ? candidate : existing;
  }

  const candidateGrade = parseGradeValue(candidate);
  const existingGrade = parseGradeValue(existing);

  if (candidateGrade != null && existingGrade != null) {
    if (candidateGrade > existingGrade) return candidate;
    if (candidateGrade < existingGrade) return existing;
    const existingTs = toTimestamp(existing);
    const candidateTs = toTimestamp(candidate);
    if (candidateTs == null && existingTs == null) return existing;
    if (candidateTs == null) return existing;
    if (existingTs == null) return candidate;
    return candidateTs >= existingTs ? candidate : existing;
  }

  if (candidateGrade != null) return candidate;
  if (existingGrade != null) return existing;

  const existingTs = toTimestamp(existing);
  const candidateTs = toTimestamp(candidate);
  if (candidateTs == null && existingTs == null) return existing;
  if (candidateTs == null) return existing;
  if (existingTs == null) return candidate;
  return candidateTs >= existingTs ? candidate : existing;
};
