import React from "react";
import { Navigate } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { Button } from "../components/button/Button";
import styles from "./LandingPage.module.css";

const highlights = [
  {
    label: "1 minute",
    detail: "from example part to live assignment",
  },
  {
    label: "Automatic feedback",
    detail: "for every incorrect submission",
  },
  {
    label: "Easy to use",
    detail: "migrate your class in minutes",
  },
];

const features = [
  {
    title: "Autograding that understands parts",
    description:
      "FeatureBench inspects mass properties data to automatically compare student submissions against a known-good reference part signature.",
  },
  {
    title: "Actionable, specific feedback for students",
    description:
      "You can upload common errors and add hints, then when a student submits their flawed part, FeatureBench will match it against the rubric and provide feedback.",
  },
  {
    title: "Live, iterative homework validation",
    description:
      "Take the guesswork out of homework for your students. With FeatureBench, students can submit their part, get instant feedback, and resubmit until they get it right.",
  },
  {
    title: "Secure, campus-friendly auth",
    description:
      "FeatureBench offers username/password login as well as SSO integration, so FeatureBench can meet your needs for student enrollment.",
  },
];

const steps = [
  {
    title: "Upload your known good part signature",
    description:
      "Drop in the Solidworks part or assembly that represents a perfect submission.",
  },
  {
    title: "Upload or describe common errors",
    description:
      "Provide samples of common errors and hints for students to use.",
  },
  {
    title: "Let students submit",
    description:
      "Submissions grade in seconds, and you keep a clean record for accreditation and rechecks.",
  },
];

const LandingPage = () => {
  const { login, isLoggingIn, isAuthenticated } = useAuthContext();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page title="FeatureBench – Solidworks autograding">
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Solidworks grading, solved</p>
        <h1 className={styles.title}>
          Focus on your students, not checking feature trees
        </h1>
        <p className={styles.lede}>
          FeatureBench autogrades Solidworks submissions so instructors can give
          faster feedback, keep labs on schedule, and spend more time coaching.
        </p>
        <div className={styles.ctaRow}>
          <Button
            variant="primary"
            type="button"
            onClick={() => login?.()}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Opening login…" : "Sign in to get started"}
          </Button>
          <a className={styles.secondaryCta} href="#features">
            See how it works
          </a>
        </div>
        <ul className={styles.highlights}>
          {highlights.map((item) => (
            <li key={item.label} className={styles.highlight}>
              <p className={styles.highlightLabel}>{item.label}</p>
              <p className={styles.highlightDetail}>{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="features" className={styles.featureSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>Why instructors switch</p>
          <h2 className={styles.sectionTitle}>
            Let FeatureBench handle the busywork
          </h2>
          <p className={styles.sectionLead}>
            Every submission is evaluated against your rubric automatically.
          </p>
        </div>
        <div className={styles.featureGrid}>
          {features.map((feature) => (
            <article key={feature.title} className={styles.featureCard}>
              <h3 className={styles.featureCardTitle}>{feature.title}</h3>
              <p className={styles.featureCardBody}>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.stepsSection}>
        <div>
          <p className={styles.sectionEyebrow}>Up and running fast</p>
          <h2 className={styles.sectionTitle}>Three steps to better grading</h2>
          <ul className={styles.stepList}>
            {steps.map((step, index) => (
              <li key={step.title} className={styles.stepItem}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepBody}>{step.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <aside className={styles.quoteCard}>
          <p className={styles.quote}>
            "FeatureBench shaved hours off each lab section. Our TAs spend their
            time coaching instead of sifting through feature trees."
          </p>
          {/* <p className={styles.quoteSource}>
            Sarah Gutierrez, Mechanical Design Lab
          </p> */}
          <Button
            variant="primary"
            type="button"
            onClick={() => login?.()}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? "Opening login…" : "Get started"}
          </Button>
        </aside>
      </section>
    </Page>
  );
};

export default LandingPage;
