const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const normalizeLatePolicy = (policy = {}) => {
  const allowLateSubmissions =
    policy?.allowLateSubmissions === false ? false : true;
  const maxLatenessMinutes = (() => {
    const numeric = toNumber(policy?.maxLatenessMinutes);
    return numeric != null && numeric >= 0 ? numeric : null;
  })();
  const penaltyPercent = (() => {
    const numeric = toNumber(policy?.penaltyPercent);
    return numeric != null && numeric > 0 ? numeric : null;
  })();
  const penaltyType = penaltyPercent ? policy?.penaltyType ?? null : null;

  return {
    allowLateSubmissions,
    maxLatenessMinutes,
    penaltyPercent,
    penaltyType,
  };
};

export const resolveAssignmentLatePolicy = (assignment, course) => {
  const coursePolicy = normalizeLatePolicy({
    allowLateSubmissions: course?.latePolicyAllowLateSubmissions,
    maxLatenessMinutes: course?.latePolicyMaxLatenessMinutes,
    penaltyPercent: course?.latePolicyPenaltyPercent,
    penaltyType: course?.latePolicyPenaltyType,
  });

  if (assignment?.latePolicyInheritFromCourse === false) {
    const override = normalizeLatePolicy({
      allowLateSubmissions: assignment?.latePolicyAllowLateSubmissions,
      maxLatenessMinutes: assignment?.latePolicyMaxLatenessMinutes,
      penaltyPercent: assignment?.latePolicyPenaltyPercent,
      penaltyType: assignment?.latePolicyPenaltyType,
    });
    return { ...override, source: "ASSIGNMENT" };
  }

  return { ...coursePolicy, source: "COURSE" };
};

export const minutesToHoursValue = (minutes) => {
  const numeric = toNumber(minutes);
  if (numeric == null) return "";
  const hours = numeric / 60;
  if (Math.abs(hours - Math.round(hours)) < 1e-9) {
    return String(Math.round(hours));
  }
  return (Math.round(hours * 100) / 100).toString();
};

export const hoursToMinutesValue = (hours) => {
  if (hours === null || hours === undefined || hours === "") return null;
  const numeric = Number(hours);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 60);
};

export const describeLatePolicy = (policy) => {
  const normalized = normalizeLatePolicy(policy);
  if (normalized.allowLateSubmissions === false) {
    return "Late submissions are disabled.";
  }

  const parts = ["Late submissions are allowed."];
  if (normalized.maxLatenessMinutes != null) {
    const hours = normalized.maxLatenessMinutes / 60;
    const days = normalized.maxLatenessMinutes / (60 * 24);
    const durationLabel =
      days >= 1
        ? `${Math.round(days * 10) / 10} day${days >= 2 ? "s" : ""}`
        : `${Math.round(hours * 10) / 10} hour${hours === 1 ? "" : "s"}`;
    parts.push(`Limit: ${durationLabel} past the deadline.`);
  }

  if (normalized.penaltyPercent != null) {
    const penaltyLabel =
      normalized.penaltyType === "PER_DAY"
        ? `${normalized.penaltyPercent}% per day late`
        : `${normalized.penaltyPercent}% flat penalty`;
    parts.push(`Penalty: ${penaltyLabel}.`);
  }

  return parts.join(" ");
};

export const computeLateStatus = ({ dueDate, policy, now = Date.now() }) => {
  if (!dueDate) return { isLate: false, locked: false, minutesLate: 0 };
  const dueTs = new Date(dueDate).getTime();
  if (!Number.isFinite(dueTs)) {
    return { isLate: false, locked: false, minutesLate: 0 };
  }
  const diff = now - dueTs;
  if (diff <= 0) {
    return { isLate: false, locked: false, minutesLate: 0 };
  }

  const minutesLate = diff / 60000;
  const normalized = normalizeLatePolicy(policy);
  const maxMinutes = normalized.maxLatenessMinutes;
  const locked =
    normalized.allowLateSubmissions === false ||
    (maxMinutes != null && minutesLate > maxMinutes);

  return {
    isLate: true,
    locked,
    minutesLate,
  };
};
