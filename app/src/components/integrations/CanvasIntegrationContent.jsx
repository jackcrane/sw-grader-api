import React, { useMemo } from "react";
import { H2 } from "../typography/Typography";
import { Spacer } from "../spacer/Spacer";
import { MonoSection, Section } from "../form/Section";
import { Input } from "../input/Input";
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
  consumerKey = "",
}) => {
  const configUrl = useMemo(() => getConfigUrl(), []);
  const consumerKeyValue = consumerKey || "Generating key...";

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
      <Section title="1. Create a new Canvas LTI app">
        <p>
          From your Canvas course page, click the "Settings" section of your
          course. Then click the "Apps" tab, the "View App Configurations"
          button, and finally the "+ App" button.
        </p>
        <Spacer />
        <video
          autoPlay
          muted
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
        title="2. Fill out the add app form"
        subtitle={
          <>
            <p>Fill in the Add App settings as shown here.</p>
            <p>Be sure to accurately fill in the Consumer Key.</p>
          </>
        }
      >
        <Input value="By URL" readOnly label="Configuration Type" />
        <Spacer />
        <Input value="FeatureBench" readOnly label="Name" />
        <Spacer />
        <Input value={consumerKeyValue} readOnly label="Consumer Key" />
        <Spacer />
        <Input value={configUrl} readOnly label="Config URL" />
      </Section>
      <Section title="3. Verify your connection" last>
        <p>
          In order to finalize and save the connection, you must visit the
          "FeatureBench" page in your Canvas course.
        </p>
        <ol>
          <li>
            Reload the Canvas page. This will make Canvas add the app to your
            navigation menu.
          </li>
          <li>
            Click the "FeatureBench" link in the navigation menu (vertical list
            of pages in your course).
          </li>
          <li>
            If you see a success message and a green checkmark, you're all set!
            If you see an error message, please reach out to us at{" "}
            <a href="mailto:support@featurebench.com">
              support@featurebench.com
            </a>
            .
          </li>
        </ol>
      </Section>
    </>
  );
};
