import React from "react";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { useEnrollments } from "../hooks/useEnrollments";

export const AppLander = () => {
  const { user, logout, isLoggingOut } = useAuthContext();
  const { enrollments, loading } = useEnrollments();

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
        {/* {JSON.stringify(enrollments, null, 2)} */}
      </main>
    </Page>
  );
};
