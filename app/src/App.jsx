import React from "react";
import { useAuth } from "./hooks/useAuth";

const App = () => {
  const {
    user,
    error,
    isLoading,
    isAuthenticated,
    login,
    logout,
    isLoggingIn,
    isLoggingOut,
  } = useAuth();

  if (isLoading) {
    return <main>Checking your session…</main>;
  }

  if (error) {
    return (
      <main>
        <h1>Something went wrong</h1>
        <p>{error.message}</p>
        <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
          {isLoggingIn ? "Opening login…" : "Try logging in"}
        </button>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Welcome</h1>
        <p>You need to sign in to view the dashboard.</p>
        <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
          {isLoggingIn ? "Opening login…" : "Sign in"}
        </button>
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>
          Hello, {user?.firstName} {user?.lastName}
        </h1>
        <p>{user?.email}</p>
      </header>
      <section>
        <h2>Raw profile</h2>
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </section>
      <button type="button" onClick={() => logout?.()} disabled={isLoggingOut}>
        {isLoggingOut ? "Signing out…" : "Sign out"}
      </button>
    </main>
  );
};

export default App;
