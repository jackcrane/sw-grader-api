import React, { useEffect, useState } from "react";
import { Modal } from "../modal/Modal";
import { Row } from "../flex/Flex";
import { Button } from "../button/Button";
import { Section } from "../form/Section";
import { Input } from "../input/Input";
import { SegmentedControl } from "../segmentedControl/SegmentedControl";
import { Spacer } from "../spacer/Spacer";
import { SetupElement } from "../stripe/SetupElement";

export const CreateCourseModal = ({ open, onClose, onCreateCourse }) => {
  const [courseName, setCourseName] = useState("");
  const [courseAbbr, setCourseAbbr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [billing, setBilling] = useState("pay-per-course");

  useEffect(() => {
    if (!open) {
      setCourseName("");
      setCourseAbbr("");
      setSubmitting(false);
      setBilling("pay-per-course");
    }
  }, [open]);

  const handleCreateCourse = async () => {
    if (!onCreateCourse) return;

    try {
      setSubmitting(true);
      await onCreateCourse({
        name: courseName,
        abbr: courseAbbr,
        billingScheme:
          billing === "pay-per-student" ? "PER_STUDENT" : "PER_COURSE",
      });
      if (onClose) {
        onClose();
      }
    } catch (error) {
      // Surface the error to the console for now; UI messaging can come later
      console.error("Failed to create course", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create a new Course"
      open={open}
      onClose={onClose}
      footer={
        <Row gap={2}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateCourse}
            variant="primary"
            disabled={!courseName || !courseAbbr || submitting}
          >
            {submitting ? "Creating..." : "Create course"}
          </Button>
        </Row>
      }
    >
      <Section
        title="Details"
        subtitle={
          <>
            <p>
              Tell us about your course. While you can update this later, it is
              not recommended.
            </p>
          </>
        }
      >
        <Input
          placeholder="e.g., Intro to CAD"
          label="Course name"
          value={courseName}
          onChange={(event) => setCourseName(event.target.value)}
        />
        <Input
          placeholder="e.g., ENGR 1701"
          label="Course abbreviation"
          value={courseAbbr}
          onChange={(event) => setCourseAbbr(event.target.value)}
        />
      </Section>
      <Section
        title="Billing"
        subtitle={
          <>
            <p>
              Pick whether you want your course or students to find your class
              on FeatureBench.
            </p>
            <p>
              Once selected, the billing scheme is locked for this course.
            </p>
          </>
        }
      >
        <SegmentedControl
          options={[
            {
              label: "Course pays",
              value: "pay-per-course",
            },
            {
              label: "Students pay",
              value: "pay-per-student",
            },
          ]}
          value={billing}
          onChange={setBilling}
        />
        <Spacer size={2} />
        {billing === "pay-per-student" && (
          <>
            <p>
              Your students will pay for their own accounts when they enroll in
              your course. Teacher and course access is included.
            </p>
            <Spacer size={2} />
            <p>
              Students will be required to pay $20 upfront when they enroll in
              your course. This will cover their enrollment for the extent of
              the course.
            </p>
          </>
        )}
        {billing === "pay-per-course" && (
          <>
            <p>
              You as the administrator of the course will provide a payment
              method. This method will be billed $12 per student who enrolls in
              your course.
            </p>
            <Spacer size={2} />
            <SetupElement onReady={() => {}} />
          </>
        )}
      </Section>
      <Section
        title="Student Access"
        subtitle={
          <>
            <p>
              We will create a code to allow students to join your class on
              FeatureBench. This is a code you can put on your course page,
              syllabus, etc.
            </p>
          </>
        }
      ></Section>
      <Section
        title="Instructor Access"
        last
        subtitle={
          <>
            <p>
              We will create a code to allow other instructors, TAs, and
              auditors to join your class on FeatureBench. Instructors have
              access to view course information like rosters and grades.
            </p>
          </>
        }
      ></Section>
    </Modal>
  );
};
