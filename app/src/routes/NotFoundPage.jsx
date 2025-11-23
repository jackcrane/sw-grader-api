import React from "react";
import { useLocation } from "react-router-dom";
import { Page } from "../components/page/Page";
import { Spacer } from "../components/spacer/Spacer";
import { Button } from "../components/button/Button";
import { useAuthContext } from "../context/AuthContext";

const buttonRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
};

const pathBadgeStyle = {
  display: "inline-block",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 12,
  fontWeight: 600,
};

export const NotFoundPage = () => {
  const location = useLocation();
  const { isAuthenticated, user } = useAuthContext();
  const homeHref = isAuthenticated ? "/app" : "/";

  return (
    <Page title="FeatureBench – Page not found" user={user}>
      <div style={{ maxWidth: 480, margin: "64px auto" }}>
        <div style={pathBadgeStyle}>{location.pathname || "/"}</div>
        <Spacer size={0.5} />
        <h1 style={{ marginBottom: 8 }}>We can’t find that page</h1>
        <p style={{ color: "#475467", lineHeight: 1.6 }}>
          The link might be out of date or you may not have access to this course or
          assignment. You can head back to your courses or retry your previous
          action.
        </p>
        <Spacer />
        <div style={buttonRowStyle}>
          <Button onClick={() => (window.location.href = homeHref)}>
            {isAuthenticated ? "Go to my courses" : "Go to homepage"}
          </Button>
          <Button variant="ghost" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </Page>
  );
};

export default NotFoundPage;
