import React from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/page/Page";

const ErrorScreen = ({ error }) => {
  return (
    <Page title="FeatureBench – Error">
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <Link to="/login">Return to login</Link>
    </Page>
  );
};

export default ErrorScreen;
