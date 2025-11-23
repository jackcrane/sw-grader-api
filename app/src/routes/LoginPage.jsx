import React, { useCallback, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { Input } from "../components/input/Input";
import { Button } from "../components/button/Button";
import styles from "./LoginPage.module.css";

const sanitizeNextPath = (value) => {
  if (!value || typeof value !== "string") return "/app";
  if (!value.startsWith("/")) return "/app";
  return value;
};

const LoginPage = () => {
  const { login, register, isLoggingIn, isRegistering, isAuthenticated } =
    useAuthContext();
  const location = useLocation();
  const [mode, setMode] = useState("login");
  const [formError, setFormError] = useState(null);
  const [formState, setFormState] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const isRegisterMode = mode === "register";
  const isSubmitting = isRegisterMode ? isRegistering : isLoggingIn;

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  }, []);

  const getErrorMessage = useCallback((error) => {
    const code = error?.info?.error;
    if (code === "invalid_credentials") return "Incorrect email or password.";
    if (code === "email_in_use")
      return "An account with that email already exists.";
    if (code === "password_too_short")
      return "Passwords must be at least 8 characters long.";
    if (code === "missing_fields")
      return "Please complete all required fields.";
    return error?.message || "Authentication failed.";
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setFormError(null);
      try {
        if (mode === "login") {
          await login({
            email: formState.email,
            password: formState.password,
          });
        } else {
          await register({
            email: formState.email,
            password: formState.password,
            firstName: formState.firstName,
            lastName: formState.lastName,
          });
        }
      } catch (err) {
        setFormError(getErrorMessage(err));
      }
    },
    [formState, getErrorMessage, login, mode, register]
  );

  const toggleMode = useCallback(() => {
    setFormError(null);
    setMode((current) => (current === "login" ? "register" : "login"));
  }, []);

  const heading = useMemo(
    () => (isRegisterMode ? "Create your account" : "Sign in to FeatureBench"),
    [isRegisterMode]
  );

  const subheading = useMemo(
    () =>
      isRegisterMode
        ? "Create an account to start using FeatureBench."
        : "Enter the credentials you created for FeatureBench.",
    [isRegisterMode]
  );

  const searchParams = new URLSearchParams(location.search);
  const nextParam = searchParams.get("next") || "";
  const nextPath = sanitizeNextPath(nextParam);

  if (isAuthenticated) {
    return <Navigate to={nextPath} replace />;
  }

  return (
    <Page title="FeatureBench Login">
      <div className={styles.container}>
        <section className={styles.panel}>
          <h1>{heading}</h1>
          <p className={styles.subtitle}>{subheading}</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            {isRegisterMode && (
              <>
                <Input
                  label="First name"
                  name="firstName"
                  autoComplete="given-name"
                  value={formState.firstName}
                  onChange={handleChange}
                  placeholder="John"
                />
                <Input
                  label="Last name"
                  name="lastName"
                  autoComplete="family-name"
                  value={formState.lastName}
                  onChange={handleChange}
                  placeholder="Doe"
                />
              </>
            )}
            <Input
              label="Email address"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={formState.email}
              onChange={handleChange}
              placeholder="you@example.edu"
            />
            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete={
                isRegisterMode ? "new-password" : "current-password"
              }
              required
              value={formState.password}
              onChange={handleChange}
              placeholder="••••••••"
              minLength={isRegisterMode ? 8 : undefined}
            />
            {formError && (
              <div className={styles.error} role="alert">
                {formError}
              </div>
            )}
            <div className={styles.actions}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
              >
                {isSubmitting
                  ? isRegisterMode
                    ? "Creating account…"
                    : "Signing in…"
                  : isRegisterMode
                  ? "Create account"
                  : "Sign in"}
              </Button>
            </div>
          </form>
          <div className={styles.toggle}>
            {isRegisterMode ? "Already have an account?" : "Need an account?"}{" "}
            <button type="button" onClick={toggleMode} disabled={isSubmitting}>
              {isRegisterMode ? "Sign in instead" : "Create one"}
            </button>
          </div>
        </section>
      </div>
    </Page>
  );
};

export default LoginPage;
