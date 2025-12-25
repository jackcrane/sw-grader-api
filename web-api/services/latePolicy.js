import { ValidationError } from "../util/errors.js";

export const LATE_PENALTY_TYPES = new Set(["FLAT", "PER_DAY"]);
const MINUTES_PER_DAY = 24 * 60;

const parseBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return fallback;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
};

const parseMinutesValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ValidationError(
      "Max lateness must be a non-negative number of minutes."
    );
  }
  if (numeric === 0) return null;
  if (numeric > 10000) {
    throw new ValidationError("Max lateness cannot exceed 10,000 minutes.");
  }
  return Math.round(numeric);
};

const parsePenaltyPercent = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new ValidationError("Penalty percent must be a valid number.");
  }
  if (numeric < 0) {
    throw new ValidationError(
      "Penalty percent must be greater than or equal to 0%."
    );
  }
  if (numeric > 100) {
    throw new ValidationError("Penalty percent cannot exceed 100%.");
  }
  return Math.round(numeric * 100) / 100;
};

const normalizePenaltyType = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!LATE_PENALTY_TYPES.has(normalized)) {
    throw new ValidationError(
      "Penalty type must be either FLAT or PER_DAY when a penalty percent is provided."
    );
  }
  return normalized;
};

const sanitizePositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const sanitizeMinutes = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 10000 ? 10000 : Math.round(numeric);
};

const sanitizePenaltyPercent = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

export const normalizeLatePolicyInput = (input = {}) => {
  const allowLateSubmissions = parseBoolean(
    input.allowLateSubmissions,
    true
  );
  const maxLatenessMinutes = parseMinutesValue(input.maxLatenessMinutes);
  const penaltyPercent = parsePenaltyPercent(input.penaltyPercent);
  const penaltyType =
    penaltyPercent != null ? normalizePenaltyType(input.penaltyType) : null;

  return {
    allowLateSubmissions,
    maxLatenessMinutes,
    penaltyPercent,
    penaltyType,
  };
};

export const buildAssignmentLatePolicyUpdate = (payload = {}) => {
  const inheritFromCourse =
    payload?.inheritFromCourse === false ? false : true;

  if (inheritFromCourse) {
    return {
      latePolicyInheritFromCourse: true,
      latePolicyAllowLateSubmissions: null,
      latePolicyMaxLatenessMinutes: null,
      latePolicyPenaltyPercent: null,
      latePolicyPenaltyType: null,
    };
  }

  const normalized = normalizeLatePolicyInput(payload);
  return {
    latePolicyInheritFromCourse: false,
    latePolicyAllowLateSubmissions: normalized.allowLateSubmissions,
    latePolicyMaxLatenessMinutes: normalized.maxLatenessMinutes,
    latePolicyPenaltyPercent: normalized.penaltyPercent,
    latePolicyPenaltyType: normalized.penaltyPercent
      ? normalized.penaltyType
      : null,
  };
};

export const buildCourseLatePolicy = (course = null) => ({
  allowLateSubmissions:
    course?.latePolicyAllowLateSubmissions === false ? false : true,
  maxLatenessMinutes: sanitizeMinutes(
    course?.latePolicyMaxLatenessMinutes
  ),
  penaltyPercent: sanitizePenaltyPercent(
    course?.latePolicyPenaltyPercent
  ),
  penaltyType: course?.latePolicyPenaltyType ?? null,
});

export const buildAssignmentLatePolicy = (assignment = null) => ({
  inheritFromCourse:
    assignment?.latePolicyInheritFromCourse === false ? false : true,
  allowLateSubmissions:
    assignment?.latePolicyAllowLateSubmissions === false ? false : true,
  maxLatenessMinutes: sanitizeMinutes(
    assignment?.latePolicyMaxLatenessMinutes
  ),
  penaltyPercent: sanitizePenaltyPercent(
    assignment?.latePolicyPenaltyPercent
  ),
  penaltyType: assignment?.latePolicyPenaltyType ?? null,
});

