import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal } from "../modal/Modal";
import { Col, Row } from "../flex/Flex";
import { Button } from "../button/Button";
import { Section } from "../form/Section";
import { Input, Select, Textarea } from "../input/Input";
import { useGraderStatus } from "../../hooks/useGraderStatus";

const getInitialPartDetails = () => ({
  volume: "",
  surfaceArea: "",
  centerOfMass: { x: "", y: "", z: "" },
  screenshotB64: "",
  units: {},
});

const getInitialSignature = (unitSystem = "SI", overrides = {}) => ({
  id: null,
  unitSystem,
  file: null, // File | null
  partDetails: getInitialPartDetails(),
  prescanState: "idle", // "idle" | "uploading" | "success" | "error"
  prescanError: null,
  type: "CORRECT", // "CORRECT" | "INCORRECT" (first signature is always treated as CORRECT)
  pointsAwarded: "",
  feedback: "",
  ...overrides,
});

const unitSystemOptions = [
  { value: "SI", label: "MKS (SI)" },
  { value: "MMGS", label: "mmGS" },
  { value: "CGS", label: "CGS" },
  { value: "IPS", label: "IPS" },
];

const formatDateTimeLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const offlineBannerStyle = {
  background: "#fff4d6",
  border: "1px solid #f5c97b",
  borderRadius: 8,
  padding: 12,
  fontSize: 14,
  color: "#8a5b00",
  marginBottom: 12,
};

