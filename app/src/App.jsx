import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./routes/LoginPage";
import ErrorScreen from "./routes/ErrorScreen";
import LandingPage from "./routes/LandingPage";
import { AppLander } from "./routes/AppLander";
import { CourseLayout } from "./routes/course/CourseLayout";
import { CourseOverview } from "./routes/course/CourseOverview";
import { CourseRoster } from "./routes/course/CourseRoster";
import { CourseGradebook } from "./routes/course/CourseGradebook";
import { AssignmentDetails } from "./routes/course/AssignmentDetails";
import { AssignmentDetailsPlaceholder } from "./routes/course/AssignmentDetailsPlaceholder";
import { CourseDetails } from "./routes/course/CourseDetails";
import { AuthProvider, useAuthContext } from "./context/AuthContext";
import { SWRConfig } from "swr";
import { fetchJson } from "./utils/fetchJson";

const AppRoutes = () => {
  const auth = useAuthContext();

  if (auth.isLoading) {
    return <main>Checking your session...</main>;
  }

  if (auth.error) {
    return <ErrorScreen error={auth.error} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/api/auth/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLander />
          </ProtectedRoute>
        }
      />
      <Route
        path="/:courseId/*"
        element={
          <ProtectedRoute>
            <CourseLayout />
          </ProtectedRoute>
        }
      >
        <Route path="gradebook" element={<CourseGradebook />} />
        <Route path="roster" element={<CourseRoster />} />
        <Route path="details" element={<CourseDetails />} />
        <Route path="" element={<CourseOverview />}>
          <Route index element={<AssignmentDetailsPlaceholder />} />
          <Route
            path="assignments/:assignmentId"
            element={<AssignmentDetails />}
          />
        </Route>
      </Route>
      <Route
        path="*"
        element={<Navigate to={auth.isAuthenticated ? "/app" : "/"} replace />}
      />
    </Routes>
  );
};

const App = () => (
  <AuthProvider>
    <SWRConfig value={{ fetcher: fetchJson }}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SWRConfig>
  </AuthProvider>
);

export default App;
