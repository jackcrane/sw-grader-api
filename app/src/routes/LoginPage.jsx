import React from "react";
import { Navigate } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";

const LoginPage = () => {
  const { login, isLoggingIn, isAuthenticated } = useAuthContext();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page title="FeatureBench Login">
      <h1>Welcome</h1>
      <p>You need to sign in to view the dashboard.</p>
      <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
        {isLoggingIn ? "Opening login…" : "Sign in"}
      </button>
    </Page>
  );
};

export default LoginPage;
