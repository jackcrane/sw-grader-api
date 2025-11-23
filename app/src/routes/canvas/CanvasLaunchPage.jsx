import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Page } from "../../components/page/Page";
import { Spacer } from "../../components/spacer/Spacer";
import { Button } from "../../components/button/Button";
import { fetchJson } from "../../utils/fetchJson";

export const CanvasLaunchPage = () => {
  const { launchId } = useParams();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    const consumeLaunch = async () => {
      setStatus("loading");
      setError(null);
      try {
        const payload = await fetchJson(
          `/api/lti/canvas/launches/${encodeURIComponent(launchId)}`
        );
        if (isCancelled) {
          return;
        }
        setStatus("redirecting");
        const target = payload?.assignmentUrl || "/app";
        window.location.replace(target);
      } catch (err) {
        if (isCancelled) {
          return;
        }
        setStatus("error");
        setError(
          err?.info?.message ||
            "We couldn’t continue from Canvas. Try again or return to your courses."
        );
      }
    };
    if (launchId) {
      consumeLaunch();
    } else {
      setStatus("error");
      setError("Missing Canvas launch identifier.");
    }
    return () => {
      isCancelled = true;
    };
  }, [launchId]);

  const renderBody = () => {
    if (status === "loading" || status === "redirecting") {
      return (
        <>
          <p style={{ color: "#4b5563" }}>
            {status === "redirecting"
              ? "Almost there — we’re opening your FeatureBench assignment."
              : "Preparing your FeatureBench assignment…"}
          </p>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            You can close this window if it doesn’t redirect automatically.
          </p>
        </>
      );
    }

    return (
      <>
        <p style={{ color: "#b91c1c" }}>{error}</p>
        <Spacer />
        <Button onClick={() => window.location.reload()} variant="primary">
          Try again
        </Button>
        <Spacer size={0.5} />
        <Button onClick={() => (window.location.href = "/app")} variant="ghost">
          Go to my courses
        </Button>
      </>
    );
  };

  return (
    <Page title="FeatureBench – Canvas launch">
      <div
        style={{
          maxWidth: 520,
          margin: "80px auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #e2e8f0",
          padding: 32,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94a3b8",
          }}
        >
          Canvas • FeatureBench
        </p>
        <Spacer size={0.5} />
        <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>
          Linking your assignment
        </h1>
        {renderBody()}
      </div>
    </Page>
  );
};

export default CanvasLaunchPage;
