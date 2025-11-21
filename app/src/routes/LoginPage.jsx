import React, { useCallback, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";

const LoginPage = () => {
  const {
    login,
    register,
    isLoggingIn,
    isRegistering,
    isAuthenticated,
  } = useAuthContext();
  const [mode, setMode] = useState("login");
  const [formError, setFormError] = useState(null);
  const [formState, setFormState] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  const isSubmitting =
    mode === "login" ? isLoggingIn : isRegistering;

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
    () => (mode === "login" ? "Sign in to FeatureBench" : "Create your account"),
    [mode]
  );

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page title="FeatureBench Login">
      <h1>{heading}</h1>
      <p>
        {mode === "login"
          ? "Enter the credentials you created for FeatureBench."
          : "Provide a few details to create your FeatureBench account."}
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}
      >
        {mode === "register" && (
          <>
            <label>
              First name
              <input
                type="text"
                name="firstName"
                autoComplete="given-name"
                value={formState.firstName}
                onChange={handleChange}
              />
            </label>
            <label>
              Last name
              <input
                type="text"
                name="lastName"
                autoComplete="family-name"
                value={formState.lastName}
                onChange={handleChange}
              />
            </label>
          </>
        )}
        <label>
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={formState.email}
            onChange={handleChange}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            value={formState.password}
            onChange={handleChange}
          />
        </label>
        {formError && (
          <p style={{ color: "#b00020" }} role="alert">
            {formError}
          </p>
        )}
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "login"
              ? "Signing in…"
              : "Creating account…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
      <button
        type="button"
        style={{ marginTop: 16 }}
        onClick={toggleMode}
        disabled={isSubmitting}
      >
        {mode === "login"
          ? "Need an account? Register"
          : "Already have an account? Sign in"}
      </button>
    </Page>
  );
};

export default LoginPage;
