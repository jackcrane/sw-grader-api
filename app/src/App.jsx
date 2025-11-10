import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./routes/LoginPage";
import ErrorScreen from "./routes/ErrorScreen";
import LandingPage from "./routes/LandingPage";
import { AppLander } from "./routes/AppLander";

const App = () => {
  const auth = useAuth();

  if (auth.isLoading) {
    return <main>Checking your session...</main>;
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
          path="/"
          element={
            <LandingPage
              login={auth.login}
              isLoggingIn={auth.isLoggingIn}
              isAuthenticated={auth.isAuthenticated}
            />
          }
        />
        <Route
          path="/api/auth/login"
          element={
            <LoginPage
              login={auth.login}
              isLoggingIn={auth.isLoggingIn}
              isAuthenticated={auth.isAuthenticated}
            />
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute isAuthenticated={auth.isAuthenticated}>
              <AppLander
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
            <Navigate to={auth.isAuthenticated ? "/app" : "/"} replace />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
