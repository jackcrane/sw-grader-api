import React from "react";

const ErrorScreen = ({ error, login, isLoggingIn }) => (
  <main>
    <h1>Something went wrong</h1>
    <p>{error.message}</p>
    <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
      {isLoggingIn ? "Opening login…" : "Try logging in"}
    </button>
  </main>
);

export default ErrorScreen;
