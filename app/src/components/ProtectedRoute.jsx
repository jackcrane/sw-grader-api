import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthContext();
  const location = useLocation();

  if (!isAuthenticated) {
    const nextPath = `${location.pathname}${location.search || ""}`;
    const loginPath =
      nextPath && nextPath !== "/"
        ? `/login?next=${encodeURIComponent(nextPath)}`
        : "/login";
    console.log(
      `[Navigation] ProtectedRoute blocking ${nextPath || "/"}; redirecting to ${loginPath}.`
    );
    return <Navigate to={loginPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
