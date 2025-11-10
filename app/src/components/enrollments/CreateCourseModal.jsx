import React, { useEffect, useState } from "react";
import { Modal } from "../modal/Modal";
import { Row } from "../flex/Flex";
import { Button } from "../button/Button";
import { Section } from "../form/Section";
import { Input } from "../input/Input";

export const CreateCourseModal = ({ open, onClose, onCreateCourse }) => {
  const [courseName, setCourseName] = useState("");
  const [courseAbbr, setCourseAbbr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCourseName("");
      setCourseAbbr("");
      setSubmitting(false);
    }
  }, [open]);

  const handleCreateCourse = async () => {
    if (!onCreateCourse) return;

    try {
      setSubmitting(true);
      await onCreateCourse({
        name: courseName,
        abbr: courseAbbr,
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
