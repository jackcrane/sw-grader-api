import React, { useMemo } from "react";
import { H2 } from "../typography/Typography";
import { Spacer } from "../spacer/Spacer";
import { MonoSection, Section } from "../form/Section";
import { Input } from "../input/Input";
import { Button } from "../button/Button";
import canvasLtiSetup from "../../../assets/canvas-lti-setup.mp4";

const getConfigUrl = () => {
  if (typeof window === "undefined") {
    return "https://featurebench.com/integrations/canvas.xml";
  }

  const origin = window.location.origin.replace(/\/+$/, "");
  return `${origin}/integrations/canvas.xml`;
};

export const CanvasIntegrationContent = ({
  heading = "Connect FeatureBench to Canvas",
  description = "Use this checklist to link your Canvas instance so assignment and grade sync can run automatically.",
  showHeading = true,
}) => {
  const configUrl = useMemo(() => getConfigUrl(), []);

  return (
    <>
      {showHeading && (
        <MonoSection>
          <div>
            <H2>{heading}</H2>
            <p style={{ margin: "8px 0 0", color: "#555" }}>{description}</p>
          </div>
        </MonoSection>
      )}
      <Section title="0. Create a new Canvas LTI app">
        <p>
          From your Canvas course page, click the "Settings" section of your
          course. Then click the "Apps" tab, the "View App Configurations"
          button, and finally the "+ App" button.
        </p>
        <Spacer />
        <video
          autoPlay
          muted
          loop
          playsInline
          controls
          style={{
            width: "100%",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <source src={canvasLtiSetup} type="video/mp4" />
        </video>
      </Section>
      <Section
        title="1. Fill out the add app form"
        subtitle={
          <>
            <p>Fill in the Add App settings as shown here.</p>
          </>
        }
        last
      >
        <Input value="By URL" readOnly label="Configuration Type" />
        <Spacer />
        <Input value="FeatureBench" readOnly label="Name" />
        <Spacer />
        <Input value={configUrl} readOnly label="Config URL" />
      </Section>
    </>
  );
};
