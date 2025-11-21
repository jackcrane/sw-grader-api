import Stripe from "stripe";

let stripeClient = null;

const createStripeClient = () => {
  const secret = process.env.STRIPE_SK;
  if (!secret) {
    throw new Error("STRIPE_SK environment variable is not set");
  }
  return new Stripe(secret, {
    apiVersion: "2024-06-20",
  });
};

export const getStripeClient = () => {
  if (!stripeClient) {
    stripeClient = createStripeClient();
  }
  return stripeClient;
};

export const getStripePublishableKey = () => {
  const publishableKey = process.env.STRIPE_PK;
  if (!publishableKey) {
    throw new Error("STRIPE_PK environment variable is not set");
  }
  return publishableKey;
};

export const assertStripeIsConfigured = () => {
  getStripeClient();
  getStripePublishableKey();
};
