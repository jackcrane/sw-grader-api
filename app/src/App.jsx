import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

const ProtectedRoute = ({ isAuthenticated, children }) => {
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

const LoginPage = ({ login, isLoggingIn, isAuthenticated }) => {
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <main>
      <h1>Welcome</h1>
      <p>You need to sign in to view the dashboard.</p>
      <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
        {isLoggingIn ? "Opening login…" : "Sign in"}
      </button>
    </main>
  );
};

const Dashboard = ({ user, logout, isLoggingOut }) => (
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

const ErrorScreen = ({ error, login, isLoggingIn }) => (
  <main>
    <h1>Something went wrong</h1>
    <p>{error.message}</p>
    <button type="button" onClick={() => login?.()} disabled={isLoggingIn}>
      {isLoggingIn ? "Opening login…" : "Try logging in"}
    </button>
  </main>
);

const App = () => {
  const auth = useAuth();

  if (auth.isLoading) {
    return <main>Checking your session…</main>;
  }

  if (auth.error) {
    return (
      <ErrorScreen
        error={auth.error}
        login={auth.login}
        isLoggingIn={auth.isLoggingIn}
      />
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginPage
              login={auth.login}
              isLoggingIn={auth.isLoggingIn}
              isAuthenticated={auth.isAuthenticated}
            />
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute isAuthenticated={auth.isAuthenticated}>
              <Dashboard
                user={auth.user}
                logout={auth.logout}
                isLoggingOut={auth.isLoggingOut}
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <Navigate to={auth.isAuthenticated ? "/" : "/login"} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
