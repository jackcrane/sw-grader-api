import React from "react";
import { useAuthContext } from "../context/AuthContext";
import { Page } from "../components/page/Page";

const ErrorScreen = ({ error }) => {
  const { login, isLoggingIn } = useAuthContext();

  return (
    <Page title="FeatureBench – Error">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
        {isLoggingIn ? "Opening login…" : "Try logging in"}
      </button>
    </Page>
  );
};

export default ErrorScreen;
