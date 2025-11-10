import React from "react";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";

export const AppLander = () => {
  const { user, logout, isLoggingOut } = useAuthContext();

  return (
    <Page title="FeatureBench" user={user}>
      <main>
        <header>
          <h1>
            Hello, {user?.firstName} {user?.lastName}
          </h1>
        </header>
        <section>
          <h2>Raw profile</h2>
          <pre>{JSON.stringify(user, null, 2)}</pre>
        </section>
        <button
          type="button"
          onClick={() => logout?.()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "Signing out…" : "Sign out"}
        </button>
      </main>
    </Page>
  );
};
