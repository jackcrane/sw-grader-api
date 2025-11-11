const ALLOWED_VISIBILITY = new Set(["INSTANT", "ON_DUE_DATE"]);
const ALLOWED_UNIT_SYSTEMS = new Set(["SI", "MMGS", "CGS", "IPS"]);

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const parsePositiveNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const parseOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeSignaturesPayload = (rawSignatures, pointsPossible) => {
  if (!Array.isArray(rawSignatures) || rawSignatures.length === 0) {
    throw new ValidationError("At least one signature must be provided.");
  }

  const normalized = rawSignatures.map((signature, index) => {
    const type =
      index === 0
        ? "CORRECT"
        : signature?.type === "INCORRECT"
        ? "INCORRECT"
        : "CORRECT";

    const unitSystem = signature?.unitSystem;
    if (!unitSystem || !ALLOWED_UNIT_SYSTEMS.has(unitSystem)) {
      throw new ValidationError(
        `Signature ${index + 1} must include a valid unit system.`
      );
    }

    const volume = parsePositiveNumber(signature?.volume);
    const surfaceArea = parsePositiveNumber(signature?.surfaceArea);
    if (!volume || !surfaceArea) {
      throw new ValidationError(
        `Signature ${index + 1} must include positive volume and surface area.`
      );
    }

    let pointsAwarded = null;
    if (type === "INCORRECT") {
      const parsedPoints =
        signature?.pointsAwarded === null || signature?.pointsAwarded === ""
          ? 0
          : Number(signature.pointsAwarded);
      if (!Number.isFinite(parsedPoints) || parsedPoints < 0) {
        throw new ValidationError(
          `Signature ${index + 1} has invalid pointsAwarded value.`
        );
      }
      if (Number.isFinite(pointsPossible) && parsedPoints > pointsPossible) {
        throw new ValidationError(
          `Signature ${index + 1} cannot award more than the assignment points (${pointsPossible}).`
        );
      }
      pointsAwarded = parsedPoints;
    }

    const centerOfMass = signature?.centerOfMass ?? {};
    const screenshotB64 =
      typeof signature?.screenshotB64 === "string" &&
      signature.screenshotB64.trim()
        ? signature.screenshotB64.trim()
        : null;

    const id =
      typeof signature?.id === "string" && signature.id.trim()
        ? signature.id.trim()
        : null;

    return {
      id,
      sortOrder: index + 1,
      type,
      unitSystem,
      volume,
      surfaceArea,
      centerOfMassX: parseOptionalNumber(centerOfMass?.x),
      centerOfMassY: parseOptionalNumber(centerOfMass?.y),
      centerOfMassZ: parseOptionalNumber(centerOfMass?.z),
      screenshotB64,
      feedback: signature?.feedback?.trim() || null,
      pointsAwarded: type === "INCORRECT" ? pointsAwarded ?? 0 : null,
    };
  });

  const hasCorrect = normalized.some(
    (signature) => signature.type === "CORRECT"
  );
  if (!hasCorrect) {
    throw new ValidationError("At least one correct signature is required.");
  }

  const firstUnitSystem = normalized[0]?.unitSystem;
  const mixedUnits = normalized.some(
    (signature) => signature.unitSystem !== firstUnitSystem
  );
  if (mixedUnits) {
    throw new ValidationError(
      "All signatures must use the same unit system for grading."
    );
  }

  return normalized;
};

export {
  ALLOWED_VISIBILITY,
  ALLOWED_UNIT_SYSTEMS,
  ValidationError,
  normalizeSignaturesPayload,
};
