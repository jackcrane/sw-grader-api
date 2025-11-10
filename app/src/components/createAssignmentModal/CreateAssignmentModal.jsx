import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../modal/Modal";
import { Row } from "../flex/Flex";
import { Button } from "../button/Button";
import { Section } from "../form/Section";
import { Input, Select, Textarea } from "../input/Input";

const getInitialPartDetails = () => ({
  volume: "",
  surfaceArea: "",
  centerOfMass: { x: "", y: "", z: "" },
  screenshotB64: "",
  units: {},
});

export const CreateAssignmentModal = ({
  open,
  onClose,
  onCreateAssignment,
  courseId,
}) => {
  // form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [correctFile, setCorrectFile] = useState(null); // File | null
  const [unitSystem, setUnitSystem] = useState("SI"); // "SI" | "MMGS" | "CGS" | "IPS"
  const [pointsPossible, setPointsPossible] = useState("");
  const [gradeVisibility, setGradeVisibility] = useState("INSTANT");
  const [dueDate, setDueDate] = useState("");
  const [tolerancePercent, setTolerancePercent] = useState("0.1");
  const [partDetails, setPartDetails] = useState(getInitialPartDetails);

  // ui state
  const [submitting, setSubmitting] = useState(false);
  const [prescanState, setPrescanState] = useState("idle"); // "idle" | "uploading" | "success" | "error"
  const [prescanError, setPrescanError] = useState(null);

  // reset when closing
  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setCorrectFile(null);
      setUnitSystem("SI");
      setPointsPossible("");
      setGradeVisibility("INSTANT");
      setDueDate("");
      setTolerancePercent("0.1");
      setSubmitting(false);
      setPrescanState("idle");
      setPrescanError(null);
      setPartDetails(getInitialPartDetails());
    }
  }, [open]);

  useEffect(() => {
    if (!courseId || !correctFile || !unitSystem) return;

    const isSldprt = (correctFile.name?.toLowerCase?.() || "").endsWith(
      ".sldprt"
    );
    if (!isSldprt) return;

    const controller = new AbortController();
    let cancelled = false;

    const uploadPrescan = async () => {
      console.log("uploadPrescan");
      setPrescanState("uploading");
      setPrescanError(null);

      try {
        const formData = new FormData();
        formData.append("file", correctFile);

        const response = await fetch(
          `/api/courses/${courseId}/assignments/prescan?unitSystem=${encodeURIComponent(
            unitSystem
          )}`,
          {
            method: "POST",
            body: formData,
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          let message = "Failed to upload file for prescan.";
          try {
            const data = await response.json();
            message = data?.error || message;
          } catch {
            const fallback = await response.text();
            if (fallback) {
              message = fallback;
            }
          }
          throw new Error(message);
        }

        if (!cancelled) {
          try {
            const data = await response.json();
            setPartDetails({
              volume: data?.volume ?? "",
              surfaceArea: data?.surfaceArea ?? "",
              centerOfMass: {
                x: data?.centerOfMass?.x ?? "",
                y: data?.centerOfMass?.y ?? "",
                z: data?.centerOfMass?.z ?? "",
              },
              screenshotB64: data?.screenshotB64 ?? "",
              units: data?.units ?? {},
            });
          } catch (error) {
            console.error("Failed to parse prescan response", error);
          }
          setPrescanState("success");
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setPrescanState("error");
        setPrescanError(error?.message || "Failed to upload file for prescan.");
      }
    };

    uploadPrescan();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [correctFile, unitSystem, courseId]);

  // simple validation
  const isValid = useMemo(() => {
    const pts = Number(pointsPossible);
    const vol = Number(partDetails.volume);
    const area = Number(partDetails.surfaceArea);
    const tol = Number(tolerancePercent);
    const dueDateTime = new Date(dueDate);
    return (
      Boolean(name.trim()) &&
      Boolean(dueDate) &&
      !Number.isNaN(dueDateTime.getTime()) &&
      correctFile instanceof File &&
      ["SI", "MMGS", "CGS", "IPS"].includes(unitSystem) &&
      Number.isFinite(pts) &&
      Number.isFinite(vol) &&
      Number.isFinite(area) &&
      Number.isFinite(tol) &&
      pts > 0 &&
      vol > 0 &&
      area > 0 &&
      tol > 0 &&
      (correctFile?.name?.toLowerCase?.() || "").endsWith(".sldprt")
    );
  }, [
    name,
    dueDate,
    correctFile,
    unitSystem,
    pointsPossible,
    partDetails,
    tolerancePercent,
  ]);

  const handleCreateAssignment = async () => {
    if (!onCreateAssignment || !isValid) return;
    try {
      setSubmitting(true);
      const dueDateISO = new Date(dueDate).toISOString();
      await onCreateAssignment({
        name: name.trim(),
        description: description.trim() || null,
        dueDate: dueDateISO,
        unitSystem, // "SI" | "MMGS" | "CGS" | "IPS"
        pointsPossible: Number(pointsPossible), // number
        gradeVisibility, // "INSTANT" | "ON_DUE_DATE"
        volume: Number(partDetails.volume),
        surfaceArea: Number(partDetails.surfaceArea),
        tolerancePercent: Number(tolerancePercent),
      });
      onClose?.();
    } catch (error) {
      console.error("Failed to create assignment", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const nextFile = e.target.files?.[0] ?? null;
    setCorrectFile(nextFile);
    setPrescanState("idle");
    setPrescanError(null);
    setPartDetails(getInitialPartDetails());
  };

  const handleUnitSystemChange = (e) => {
    const value = e.target.value;
    setUnitSystem(value);
    if (correctFile) {
      setPrescanState("idle");
      setPrescanError(null);
    }
  };

  const handlePartDetailChange = (key) => (e) => {
    setPartDetails((prev) => ({
      ...prev,
      [key]: e.target.value,
    }));
  };

  const handleCenterOfMassChange = (axis) => (e) => {
    setPartDetails((prev) => ({
      ...prev,
      centerOfMass: {
        ...prev.centerOfMass,
        [axis]: e.target.value,
      },
    }));
  };

  const prescanMessage =
    prescanState === "uploading"
      ? "Uploading part for prescan..."
      : prescanState === "success"
      ? "Prescan uploaded successfully."
      : prescanState === "error"
      ? prescanError
      : null;

  const prescanColor =
    prescanState === "success"
      ? "#0a7d29"
      : prescanState === "error"
      ? "#b00020"
      : "#555";

  const formatUnitLabel = (label, unitKey) => {
    const unitSuffix = partDetails.units?.[unitKey];
    if (!unitSuffix) return label;
    return `${label} (${unitSuffix})`;
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
            onClick={handleCreateAssignment}
            variant="primary"
            disabled={!isValid || submitting}
          >
            {submitting ? "Creating..." : "Create assignment"}
          </Button>
        </Row>
      }
    >
      <Section title="Assignment Details">
        <Input
          label="Name"
          placeholder="e.g., HW 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Textarea
          label="Description"
          placeholder="What is this assignment about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
        <Input
          label="Due date"
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Section>
      <Section
        title="Part Upload"
        subtitle={
          <>
            <p>Tell us some basic details about your part.</p>
          </>
        }
      >
        <Select
          label="Unit System"
          value={unitSystem}
          onChange={handleUnitSystemChange}
          options={[
            { value: "SI", label: "MKS (SI)" },
            { value: "MMGS", label: "mmGS" },
            { value: "CGS", label: "CGS" },
            { value: "IPS", label: "IPS" },
          ]}
        />
        <Input
          label="Correct File"
          placeholder="Upload a .sldprt"
          type="file"
          accept=".sldprt"
          // your Input likely forwards the native event
          onChange={handleFileChange}
        />
        {prescanMessage && (
          <p
            style={{
              fontSize: 12,
              marginTop: 4,
              color: prescanColor,
            }}
          >
            {prescanMessage}
          </p>
        )}
      </Section>

      <Section
        title="Part Details"
        subtitle={
          partDetails.screenshotB64 ? (
            <img
              src={`data:image/png;base64,${partDetails.screenshotB64}`}
              alt="Part preview"
              style={{
                width: "100%",
                maxWidth: 320,
                borderRadius: 8,
                border: "1px solid #e1e1e1",
              }}
            />
          ) : undefined
        }
      >
        <Input
          label={formatUnitLabel("Volume", "volume")}
          type="number"
          value={partDetails.volume}
          onChange={handlePartDetailChange("volume")}
        />
        <Input
          label={formatUnitLabel("Surface Area", "surfaceArea")}
          type="number"
          value={partDetails.surfaceArea}
          onChange={handlePartDetailChange("surfaceArea")}
        />
        <Input
          label="Tolerance percent (recommended 0.1%-0.5%)"
          type="number"
          value={tolerancePercent}
          onChange={(e) => setTolerancePercent(e.target.value)}
          min={0}
          step="0.01"
        />
      </Section>

      <Section title="Grading" last={true}>
        <Input
          label="Points possible"
          placeholder="e.g., 100"
          type="number"
          value={pointsPossible}
          onChange={(e) => setPointsPossible(e.target.value)}
          min={1}
          step={1}
        />
        <Select
          label="Grade Visibility"
          value={gradeVisibility}
          onChange={(e) => setGradeVisibility(e.target.value)}
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
