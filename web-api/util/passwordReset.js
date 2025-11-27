import crypto from "node:crypto";
import prisma from "./prisma.js";

const RESET_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MINUTES = 60;

const now = () => new Date();

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

export const createPasswordResetToken = async (userId) => {
  if (!userId) {
    throw new Error("A userId is required to create a reset token");
  }

  const tokenValue = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(tokenValue);
  const expiresAt = new Date(
    now().getTime() + RESET_TOKEN_TTL_MINUTES * 60 * 1000
  );

  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });

  const record = await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    token: tokenValue,
    expiresAt: record.expiresAt,
  };
};

export const findValidPasswordResetToken = async (token) => {
  if (!token) return null;
  const tokenHash = hashToken(token);
  return prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: {
        gt: now(),
      },
    },
    include: {
      user: true,
    },
  });
};

export const markPasswordResetTokenUsed = async (tokenId) => {
  if (!tokenId) return;
  await prisma.passwordResetToken.updateMany({
    where: { id: tokenId },
    data: {
      usedAt: now(),
    },
  });
};

export const deletePasswordResetTokensForUser = async (userId) => {
  if (!userId) return;
  await prisma.passwordResetToken.deleteMany({
    where: { userId },
  });
};
