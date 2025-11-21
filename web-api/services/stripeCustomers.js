import { prisma } from "#prisma";
import { getStripeClient } from "../util/stripe.js";

const resolveUser = async (userOrId) => {
  if (!userOrId) return null;
  if (typeof userOrId === "string") {
    if (!userOrId) return null;
    return prisma.user.findUnique({
      where: { id: userOrId },
    });
  }

  const maybeHasStripeId =
    Object.prototype.hasOwnProperty.call(userOrId, "stripeCustomerId") &&
    typeof userOrId.stripeCustomerId !== "undefined";
  if (maybeHasStripeId) {
    return userOrId;
  }

  const lookupId = userOrId.id ?? userOrId.localUserId ?? null;
  if (!lookupId) return null;
  return prisma.user.findUnique({
    where: { id: lookupId },
  });
};

export const ensureStripeCustomerForUser = async (userOrId) => {
  const user = await resolveUser(userOrId);
  if (!user) {
    throw new Error("Cannot create Stripe customer without a user");
  }

  if (user.stripeCustomerId) {
    return { customerId: user.stripeCustomerId, user };
  }

  const stripe = getStripeClient();
  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const customer = await stripe.customers.create({
    email: user.email,
    name: fullName || undefined,
    metadata: {
      userId: user.id,
    },
  });

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });

  if (typeof userOrId === "object" && userOrId) {
    userOrId.stripeCustomerId = customer.id;
  }

  return { customerId: customer.id, user: updatedUser };
};

export const createSetupIntentForUser = async (userOrId) => {
  const stripe = getStripeClient();
  const { customerId } = await ensureStripeCustomerForUser(userOrId);

  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });
};