export const resolveLatePolicy = ({ course = null, assignment = null } = {}) => {
  const coursePolicy = buildCourseLatePolicy(course);
  if (!assignment) {
    return { ...coursePolicy, source: "COURSE" };
  }

  const assignmentPolicy = buildAssignmentLatePolicy(assignment);
  if (!assignmentPolicy.inheritFromCourse) {
    return {
      allowLateSubmissions: assignmentPolicy.allowLateSubmissions,
      maxLatenessMinutes: assignmentPolicy.maxLatenessMinutes,
      penaltyPercent: assignmentPolicy.penaltyPercent,
      penaltyType: assignmentPolicy.penaltyType,
      source: "ASSIGNMENT",
    };
  }

  return { ...coursePolicy, source: "COURSE" };
};

const toTimestamp = (value) => {
  if (!value) return null;
  const date =
    value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const computeLatenessInfo = ({ submittedAt, dueDate }) => {
  const dueTimestamp = toTimestamp(dueDate);
  const submittedTimestamp = toTimestamp(submittedAt);
  if (
    !Number.isFinite(dueTimestamp) ||
    !Number.isFinite(submittedTimestamp)
  ) {
    return {
      isLate: false,
      minutesLate: 0,
      msLate: 0,
    };
  }
  const diffMs = submittedTimestamp - dueTimestamp;
  const isLate = diffMs > 0;
  const minutesLate = isLate ? diffMs / (60 * 1000) : 0;
  return {
    isLate,
    minutesLate,
    msLate: diffMs,
  };
};

export const applyLatePolicyToGrade = ({
  policy,
  submittedAt,
  dueDate,
  rawGrade,
}) => {
  const numericRawGrade = Number(rawGrade);
  const hasRawGrade = Number.isFinite(numericRawGrade);
  const base = {
    grade: hasRawGrade ? numericRawGrade : rawGrade ?? null,
    unpenalizedGrade: hasRawGrade ? numericRawGrade : null,
    penaltyApplied: false,
    minutesLate: 0,
    isLate: false,
    reason: null,
  };

  if (!policy || !dueDate || !hasRawGrade) {
    return base;
  }

  const lateness = computeLatenessInfo({ submittedAt, dueDate });
  if (!lateness.isLate) {
    return base;
  }

  const maxMinutes =
    policy.maxLatenessMinutes == null
      ? null
      : Number(policy.maxLatenessMinutes);
  base.minutesLate = lateness.minutesLate;
  base.isLate = true;

  if (policy.allowLateSubmissions === false) {
    return {
      ...base,
      grade: 0,
      penaltyApplied: true,
      reason: "late_disallowed",
    };
  }

  if (
    Number.isFinite(maxMinutes) &&
    maxMinutes >= 0 &&
    lateness.minutesLate > maxMinutes
  ) {
    return {
      ...base,
      grade: 0,
      penaltyApplied: true,
      reason: "late_window_exceeded",
    };
  }

  const penaltyPercent = Number(policy.penaltyPercent);
  if (!Number.isFinite(penaltyPercent) || penaltyPercent <= 0) {
    return base;
  }

  const penaltyType = policy.penaltyType ?? "FLAT";
  const multiplier =
    penaltyType === "PER_DAY"
      ? Math.max(1, Math.ceil(lateness.minutesLate / MINUTES_PER_DAY))
      : 1;

  const effectivePercent = penaltyPercent * multiplier;
  const penaltyAmount = (numericRawGrade * effectivePercent) / 100;
  const nextGrade = Math.max(0, numericRawGrade - penaltyAmount);

  return {
    ...base,
    grade: nextGrade,
    penaltyApplied: penaltyAmount > 0,
    penaltyAmount,
    penaltyPercent: effectivePercent,
    penaltyType,
    penaltyMultiplier: multiplier,
    reason: "late_penalty",
  };
};
