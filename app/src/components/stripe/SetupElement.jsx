import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { fetchJson } from "../../utils/fetchJson";
import { Button } from "../button/Button";
import { Spacer } from "../spacer/Spacer";

const stripePromiseCache = new Map();

const getStripePromise = (publishableKey) => {
  if (!publishableKey) return null;
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripePromiseCache.get(publishableKey);
};

const SetupForm = ({ onComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isComplete, setIsComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || submitting || !isComplete) {
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "Unable to save payment method.");
    } else if (result.setupIntent?.status === "succeeded") {
      setSuccessMessage("Payment method saved.");
      onComplete?.({
        setupIntentId: result.setupIntent.id,
        paymentMethodId: result.setupIntent.payment_method,
      });
    } else {
      setError("Unable to save payment method. Please try again.");
    }

    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        onChange={(event) => setIsComplete(event?.complete ?? false)}
        options={{
          layout: "tabs",
          paymentMethodTypes: ["card"],
        }}
      />
      {error && (
        <>
          <Spacer size={1} />
          <p style={{ color: "var(--danger-text, #c62828)", fontSize: 14 }}>
            {error}
          </p>
        </>
      )}
      {successMessage && (
        <>
          <Spacer size={1} />
          <p style={{ color: "var(--success-text, #1b873f)", fontSize: 14 }}>
            {successMessage}
          </p>
        </>
      )}
      <Spacer size={1.5} />
      <Button
        type="submit"
        variant="primary"
        disabled={
          !stripe || !isComplete || submitting || Boolean(successMessage)
        }
      >
        {submitting
          ? "Saving..."
          : successMessage
          ? "Saved"
          : "Save payment method"}
      </Button>
    </form>
  );
};

const StripeElementsWrapper = ({ config, onComplete }) => {
  const stripePromise = useMemo(
    () => getStripePromise(config.publishableKey),
    [config.publishableKey]
  );

  const options = useMemo(
    () => ({
      clientSecret: config.clientSecret,
      appearance: {
        theme: "stripe",
      },
      wallets: { link: "never" },
    }),
    [config.clientSecret]
  );

  if (!stripePromise || !config.clientSecret) {
    return <div>Loading Stripe...</div>;
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <SetupForm onComplete={onComplete} />
    </Elements>
  );
};

export const SetupElement = ({ onReady }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  const loadSetupIntent = useCallback(async () => {
    setLoading(true);
    setError("");
    setConfig(null);
    try {
      const payload = await fetchJson("/api/billing/setup-intent", {
        method: "POST",
      });
      setConfig(payload);
    } catch (err) {
      setError(err?.message || "Unable to initialize billing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSetupIntent();
  }, [refreshIndex, loadSetupIntent]);

  const handleComplete = useCallback(
    (payload) => {
      onReady?.(payload);
    },
    [onReady]
  );

  if (loading) {
    return <div>Loading Stripe...</div>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: "var(--danger-text, #c62828)" }}>{error}</p>
        <Spacer size={1} />
        <Button onClick={() => setRefreshIndex((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (!config) {
    return <div>Unable to load billing details.</div>;
  }

  return <StripeElementsWrapper config={config} onComplete={handleComplete} />;
};
