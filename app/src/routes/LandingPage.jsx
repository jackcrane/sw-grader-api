import React from "react";
import { Navigate } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";

const LandingPage = () => {
  const { login, isLoggingIn, isAuthenticated } = useAuthContext();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page title="FeatureBench">
      <main>
        <header>
          <h1 className="title">Welcome to FeatureBench</h1>
          <p>Sign in to access your dashboard and manage submissions.</p>
        </header>
        <section>
          <p>Ready to get started?</p>
          <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
            {isLoggingIn ? "Opening login…" : "Sign in with your account"}
          </button>
        </section>
      </main>
    </Page>
  );
};

export default LandingPage;
