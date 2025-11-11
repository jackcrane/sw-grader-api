import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

const ALLOWED_VISIBILITY = new Set(["INSTANT", "ON_DUE_DATE"]);
const ALLOWED_UNIT_SYSTEMS = new Set(["SI", "MMGS", "CGS", "IPS"]);
const signatureInclude = {
  signatures: {
    where: {
      deleted: false,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
};

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const ensureEnrollment = async (userId, courseId) => {
  if (!userId || !courseId) return null;

  return prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      deleted: false,
      course: {
        deleted: false,
      },
    },
  });
};

export const get = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        deleted: false,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: signatureInclude,
    });

    return res.json(assignments);
  },
];

export const post = [
  withAuth,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.localUserId ?? req.user.id;

    const enrollment = await ensureEnrollment(userId, courseId);
    if (!enrollment) {
      return res.status(404).json({ error: "Course enrollment not found." });
    }

    if (!["TEACHER", "TA"].includes(enrollment.type)) {
      return res
        .status(403)
        .json({ error: "Only instructors can create assignments." });
    }

    const {
      name,
      description,
      pointsPossible,
      gradeVisibility,
      tolerancePercent,
      dueDate,
      signatures,
    } = req.body ?? {};

    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Assignment name is required." });
    }

    if (!ALLOWED_VISIBILITY.has(gradeVisibility)) {
      return res.status(400).json({
        error: "gradeVisibility must be either INSTANT or ON_DUE_DATE.",
      });
    }

    const numericPoints = Number(pointsPossible);
    const numericTolerance = Number(tolerancePercent);
    const dueDateValue = dueDate ? new Date(dueDate) : null;

    if (
      !Number.isFinite(numericPoints) ||
      !Number.isFinite(numericTolerance) ||
      numericPoints <= 0 ||
      numericTolerance <= 0
    ) {
      return res.status(400).json({
        error: "Points and tolerance must be positive numbers.",
      });
    }

    if (!dueDateValue || Number.isNaN(dueDateValue.getTime())) {
      return res.status(400).json({ error: "A valid due date is required." });
    }

    let normalizedSignatures = [];
    try {
      normalizedSignatures = normalizeSignaturesPayload(
        signatures,
        numericPoints
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    const firstCorrectSignature = normalizedSignatures.find(
      (signature) => signature.type === "CORRECT"
    );
    if (!firstCorrectSignature) {
      return res
        .status(400)
        .json({ error: "At least one correct signature is required." });
    }

    const assignment = await prisma.assignment.create({
      data: {
        name: trimmedName,
        description: description?.trim() || null,
        unitSystem: firstCorrectSignature.unitSystem,
        pointsPossible: numericPoints,
        gradeVisibility,
        volume: firstCorrectSignature.volume,
        surfaceArea: firstCorrectSignature.surfaceArea,
        tolerancePercent: numericTolerance,
        dueDate: dueDateValue,
      },
    });

    if (normalizedSignatures.length > 0) {
      await prisma.assignmentSignature.createMany({
        data: normalizedSignatures.map((signature) => ({
          ...signature,
          assignmentId: assignment.id,
        })),
      });
    }

    const assignmentWithSignatures = await prisma.assignment.findUnique({
      where: { id: assignment.id },
      include: signatureInclude,
    });

    return res.status(201).json(assignmentWithSignatures);
  },
];

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

    return {
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
