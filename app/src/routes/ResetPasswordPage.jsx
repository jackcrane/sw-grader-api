import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Page } from "../components/page/Page";
import { Input } from "../components/input/Input";
import { Button } from "../components/button/Button";
import { fetchJson } from "../utils/fetchJson";
import styles from "./LoginPage.module.css";
import { useAuthContext } from "../context/AuthContext";

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const auth = useAuthContext();

  const [status, setStatus] = useState(token ? "checking" : "missing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    if (!token) {
      setStatus("missing");
      return () => {
        isSubscribed = false;
      };
    }

    setStatus("checking");
    fetchJson(`/api/auth/reset?token=${encodeURIComponent(token)}`)
      .then((payload) => {
        if (!isSubscribed) return;
        setEmail(payload.email || "");
        setStatus("ready");
      })
      .catch(() => {
        if (isSubscribed) setStatus("invalid");
      });

    return () => {
      isSubscribed = false;
    };
  }, [token]);

  const heading = useMemo(() => {
    if (status === "success") return "Password updated";
    if (status === "ready") return "Choose a new password";
    if (status === "invalid") return "Reset link expired";
    if (status === "missing") return "Missing reset link";
    return "Verifying reset link";
  }, [status]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!token || status !== "ready" || completed) return;

      setFormError(null);
      setIsSubmitting(true);

      try {
        await fetchJson("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        setCompleted(true);
        setStatus("success");
        try {
          await auth.refreshSession({ suppressLoadingState: true });
        } catch {
          // ignore refresh errors; the user can continue with the new session
        }
      } catch (err) {
        if (err?.info?.error === "password_too_short") {
          setFormError(
            `Passwords must be at least ${err?.info?.minLength ?? 8} characters long.`
          );
        } else if (err?.info?.error === "invalid_token") {
          setStatus("invalid");
        } else if (err?.info?.error === "missing_password") {
          setFormError("Please enter a new password.");
        } else {
          setFormError(err?.message || "Unable to reset your password.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [auth, completed, password, status, token]
  );

  const renderContent = () => {
    if (status === "missing") {
      return (
        <p className={styles.subtitle}>
          This reset link is missing or invalid.{" "}
          <Link to="/forgot-password">Request a new link</Link>.
        </p>
      );
    }

    if (status === "checking") {
      return <p className={styles.subtitle}>Hold on while we verify your link…</p>;
    }

    if (status === "invalid") {
      return (
        <p className={styles.subtitle}>
          This reset link has expired or was already used.{" "}
          <Link to="/forgot-password">Request a new reset email</Link> to try again.
        </p>
      );
    }

    if (status === "success") {
      return (
        <>
          <p className={styles.subtitle}>
            Your password has been updated. You can continue to your dashboard now.
          </p>
          <div className={styles.actions}>
            <Link to="/app">Go to FeatureBench</Link>
          </div>
        </>
      );
    }

    return (
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          disabled={isSubmitting}
        />
        {email && (
          <div className={styles.notice}>
            Resetting password for <strong>{email}</strong>
          </div>
        )}
        {formError && (
          <div className={styles.error} role="alert">
            {formError}
          </div>
        )}
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || completed}
            isLoading={isSubmitting}
          >
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    );
  };

  return (
    <Page title="FeatureBench password reset">
      <div className={styles.container}>
        <section className={styles.panel}>
          <h1>{heading}</h1>
          {renderContent()}
        </section>
      </div>
    </Page>
  );
};

export default ResetPasswordPage;
