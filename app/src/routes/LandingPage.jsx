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
import createCourse from "../../assets/create-course.png";
import goodBad from "../../assets/good-bad.png";
import join from "../../assets/join.png";
import shareCodes from "../../assets/share-codes.png";
import submissionImage from "../../assets/submission.png";
const journeySteps = [
  {
    title: "Teacher creates course",
    detail: (
      <>
        <p>
          Define courses and set assignments before inviting learners. A teacher
          can create as many courses as they want.
        </p>
        <p>
          Teachers decide how they want billing to work for their class: by
          course where the school pays for FeatureBench, of where each student
          pays for their own account.
        </p>
      </>
    ),
    screenshot: createCourse,
  },
  {
    title: "Teacher shares access codes to students and TAs",
    detail: (
      <>
        <p>
          Distribute enrollment codes so the right people can join and review.
        </p>
        <p>
          Put the student invite code in your syllabus or otherwise distribute
          it to your students.
        </p>
        <p>
          Invite TAs or other instructors to join your course and help you
          administer your class.
        </p>
        <p>
          Roll and Regenerate codes as needed to ensure your class is always
          private and secure.
        </p>
      </>
    ),
    screenshot: shareCodes,
  },
  {
    title: "Students create accounts and enroll",
    detail: (
      <>
        <p>
          Students create their accounts, sign in, claim their seat, and gain
          access to assignments.
        </p>
        <p>
          Teachers retain full control over their students' accounts and can
          manually control who is in their class.
        </p>
      </>
    ),
    screenshot: join,
  },
  {
    title: "Teacher creates assignments and uploads known good parts",
    detail: (
      <>
        <p>
          Teachers create assignments by uploading a known good part.
          FeatureBench will automatically scan the part and use it as a
          "signature" to grade submissions.
        </p>
        <p>
          Teachers can upload multiple good parts, bad parts, and partial credit
          examples to account for common mistakes.
        </p>
        <p>
          Teachers can attach reference comments to specific signatures,
          allowing you to provide hints and guidance for specific mistakes.
        </p>
      </>
    ),
    screenshot: goodBad,
  },
  {
    title: "Students submit assignments and get instantly auto graded",
    detail: (
      <>
        <p>
          Submissions trigger automated grading, giving instant results and
          feedback.
        </p>
        <p>
          Students are afforded the opportunity to iteratively improve their
          work guided by automatic instant feedback.
        </p>
        <p>
          Take your TAs out of the feedback loop and let your students learn
          without waiting and your TAs focus on teaching.
        </p>
      </>
    ),
    screenshot: submissionImage,
  },
];

const pricingPlans = [
  {
    key: "course",
    title: "Course billing",
    price: "$12",
    subtitle: "Billed to the course each semester",
    cta: "Contact sales",
  },
  {
    key: "student",
    title: "Student billing",
    price: "$20",
    subtitle: "Billed to the student each semester",
    cta: "Invite students",
  },
];

const sharedFeatures = [
  "Full support for unlimited students",
  "Unlimited TAs",
  "Unlimited assignments",
  "Up to 250 Solidworks auto grader invocations per student",
];

export const LandingPage = () => {
  const { isAuthenticated } = useAuthContext();
  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return (
    <Page
      title="FeatureBench | Solidworks autograding"
      subheaderItems={[
        {
          label: "About FeatureBench",
          href: "#about",
        },
        {
          label: "Start-Up",
          href: "#startup",
        },
        {
          label: "Pricing",
          href: "#pricing",
        },
      ]}
    >
      <section className={styles.hero} id="about">
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
      <section className={styles.journey} id="startup">
        <div className={styles.journeyHeader}>
          <p className={styles.jetStream}>Journey</p>
          <h2>Guiding every step from setup to success</h2>
          <p>
            Bring instructors, TAs, and students into one seamless loop where
            assignments move smoothly and results are instant.
          </p>
        </div>
        <div className={styles.journeyTimeline}>
          {journeySteps.map((step, index) => (
            <div key={step.title} className={styles.journeyRow}>
              <div className={styles.journeyMeta}>
                <span className={styles.stepNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </div>
              <div className={styles.journeyMedia}>
                <img src={step.screenshot} alt={step.title} loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className={styles.journey} id="pricing">
        <div className={styles.journeyHeader}>
          <p className={styles.jetStream}>Pricing</p>
          <h2>Accessible pricing to you and your students</h2>
          <p>
            FeatureBench meets your needs and capabilities for billing. We
            understand that payment approvals can block progress, so we offer to
            ability for the course to cover the costs and enrollments be free
            for students, or for students to pay for their own account and make
            FeatureBench free for the course.
          </p>
        </div>
        <div className={styles.pricingTableWrapper}>
          <table className={styles.pricingTable}>
            <thead>
              <tr>
                <th></th>
                {pricingPlans.map((plan) => (
                  <th key={plan.key}>
                    <p className={styles.tablePlanTitle}>{plan.title}</p>
                    <p className={styles.tablePlanSubtitle}>{plan.subtitle}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Price</th>
                {pricingPlans.map((plan) => (
                  <td key={`${plan.key}-price`}>
                    <span className={styles.cardPrice}>{plan.price}</span>
                    <span className={styles.priceSuffix}>
                      /student/semester
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <th>Features</th>
                <td colSpan={2}>
                  <div className={styles.featureList}>
                    {sharedFeatures.map((feature) => (
                      <p key={feature}>{feature}</p>
                    ))}
                  </div>
                </td>
              </tr>
              <tr>
                <th></th>
                {pricingPlans.map((plan) => (
                  <td key={`${plan.key}-cta`}>
                    <Button variant="primary">{plan.cta}</Button>
                  </td>
                ))}
              </tr>
              <tr style={{ backgroundColor: "var(--body" }}>
                <th>Additional invocations</th>
                <td colSpan={2} className={styles.invocationNoteCell}>
                  Available to the course at 1,000 invocations for $10
                  regardless of the billing scheme chosen.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
};

export default LandingPage;
