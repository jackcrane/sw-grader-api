import { prisma } from "#prisma";
import { withAuth } from "#withAuth";

const ALLOWED_UNIT_SYSTEMS = new Set(["SI", "MMGS", "CGS", "IPS"]);
const ALLOWED_VISIBILITY = new Set(["INSTANT", "ON_DUE_DATE"]);

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
      unitSystem,
      pointsPossible,
      gradeVisibility,
      volume,
      surfaceArea,
      tolerancePercent,
      dueDate,
    } = req.body ?? {};

    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Assignment name is required." });
    }

    if (!ALLOWED_UNIT_SYSTEMS.has(unitSystem)) {
      return res
        .status(400)
        .json({ error: "A valid unit system must be provided." });
    }

    if (!ALLOWED_VISIBILITY.has(gradeVisibility)) {
      return res.status(400).json({
        error: "gradeVisibility must be either INSTANT or ON_DUE_DATE.",
      });
    }

    const numericPoints = Number(pointsPossible);
    const numericVolume = Number(volume);
    const numericSurfaceArea = Number(surfaceArea);
    const numericTolerance = Number(tolerancePercent);
    const dueDateValue = dueDate ? new Date(dueDate) : null;

    if (
      !Number.isFinite(numericPoints) ||
      !Number.isFinite(numericVolume) ||
      !Number.isFinite(numericSurfaceArea) ||
      !Number.isFinite(numericTolerance) ||
      numericPoints <= 0 ||
      numericVolume <= 0 ||
      numericSurfaceArea <= 0 ||
      numericTolerance <= 0
    ) {
      return res.status(400).json({
        error:
          "Points, volume, surface area, and tolerance must be positive numbers.",
      });
    }

    if (!dueDateValue || Number.isNaN(dueDateValue.getTime())) {
      return res.status(400).json({ error: "A valid due date is required." });
    }

    const assignment = await prisma.assignment.create({
      data: {
        name: trimmedName,
        description: description?.trim() || null,
        unitSystem,
        pointsPossible: numericPoints,
        gradeVisibility,
        volume: numericVolume,
        surfaceArea: numericSurfaceArea,
        tolerancePercent: numericTolerance,
        dueDate: dueDateValue,
      },
    });

    return res.status(201).json(assignment);
  },
];
