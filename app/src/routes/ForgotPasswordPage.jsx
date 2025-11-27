import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/page/Page";
import { Input } from "../components/input/Input";
import { Button } from "../components/button/Button";
import { fetchJson } from "../utils/fetchJson";
import styles from "./LoginPage.module.css";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (submitted) return;
      setFormError(null);
      setIsSubmitting(true);
      try {
        await fetchJson("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setSubmitted(true);
      } catch (err) {
        if (err?.info?.error === "missing_email") {
          setFormError("Please enter the email address for your account.");
        } else {
          setFormError(err?.message || "Something went wrong. Try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, submitted]
  );

  return (
    <Page title="Reset your FeatureBench password">
      <div className={styles.container}>
        <section className={styles.panel}>
          <h1>Reset your password</h1>
          <p className={styles.subtitle}>
            Enter the email address associated with your FeatureBench account.
            We&apos;ll send you a link to create a new password.
          </p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <Input
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.edu"
              disabled={submitted}
            />
            {formError && (
              <div className={styles.error} role="alert">
                {formError}
              </div>
            )}
            {submitted && (
              <div className={styles.notice} role="status">
                If an account exists for {email}, we just emailed password reset
                instructions.
              </div>
            )}
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || submitted}
                isLoading={isSubmitting}
              >
                {submitted ? "Email sent" : "Send reset link"}
              </Button>
              <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        </section>
      </div>
    </Page>
  );
};

export default ForgotPasswordPage;
