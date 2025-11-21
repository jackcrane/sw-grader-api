import bcrypt from "bcryptjs";
import prisma from "./prisma.js";

const SALT_ROUNDS = 12;

export const normalizeEmail = (email = "") =>
  String(email).trim().toLowerCase();

export const findUserByEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);
  return prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
};

export const findUserById = (id) => {
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
  });
};

export const createUserWithPassword = async ({
  email,
  password,
  firstName = null,
  lastName = null,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
  return prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
    },
  });
};

export const verifyPassword = async (user, password) => {
  if (!user?.passwordHash) return false;
  return bcrypt.compare(String(password), user.passwordHash);
};