const SignatureSection = ({
  index,
  isFirst,
  signature,
  courseId,
  validationAttempted,
  signatureErrors,
  onChange,
  onDelete,
  canDelete,
  graderOnline,
}) => {
  const {
    unitSystem,
    file,
    partDetails,
    prescanState,
    prescanError,
    type,
    pointsAwarded,
    feedback,
  } = signature;

  useEffect(() => {
    if (!courseId || !file || !unitSystem) return;
    if (graderOnline === false) return;
    const isSldprt = (file.name?.toLowerCase?.() || "").endsWith(".sldprt");
    if (!isSldprt) return;

    const controller = new AbortController();
    let cancelled = false;

    const uploadPrescan = async () => {
      onChange({ prescanState: "uploading", prescanError: null });
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(
          `/api/courses/${courseId}/assignments/prescan?unitSystem=${encodeURIComponent(
            unitSystem
          )}`,
          { method: "POST", body: formData, signal: controller.signal }
        );

        if (!response.ok) {
          let message = "Failed to upload file for prescan.";
          try {
            const data = await response.json();
            message = data?.error || message;
          } catch {
            const fallback = await response.text();
            if (fallback) message = fallback;
          }
          throw new Error(message);
        }

        if (!cancelled) {
          try {
            const data = await response.json();
            onChange({
              partDetails: {
                volume: data?.volume ?? "",
                surfaceArea: data?.surfaceArea ?? "",
                centerOfMass: {
                  x: data?.centerOfMass?.x ?? "",
                  y: data?.centerOfMass?.y ?? "",
                  z: data?.centerOfMass?.z ?? "",
                },
                screenshotB64: data?.screenshotB64 ?? "",
                units: data?.units ?? {},
              },
            });
          } catch (err) {
            console.error("Failed to parse prescan response", err);
          }
          onChange({ prescanState: "success" });
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        onChange({
          prescanState: "error",
          prescanError: error?.message || "Failed to upload file for prescan.",
        });
      }
    };

    uploadPrescan();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, unitSystem, courseId, graderOnline]);

  const showInvalid = (key) => validationAttempted && signatureErrors?.[key];

  const formatUnitLabel = (label, unitKey) => {
    const unitSuffix = partDetails.units?.[unitKey];
    if (!unitSuffix) return label;
    return `${label} (${unitSuffix})`;
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

  return (
    <Section
      title={`Part Signature ${index + 1}`}
      subtitle={
        <Col gap={8} align="flex-start">
          {isFirst ? (
            <p>
              Tell us some basic details about your part. Uploading a correct
              file is optional, but if you upload one, we’ll fill in details for
              you and students will get better automatic feedback.
            </p>
          ) : (
            <p>
              Define an additional acceptable (or explicitly incorrect/partial)
              variation of the part for grading.
            </p>
          )}
          {canDelete && (
            <Button onClick={onDelete} style={{ marginTop: 8 }}>
              Delete
            </Button>
          )}
          {partDetails.screenshotB64 && (
            <img
              src={`data:image/png;base64,${partDetails.screenshotB64}`}
              alt={`Part ${index + 1} preview`}
              style={{
                width: "100%",
                maxWidth: 320,
                borderRadius: 8,
                border: "1px solid #e1e1e1",
                marginTop: 8,
              }}
            />
          )}
        </Col>
      }
    >
      {!isFirst && (
        <Select
          label="Signature Type"
          value={type}
          onChange={(e) => onChange({ type: e.target.value })}
          options={[
            { value: "CORRECT", label: "Correct" },
            { value: "INCORRECT", label: "Incorrect / Partial" },
          ]}
        />
      )}
      <div />

      <Select
        label="Unit System"
        value={unitSystem}
        onChange={(e) => {
          onChange({ unitSystem: e.target.value });
          if (file) onChange({ prescanState: "idle", prescanError: null });
        }}
        invalid={showInvalid("unitSystem")}
        options={unitSystemOptions}
      />

      {graderOnline === false ? (
        <div style={offlineBannerStyle}>
          The grader is offline, so signature uploads are temporarily
          unavailable. Enter the measurements manually to continue.
        </div>
      ) : (
        <Input
          label="Signature File"
          placeholder="Upload a .sldprt (optional)"
          type="file"
          accept=".sldprt"
          onChange={(e) => {
            const nextFile = e.target.files?.[0] ?? null;
            onChange({
              file: nextFile,
              prescanState: "idle",
              prescanError: null,
              partDetails: getInitialPartDetails(),
            });
          }}
          style={{ marginBottom: 4 }}
        />
      )}

      {prescanMessage && (
        <p style={{ fontSize: 12, marginBottom: 4, color: prescanColor }}>
          {prescanMessage}
        </p>
      )}

      <Input
        label={formatUnitLabel("Volume", "volume")}
        type="number"
        value={partDetails.volume}
        onChange={(e) =>
          onChange({ partDetails: { ...partDetails, volume: e.target.value } })
        }
        invalid={showInvalid("volume")}
      />

      <Input
        label={formatUnitLabel("Surface Area", "surfaceArea")}
        type="number"
        value={partDetails.surfaceArea}
        onChange={(e) =>
          onChange({
            partDetails: { ...partDetails, surfaceArea: e.target.value },
          })
        }
        invalid={showInvalid("surfaceArea")}
      />

      {!isFirst && type === "INCORRECT" && (
        <>
          <Input
            label="Earned point value"
            type="number"
            value={pointsAwarded}
            onChange={(e) => onChange({ pointsAwarded: e.target.value })}
            min={0}
            step="1"
            invalid={showInvalid("pointsAwarded")}
          />
          <Textarea
            label="Feedback / Hints"
            placeholder="Explain what’s wrong and how to fix it (optional)"
            value={feedback}
            onChange={(e) => onChange({ feedback: e.target.value })}
            rows={3}
          />
        </>
      )}
    </Section>
  );
};

export const CreateAssignmentModal = ({
  open,
  onClose,
  onCreateAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
  courseId,
  mode = "create",
  assignment = null,
}) => {
  const { online: graderOnline } = useGraderStatus();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pointsPossible, setPointsPossible] = useState("");
  const [gradeVisibility, setGradeVisibility] = useState("INSTANT");
  const [dueDate, setDueDate] = useState("");
  const [tolerancePercent, setTolerancePercent] = useState("0.1");

  const [signatures, setSignatures] = useState([getInitialSignature("SI")]);

  const [validationAttempted, setValidationAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = mode === "edit" && Boolean(assignment);
  const prevOpenRef = useRef(false);
  const graderOffline = graderOnline === false;

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setPointsPossible("");
    setGradeVisibility("INSTANT");
    setDueDate("");
    setTolerancePercent("0.1");
    setSubmitting(false);
    setValidationAttempted(false);
    setSignatures([getInitialSignature("SI")]);
    setDeleting(false);
  }, []);

  const hydrateFromAssignment = useCallback(() => {
    if (!assignment) {
      resetForm();
      return;
    }

    const signatureUnitFallback =
      assignment.signatures?.[0]?.unitSystem || assignment.unitSystem || "SI";

    const normalizedSignatures =
      assignment.signatures && assignment.signatures.length > 0
        ? assignment.signatures.map((signature, index) => {
            const signatureUnit = signature.unitSystem || signatureUnitFallback;
            return getInitialSignature(signatureUnit, {
              id: signature.id,
              unitSystem: signatureUnit,
              partDetails: {
                volume:
                  signature.volume === null || signature.volume === undefined
                    ? ""
                    : String(signature.volume),
                surfaceArea:
                  signature.surfaceArea === null ||
                  signature.surfaceArea === undefined
                    ? ""
                    : String(signature.surfaceArea),
                centerOfMass: {
                  x:
                    signature.centerOfMassX === null ||
                    signature.centerOfMassX === undefined
                      ? ""
                      : String(signature.centerOfMassX),
                  y:
                    signature.centerOfMassY === null ||
                    signature.centerOfMassY === undefined
                      ? ""
                      : String(signature.centerOfMassY),
                  z:
                    signature.centerOfMassZ === null ||
                    signature.centerOfMassZ === undefined
                      ? ""
                      : String(signature.centerOfMassZ),
                },
                screenshotB64: signature.screenshotB64 ?? "",
                units: signature.units ?? {},
              },
              prescanState: signature.screenshotB64 ? "success" : "idle",
              prescanError: null,
              type: index === 0 ? "CORRECT" : signature.type || "CORRECT",
              pointsAwarded:
                index === 0 || signature.type !== "INCORRECT"
                  ? ""
                  : signature.pointsAwarded === null ||
                    signature.pointsAwarded === undefined
                  ? ""
                  : String(signature.pointsAwarded),
              feedback: signature.feedback ?? "",
            });
          })
        : [getInitialSignature(signatureUnitFallback)];

    setName(assignment.name ?? "");
    setDescription(assignment.description ?? "");
    setPointsPossible(
      assignment.pointsPossible === null ||
        assignment.pointsPossible === undefined
        ? ""
        : String(assignment.pointsPossible)
    );
    setGradeVisibility(assignment.gradeVisibility ?? "INSTANT");
    setDueDate(formatDateTimeLocalInput(assignment.dueDate));
    setTolerancePercent(
      assignment.tolerancePercent === null ||
        assignment.tolerancePercent === undefined
        ? "0.1"
        : String(assignment.tolerancePercent)
    );
    setSignatures(normalizedSignatures);
    setValidationAttempted(false);
    setSubmitting(false);
  }, [assignment, resetForm]);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (isEditMode) {
        hydrateFromAssignment();
      } else {
        resetForm();
      }
    } else if (!open && prevOpenRef.current) {
      resetForm();
    }
    prevOpenRef.current = open;
  }, [open, isEditMode, hydrateFromAssignment, resetForm]);

  const signaturesErrors = useMemo(() => {
    const ptsPossibleNum = Number(pointsPossible);
    return signatures.map((sig, idx) => {
      const vol = Number(sig.partDetails.volume);
      const area = Number(sig.partDetails.surfaceArea);
      const unitValid = ["SI", "MMGS", "CGS", "IPS"].includes(sig.unitSystem);

      let pointsAwardedError = false;
      if (idx > 0 && sig.type === "INCORRECT") {
        const pts = Number(sig.pointsAwarded);
        pointsAwardedError =
          !Number.isFinite(pts) ||
          pts < 0 ||
          (Number.isFinite(ptsPossibleNum) && pts > ptsPossibleNum);
      }

      return {
        unitSystem: !unitValid,
        volume: !Number.isFinite(vol) || vol <= 0,
        surfaceArea: !Number.isFinite(area) || area <= 0,
        pointsAwarded: pointsAwardedError,
      };
    });
  }, [signatures, pointsPossible]);

  const overallErrors = useMemo(() => {
    const pts = Number(pointsPossible);
    const dueDateTime = new Date(dueDate);
    const tol = Number(tolerancePercent);

    const hasAtLeastOneCorrect =
      signatures.length > 0 &&
      (signatures[0] ? true : signatures.some((s) => s.type === "CORRECT"));

    const perSignatureValid = signaturesErrors.every((errs) =>
      Object.values(errs).every((v) => !v)
    );

    return {
      name: !name.trim(),
      dueDate: !dueDate || Number.isNaN(dueDateTime.getTime()),
      pointsPossible: !Number.isFinite(pts) || pts <= 0,
      tolerancePercent: !Number.isFinite(tol) || tol <= 0,
      signatures: !perSignatureValid,
      atLeastOneCorrect: !hasAtLeastOneCorrect,
    };
  }, [
    name,
    dueDate,
    pointsPossible,
    tolerancePercent,
    signaturesErrors,
    signatures,
  ]);

  const isValid = useMemo(
    () => Object.values(overallErrors).every((hasError) => !hasError),
    [overallErrors]
  );

  const showInvalidTop = (key) => validationAttempted && overallErrors[key];

  const updateSignature = (index, partial) => {
    setSignatures((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = { ...current, ...partial };
      // enforce invariant: first signature is always CORRECT
      if (index === 0 && next[0].type !== "CORRECT") next[0].type = "CORRECT";
      return next;
    });
  };

  const addSignature = () => {
    const baseUnit = signatures[0]?.unitSystem || "SI";
    setSignatures((prev) => [...prev, getInitialSignature(baseUnit)]);
  };

  // Only allow deleting non-first signatures, and only if more than one exists.
  const canDeleteSignature = (index) => index !== 0 && signatures.length > 1;

  const deleteSignature = (index) => {
    if (!canDeleteSignature(index)) return;
    setSignatures((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return prev;
      // keep invariant in case order changed elsewhere
      if (next[0].type !== "CORRECT") next[0] = { ...next[0], type: "CORRECT" };
      return next;
    });
  };

  const handleSubmitAssignment = async () => {
    setValidationAttempted(true);
    if (!isValid) return;

    try {
      setSubmitting(true);
      const dueDateISO = new Date(dueDate).toISOString();

      const signaturePayloads = signatures.map((s, i) => ({
        id: s.id ?? null,
        order: i + 1,
        type: i === 0 ? "CORRECT" : s.type,
        unitSystem: s.unitSystem,
        volume: Number(s.partDetails.volume),
        surfaceArea: Number(s.partDetails.surfaceArea),
        centerOfMass: s.partDetails.centerOfMass,
        screenshotB64: s.partDetails.screenshotB64 || null,
        pointsAwarded:
          i > 0 && s.type === "INCORRECT" && s.pointsAwarded !== ""
            ? Number(s.pointsAwarded)
            : null,
        feedback: i > 0 && s.type === "INCORRECT" ? s.feedback || null : null,
      }));

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        dueDate: dueDateISO,
        pointsPossible: Number(pointsPossible),
        gradeVisibility,
        tolerancePercent: Number(tolerancePercent),
        signatures: signaturePayloads,
      };

      if (isEditMode) {
        if (!assignment?.id || !onUpdateAssignment) {
          throw new Error("Missing assignment or update handler.");
        }
        await onUpdateAssignment(assignment.id, payload);
      } else {
        if (!onCreateAssignment) {
          throw new Error("Missing create handler.");
        }
        await onCreateAssignment(payload);
      }

      onClose?.();
    } catch (error) {
      console.error(
        isEditMode
          ? "Failed to update assignment"
          : "Failed to create assignment",
        error
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = isEditMode ? "Edit Assignment" : "Create a new Assignment";
  const primaryButtonLabel = submitting
    ? isEditMode
      ? "Saving..."
      : "Creating..."
    : isEditMode
    ? "Save changes"
    : "Create assignment";

  const handleDeleteAssignment = async () => {
    if (!isEditMode || !assignment?.id || !onDeleteAssignment) return;
    const confirmed = window.confirm(
      "Delete this assignment? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      setDeleting(true);
      await onDeleteAssignment(assignment.id);
    } catch (error) {
      console.error("Failed to delete assignment", error);
    } finally {
      setDeleting(false);
    }
  };

  const headerActions =
    isEditMode && onDeleteAssignment ? (
      <Button
        onClick={handleDeleteAssignment}
        variant="danger"
        disabled={submitting || deleting}
      >
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    ) : null;

  return (
    <Modal
      title={modalTitle}
      open={open}
      onClose={onClose}
      headerActions={headerActions}
      footer={
        <Row gap={2}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitAssignment}
            variant="primary"
            disabled={submitting}
          >
            {primaryButtonLabel}
          </Button>
        </Row>
      }
    >
      {graderOffline && (
        <div style={{ ...offlineBannerStyle, marginBottom: 16 }}>
          The SolidWorks grader is currently offline. You can still create or
          edit assignments, but signature uploads are disabled until it comes
          back online.
        </div>
      )}
      <Section title="Assignment Details">
        <Input
          label="Name"
          placeholder="e.g., HW 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          invalid={showInvalidTop("name")}
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
          invalid={showInvalidTop("dueDate")}
        />
      </Section>

      {signatures.map((sig, idx) => (
        <SignatureSection
          key={idx}
          index={idx}
          isFirst={idx === 0}
          signature={sig}
          courseId={courseId}
          validationAttempted={validationAttempted}
          signatureErrors={signaturesErrors[idx]}
          onChange={(partial) => updateSignature(idx, partial)}
          onDelete={() => deleteSignature(idx)}
          canDelete={canDeleteSignature(idx)}
          graderOnline={graderOnline}
        />
      ))}

      <Section
        title="More Signatures"
        subtitle={
          <>
            <p>You can add more signatures to provide more accurate grading:</p>
            <p>
              - Accept multiple correct variations to handle ambiguity in your
              assignments.
            </p>
            <p>
              - Explicitly define incorrect variations and provide immediate,
              specific feedback.
            </p>
            {validationAttempted && showInvalidTop("atLeastOneCorrect") && (
              <p style={{ color: "#b00020", marginTop: 8 }}>
                At least one signature must be marked as Correct.
              </p>
            )}
            {validationAttempted && showInvalidTop("signatures") && (
              <p style={{ color: "#b00020", marginTop: 8 }}>
                Please fix the highlighted signature fields.
              </p>
            )}
          </>
        }
      >
        <Button onClick={addSignature}>Add Signature</Button>
      </Section>

      <Section title="Grading" last={true}>
        <Input
          label="Tolerance percent (recommended 0.1%-0.5%)"
          type="number"
          value={tolerancePercent}
          onChange={(e) => setTolerancePercent(e.target.value)}
          min={0}
          step="0.01"
          invalid={showInvalidTop("tolerancePercent")}
        />
        <Input
          label="Points possible"
          placeholder="e.g., 100"
          type="number"
          value={pointsPossible}
          onChange={(e) => setPointsPossible(e.target.value)}
          min={1}
          step={1}
          invalid={showInvalidTop("pointsPossible")}
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
