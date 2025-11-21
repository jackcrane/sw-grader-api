import { loadStripe } from "@stripe/stripe-js";

const stripePromiseCache = new Map();

export const getStripePromise = (publishableKey) => {
  if (!publishableKey) return null;
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripePromiseCache.get(publishableKey);
};

export const getStripeClient = async (publishableKey) => {
  const promise = getStripePromise(publishableKey);
  if (!promise) return null;
  return promise;
};
