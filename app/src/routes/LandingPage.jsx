import React from "react";
import { Navigate } from "react-router-dom";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import styles from "./LandingPage.module.css";
import { Button } from "../components/button/Button";
import { CaretDoubleRightIcon } from "@phosphor-icons/react";
import { Carousel } from "../components/carousel/Carousel";
import gradient from "../../assets/gradient.jpg";
import submission from "../../assets/submission.mp4";
import createAssignment from "../../assets/create-assignment.mp4";

const journeySteps = [
  {
    title: "Teacher creates course",
    detail:
      "Define courses and set grading expectations before inviting learners.",
  },
  {
    title: "Teacher shares access codes to students and TAs",
    detail:
      "Distribute enrollment codes so the right people can join and review.",
  },
  {
    title: "Students create accounts and enroll using said course",
    detail:
      "Students sign in, claim their seat, and gain access to assignments.",
  },
  {
    title:
      "Teacher creates assignments and uploads known good and known bad parts and enters optional feedback",
    detail:
      "Build assignments, attach reference models, and add contextual notes.",
  },
  {
    title: "Students submit assignments and get instantly auto graded",
    detail:
      "Submissions trigger automated grading, giving instant results and insights.",
  },
];

export const LandingPage = () => {
  const { isAuthenticated } = useAuthContext();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page title="FeatureBench | Solidworks autograding">
      <section className={styles.hero}>
        <div>
          <h1 className={styles.title}>
            Students learn <span>faster</span> with FeatureBench
          </h1>
        </div>
        <div>
          <p style={{ marginBottom: 8 }}>
            With FeatureBench, students submit their part, get instant feedback,
            and recieve instant grades as they go, all without waiting for a TA
            to grade.
          </p>
          <Button variant="primary">
            Use FeatureBench for your class{" "}
            <CaretDoubleRightIcon style={{ marginLeft: 8 }} weight="bold" />
          </Button>
        </div>
      </section>
      <section>
        <Carousel
          slides={[
            {
              text: "Students submit their part and get instant feedback.",
              video: submission,
            },
            {
              text: "Create assignments and share them with your students.",
              video: createAssignment,
            },
          ]}
          backgroundImage={gradient}
        />
      </section>
    </Page>
  );
};

export default LandingPage;
