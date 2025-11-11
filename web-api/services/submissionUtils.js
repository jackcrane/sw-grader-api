import crypto from "node:crypto";

export const SUBMISSION_ASSET_PREFIX = "submissions";

export const sanitizeKeySegment = (value, fallback = "item") => {
  if (!value) return fallback;
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || fallback;
};

export const getExtension = (filename, fallback = "") => {
  if (!filename || typeof filename !== "string") return fallback;
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return fallback;
  }
  return filename.slice(lastDot).toLowerCase();
};

export const buildSubmissionAssetKey = ({
  courseId,
  assignmentId,
  userId,
  type,
  extension,
}) => {
  const safeExtension = extension?.startsWith(".")
    ? extension.toLowerCase()
    : extension
    ? `.${extension.toLowerCase()}`
    : "";
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return [
    SUBMISSION_ASSET_PREFIX,
    sanitizeKeySegment(courseId, "course"),
    sanitizeKeySegment(assignmentId, "assignment"),
    sanitizeKeySegment(userId, "user"),
    `${type}-${unique}${safeExtension}`,
  ]
    .filter(Boolean)
    .join("/");
};

export const bufferFromBase64 = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const payload = trimmed.includes(",")
    ? trimmed.substring(trimmed.indexOf(",") + 1)
    : trimmed;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
};

export const computePercentDiff = (expected, actual) => {
  if (!Number.isFinite(expected) || expected === 0) {
    return Number.isFinite(actual) ? 0 : Infinity;
  }
  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
};

export const evaluateSubmissionAgainstSignatures = ({
  assignment,
  measuredVolume,
  measuredSurfaceArea,
  tolerance,
}) => {
  const activeSignatures = Array.isArray(assignment?.signatures)
    ? assignment.signatures.filter((signature) => !signature.deleted)
    : [];

  const evaluateSignature = (signature) => {
    if (!signature) return null;
    const volumeDiff = computePercentDiff(signature.volume, measuredVolume);
    const surfaceDiff = computePercentDiff(
      signature.surfaceArea,
      measuredSurfaceArea
    );
    return {
      signature,
      volumeDiff,
      surfaceDiff,
      withinTolerance: volumeDiff <= tolerance && surfaceDiff <= tolerance,
    };
  };

  const buildAssignmentDiffs = () => {
    const volumeDiff = computePercentDiff(assignment.volume, measuredVolume);
    const surfaceDiff = computePercentDiff(
      assignment.surfaceArea,
      measuredSurfaceArea
    );
    return {
      signature: null,
      volumeDiff,
      surfaceDiff,
      withinTolerance: volumeDiff <= tolerance && surfaceDiff <= tolerance,
    };
  };

  if (activeSignatures.length === 0) {
    const fallbackDiffs = buildAssignmentDiffs();
    return {
      grade: fallbackDiffs.withinTolerance
        ? assignment.pointsPossible
        : 0,
      feedback: null,
      matchingSignatureId: null,
      matchedType: null,
      diffs: fallbackDiffs,
    };
  }

  const correctMatch =
    activeSignatures
      .filter((signature) => signature.type === "CORRECT")
      .map(evaluateSignature)
      .find((result) => result && result.withinTolerance) ?? null;

  if (correctMatch) {
    return {
      grade: assignment.pointsPossible,
      feedback: null,
      matchingSignatureId: correctMatch.signature.id,
      matchedType: "CORRECT",
      diffs: correctMatch,
    };
  }

  const incorrectMatch =
    activeSignatures
      .filter((signature) => signature.type === "INCORRECT")
      .map(evaluateSignature)
      .find((result) => result && result.withinTolerance) ?? null;

  if (incorrectMatch) {
    const rawPoints = Number(incorrectMatch.signature.pointsAwarded);
    const awarded =
      Number.isFinite(rawPoints) && rawPoints >= 0 ? rawPoints : 0;
    return {
      grade: Math.min(awarded, assignment.pointsPossible),
      feedback: incorrectMatch.signature.feedback || null,
      matchingSignatureId: incorrectMatch.signature.id,
      matchedType: "INCORRECT",
      diffs: incorrectMatch,
    };
  }

  const referenceSignature =
    activeSignatures.find((signature) => signature.type === "CORRECT") ??
    activeSignatures[0] ??
    null;
  const referenceDiffs =
    evaluateSignature(referenceSignature) ?? buildAssignmentDiffs();

  return {
    grade: referenceDiffs.withinTolerance ? assignment.pointsPossible : 0,
    feedback: null,
    matchingSignatureId: referenceSignature?.id ?? null,
    matchedType: referenceSignature?.type ?? null,
    diffs: referenceDiffs,
  };
};

