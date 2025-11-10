import React, { useEffect, useState } from "react";
import { Modal } from "../modal/Modal";
import { Row } from "../flex/Flex";
import { Button } from "../button/Button";
import { Section } from "../form/Section";
import { Input, Select } from "../input/Input";

export const CreateAssignmentModal = ({
  open,
  onClose,
  onCreateAssignment,
}) => {
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
    if (!onCreateAssignment) return;

    try {
      setSubmitting(true);
      await onCreateAssignment({
        name: courseName,
        abbr: courseAbbr,
      });
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error("Failed to create course", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Create a new Assignment"
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
            <p>Tell us some basic details about your part.</p>
          </>
        }
      >
        <Input
          placeholder="e.g., Intro to CAD"
          label="Correct File"
          value={courseName}
          onChange={(event) => setCourseName(event.target.value)}
          type="file"
          accept=".sldprt"
        />
        <Select
          label="Unit System"
          // value={assignmentType}
          options={[
            {
              value: "SI",
              label: "MKS (SI)",
            },
            { value: "MMGS", label: "mmGS" },
            { value: "CGS", label: "CGS" },
            { value: "IPS", label: "IPS" },
          ]}
        />
      </Section>
      <Section title="Grading">
        <Input
          placeholder="e.g., 100"
          label="Points possible"
          // value={maxGrade}
          onChange={(event) => setMaxGrade(event.target.value)}
          type="number"
        />
        <Select
          label="Grade Visibility"
          options={[
            { value: "INSTANT", label: "Show grades immediately" },
            {
              value: "ON_DUE_DATE",
              label: "Don't show grades until due date passes",
            },
          ]}
        />
      </Section>
    </Modal>
  );
};
