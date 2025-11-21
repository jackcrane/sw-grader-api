import React, { useCallback, useEffect, useMemo, useState } from "react";
import classnames from "classnames";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { fetchJson } from "../../utils/fetchJson";
import { Button } from "../button/Button";
import { Spacer } from "../spacer/Spacer";
import styles from "./SetupElement.module.css";
import inputStyles from "../input/Input.module.css";

const stripePromiseCache = new Map();

const getStripePromise = (publishableKey) => {
  if (!publishableKey) return null;
  if (!stripePromiseCache.has(publishableKey)) {
    stripePromiseCache.set(publishableKey, loadStripe(publishableKey));
  }
  return stripePromiseCache.get(publishableKey);
};

const SetupForm = ({ clientSecret, onComplete }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isComplete, setIsComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || submitting || !isComplete || !clientSecret) {
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Unable to load card input.");
      setSubmitting(false);
      return;
    }

    const result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: {
        card: cardElement,
      },
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
      <label className={inputStyles.label}>Enter a card number</label>
      <Spacer size={1} />
      <div
        className={classnames(
          styles.cardInput,
          isFocused && styles.cardInputFocused,
          error && styles.cardInputError
        )}
      >
        <CardElement
          className={styles.cardElement}
          onChange={(event) => setIsComplete(event?.complete ?? false)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          options={{
            hidePostalCode: true,
            style: {
              base: {
                fontSize: "14px",
                color: "var(--surface-contrast-primary)",
                fontFamily: '"Stack Sans Text", system-ui, sans-serif',
                "::placeholder": { color: "rgb(169,169,169)" },
              },
              invalid: {
                color: "var(--danger, #b00020)",
                iconColor: "var(--danger, #b00020)",
              },
            },
          }}
        />
      </div>
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

  if (!stripePromise || !config.clientSecret) {
    return <div>Loading Stripe...</div>;
  }

  const elementsOptions = {
    clientSecret: config.clientSecret,
    fonts: [
      {
        cssSrc:
          "https://fonts.googleapis.com/css2?family=Stack+Sans+Text:wght@400;500;600&display=swap",
      },
    ],
  };

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <SetupForm clientSecret={config.clientSecret} onComplete={onComplete} />
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
