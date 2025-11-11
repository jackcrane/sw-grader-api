import crypto from "crypto";
import { prisma } from "#prisma";

const STUDENT_PREFIX = "STU";
const TA_PREFIX = "TA";
const MAX_ATTEMPTS = 10;

const generateRandomSegment = () =>
  crypto.randomBytes(4).toString("hex").slice(0, 8).toUpperCase();

const codeExists = async (code) =>
  prisma.course.findFirst({
    where: {
      OR: [{ studentInviteCode: code }, { taInviteCode: code }],
    },
    select: { id: true },
  });

const generateUniqueCode = async (prefix) => {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${prefix}-${generateRandomSegment()}`;
    const existing = await codeExists(candidate);
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique invite code");
};

export const generateCourseInviteCodes = async () => ({
  studentInviteCode: await generateUniqueCode(STUDENT_PREFIX),
  taInviteCode: await generateUniqueCode(TA_PREFIX),
});

export const generateInviteCode = async (type) => {
  const normalized = (type ?? "").toLowerCase();
  const prefix = normalized === "student" ? STUDENT_PREFIX : normalized === "ta" ? TA_PREFIX : null;
  if (!prefix) {
    throw new Error("Unsupported invite code type");
  }
  return generateUniqueCode(prefix);
};

export const normalizeInviteCode = (code) =>
  (code ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");

export const findCourseByInviteCode = async (rawCode) => {
  const inviteCode = normalizeInviteCode(rawCode);
  if (!inviteCode) return null;

  const course = await prisma.course.findFirst({
    where: {
      deleted: false,
      OR: [{ studentInviteCode: inviteCode }, { taInviteCode: inviteCode }],
    },
  });

  if (!course) return null;

  const enrollmentType =
    course.studentInviteCode === inviteCode ? "STUDENT" : "TA";

  return { course, enrollmentType };
};
