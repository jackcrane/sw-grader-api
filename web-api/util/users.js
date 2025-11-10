import prisma from "./prisma.js";

const buildUserPayload = (workosUser) => {
  if (!workosUser) return null;

  const email = workosUser.email;
  if (!email) {
    throw new Error("WorkOS user is missing an email address");
  }

  return {
    workosId: workosUser.id,
    email,
    firstName: workosUser.firstName ?? null,
    lastName: workosUser.lastName ?? null,
  };
};

export const syncUserFromWorkOs = async (workosUser) => {
  const payload = buildUserPayload(workosUser);
  if (!payload) return null;

  return prisma.user.upsert({
    where: { workosId: payload.workosId },
    create: payload,
    update: {
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
  });
};
