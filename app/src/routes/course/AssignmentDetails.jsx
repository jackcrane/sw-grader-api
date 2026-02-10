import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { Button } from "../../components/button/Button";
import { SubmissionPreviewModal } from "../../components/submissionPreview/SubmissionPreviewModal";
import { Spinner } from "../../components/spinner/Spinner";
import { useAssignmentDetails } from "../../hooks/useAssignmentDetails";
import { useAssignments } from "../../hooks/useAssignments";
import { useGraderStatus } from "../../hooks/useGraderStatus";
import { fetchJson } from "../../utils/fetchJson";
import {
  getSubmissionGradeLabel,
  getLatePenaltyLabel,
  parseGradeValue,
} from "../../utils/gradeUtils";
import {
  computeLateStatus,
  describeLatePolicy,
  resolveAssignmentLatePolicy,
} from "../../utils/latePolicy";
import { findSubmissionIndexById, sortSubmissionsByTimestamp } from "../../utils/submissionUtils";
import styles from "./AssignmentDetails.module.css";

const formatDateTime = (value) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
};

const formatName = (user) => {
  if (!user) return "Unknown";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed student";
};

const formatAttemptCount = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return "0 attempts";
  }
  return count === 1 ? "1 attempt" : `${count} attempts`;
};

const parseQueueNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const upsertSubmissionInList = (list, updated) => {
  if (!updated?.id) return Array.isArray(list) ? [...list] : [];
  const sourceList = Array.isArray(list) ? list : [];
  const index = sourceList.findIndex((item) => item?.id === updated.id);
  if (index >= 0) {
    const nextList = [...sourceList];
    nextList[index] = { ...nextList[index], ...updated };
    return nextList;
  }
  return [...sourceList, updated];
};

export const AssignmentDetails = () => {
  const { courseId, enrollmentType, course } = useOutletContext();
  const { assignmentId } = useParams();
  const {
    assignment,
    stats,
    userSubmission,
    userSubmissions,
    loading,
    error,
    refetch,
    teacherSubmissions,
  } = useAssignmentDetails(courseId, assignmentId);
  const { refetch: refetchAssignments } = useAssignments(courseId);
  const { online: graderOnline } = useGraderStatus();

  const isStudent = enrollmentType === "STUDENT";
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalState, setPreviewModalState] = useState({
    status: "idle",
    screenshotUrl: null,
    gradeValue: null,
    gradeLabel: null,
    feedback: null,
    staffComment: null,
    error: null,
    downloadUrl: null,
    downloadFilename: null,
    unpenalizedGrade: null,
    latePenaltyLabel: null,
    submissionId: null,
  });
  const [manualGradeDraft, setManualGradeDraft] = useState("");
  const [manualGradeError, setManualGradeError] = useState(null);
  const [manualGradeSaving, setManualGradeSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const [queueStatus, setQueueStatus] = useState(null);
  const [trackingSubmissionId, setTrackingSubmissionId] = useState(null);
  const [autoTrackEnabled, setAutoTrackEnabled] = useState(true);
  const [previewSubmissions, setPreviewSubmissions] = useState([]);
  const [previewSubmissionIndex, setPreviewSubmissionIndex] = useState(0);
  const eventSourceRef = useRef(null);
  const resetManualGradeControls = useCallback(() => {
    setManualGradeDraft("");
    setManualGradeError(null);
    setManualGradeSaving(false);
  }, []);
  const resetCommentControls = useCallback(() => {
    setCommentDraft("");
    setCommentError(null);
    setCommentSaving(false);
  }, []);
  const patchSubmission = useCallback(
    (updatedSubmission) => {
      if (!updatedSubmission?.id) return;
      refetch(
        (currentData) => {
          if (!currentData) return currentData;
          const nextUserSubmissions = upsertSubmissionInList(
            currentData.userSubmissions,
            updatedSubmission
          );
          let nextUserSubmission = currentData.userSubmission;
          if (
            !nextUserSubmission ||
            !nextUserSubmission.userId ||
            nextUserSubmission.userId === updatedSubmission.userId
          ) {
            nextUserSubmission = {
              ...nextUserSubmission,
              ...updatedSubmission,
            };
          }
          return {
            ...currentData,
            userSubmission: nextUserSubmission,
            userSubmissions: nextUserSubmissions,
          };
        },
        { revalidate: false }
      );
    },
    [refetch]
  );

  const submissions =
    (userSubmissions && userSubmissions.length > 0 && userSubmissions) ||
    (userSubmission ? [userSubmission] : []);
  const chronologicalSubmissions = sortSubmissionsByTimestamp(submissions);
  const sortedSubmissions = [...chronologicalSubmissions].reverse();
  const hasSubmission = sortedSubmissions.length > 0;
  const latestSubmission = hasSubmission ? sortedSubmissions[0] : null;
  const pendingSubmission = useMemo(() => {
    if (!hasSubmission) return null;
    return (
      sortedSubmissions.find((submission) => submission?.grade == null) ?? null
    );
  }, [hasSubmission, sortedSubmissions]);
  const submissionTimestamp =
    latestSubmission?.updatedAt ?? latestSubmission?.createdAt;

  const dueDateLabel = formatDateTime(assignment?.dueDate);
  const graderOffline = graderOnline === false;
  const resolvedLatePolicy = useMemo(
    () => resolveAssignmentLatePolicy(assignment, course),
    [assignment, course]
  );
  const latePolicySummary = useMemo(
    () => describeLatePolicy(resolvedLatePolicy),
    [resolvedLatePolicy]
  );
  const lateStatus = useMemo(
    () =>
      computeLateStatus({
        dueDate: assignment?.dueDate ?? null,
        policy: resolvedLatePolicy,
      }),
    [assignment?.dueDate, resolvedLatePolicy]
  );

  const formatSubmissionGrade = useCallback(
    (submission) => {
      const gradeValue = parseGradeValue(submission?.grade);
      return getSubmissionGradeLabel({
        gradeValue,
        hasSubmission: Boolean(submission),
        pointsPossible: assignment?.pointsPossible,
        dueDate: assignment?.dueDate,
      });
    },
    [assignment]
  );
  const computeLatePenaltyLabel = useCallback(
    (submission) =>
      getLatePenaltyLabel({
        grade: submission?.grade,
        unpenalizedGrade: submission?.unpenalizedGrade,
        pointsPossible: assignment?.pointsPossible,
      }),
    [assignment?.pointsPossible]
  );

  const stopQueueTracking = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setTrackingSubmissionId(null);
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setSuccessMessage(null);
  };

  const resetSubmissionNavigation = () => {
    setPreviewSubmissions([]);
    setPreviewSubmissionIndex(0);
  };

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewModalState({
      status: "idle",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      feedback: null,
      staffComment: null,
      error: null,
      downloadUrl: null,
      downloadFilename: null,
      unpenalizedGrade: null,
      latePenaltyLabel: null,
      submissionId: null,
    });
    resetManualGradeControls();
    resetCommentControls();
    resetSubmissionNavigation();
  };

  const showLoadingPreview = () => {
    resetManualGradeControls();
    resetCommentControls();
    setPreviewModalOpen(true);
    resetSubmissionNavigation();
    setPreviewModalState({
      status: "loading",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      feedback: null,
      staffComment: null,
      downloadUrl: null,
      downloadFilename: null,
      error: null,
      unpenalizedGrade: null,
      latePenaltyLabel: null,
      submissionId: null,
    });
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setUploadError("Choose a .sldprt file to upload.");
      return;
    }

    if (lateStatus.locked) {
      setUploadError("Late submissions are not accepted for this assignment.");
      return;
    }

    setUploading(true);
    setAutoTrackEnabled(false);
    stopQueueTracking();
    setQueueStatus(null);
    setTrackingSubmissionId(null);
    setPreviewModalOpen(true);
    resetManualGradeControls();
    resetCommentControls();
    setPreviewModalState({
      status: "loading",
      screenshotUrl: null,
      gradeValue: null,
      gradeLabel: null,
      feedback: null,
      staffComment: null,
      downloadUrl: null,
      downloadFilename: null,
      error: null,
      unpenalizedGrade: null,
      latePenaltyLabel: null,
      submissionId: null,
    });
    setUploadError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await fetch(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          method: "POST",
          body: formData,
        }
      );

      const responseText = await response.text();
      let payload = null;
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          // ignore invalid JSON; fallback messages handled below
        }
      }

      if (!response.ok) {
        let message = "Failed to upload submission.";
        if (payload?.error) {
          message = payload.error;
        } else if (responseText?.trim()) {
          message = responseText.trim();
        }
        throw new Error(message);
      }

      const submissionPayload = payload?.submission ?? null;
      const queuePayload = payload?.queue ?? null;
      const hintFeedback =
        submissionPayload?.feedback ?? payload?.analysis?.feedback ?? null;
      const autoGradingPending =
        payload?.autoGradingPending ??
        submissionPayload?.autoGradingPending ??
        submissionPayload?.grade == null;

      setSelectedFile(null);
      setSuccessMessage(
        payload?.message ||
          (autoGradingPending
            ? "Submission queued for grading."
            : "Submission uploaded successfully.")
      );
      if (submissionPayload) {
        patchSubmission(submissionPayload);
      }
      const successGradeValue = submissionPayload?.grade ?? null;
      if (!autoGradingPending) {
        const penaltyLabel = computeLatePenaltyLabel(submissionPayload);
        setPreviewModalState({
          status: "success",
          screenshotUrl: submissionPayload?.screenshotUrl ?? null,
          gradeValue: successGradeValue,
          gradeLabel: formatSubmissionGrade({
            grade: successGradeValue,
          }),
          feedback: hintFeedback,
          staffComment: submissionPayload?.staffComment ?? null,
          downloadUrl: submissionPayload?.fileUrl ?? null,
          downloadFilename: submissionPayload?.fileName ?? null,
          error: null,
          unpenalizedGrade: submissionPayload?.unpenalizedGrade ?? null,
          latePenaltyLabel: penaltyLabel,
          submissionId: submissionPayload?.id ?? null,
        });
        setManualGradeDraft(
          submissionPayload?.grade != null
            ? String(submissionPayload.grade)
            : ""
        );
      } else {
        setQueueStatus(() => {
          if (!queuePayload) return null;
          const queueAheadCount =
            queuePayload.queueAheadCount ?? queuePayload.aheadCount ?? 0;
          return {
            state: queueAheadCount > 0 ? "queued" : "processing",
            queueAheadCount,
            queuePosition:
              queuePayload.queuePosition ?? queuePayload.position ?? null,
            queueSize: queuePayload.queueSize ?? null,
          };
        });
        if (submissionPayload?.id) {
          setTrackingSubmissionId(submissionPayload.id);
        }
      }
      await refetch();
      await refetchAssignments();
    } catch (err) {
      setUploadError(err?.message || "Failed to upload submission.");
      setQueueStatus(null);
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: null,
        feedback: null,
        staffComment: null,
        downloadUrl: null,
        downloadFilename: null,
        error: err?.message || "Failed to upload submission.",
        unpenalizedGrade: null,
        latePenaltyLabel: null,
        submissionId: null,
      });
      resetManualGradeControls();
      resetCommentControls();
    } finally {
      setUploading(false);
      setAutoTrackEnabled(true);
    }
  };

  useEffect(() => {
    if (!autoTrackEnabled) return;
    const pendingId = pendingSubmission?.id ?? null;
    if (pendingId) {
      setTrackingSubmissionId((currentId) =>
        currentId === pendingId ? currentId : pendingId
      );
      return;
    }

    if (queueStatus) {
      setQueueStatus(null);
    }

    if (trackingSubmissionId) {
      stopQueueTracking();
    }
  }, [
    autoTrackEnabled,
    pendingSubmission,
    queueStatus,
    stopQueueTracking,
    trackingSubmissionId,
  ]);

  useEffect(() => {
    if (!trackingSubmissionId || !courseId || !assignmentId) return undefined;
    const statusUrl = `/api/courses/${courseId}/assignments/${assignmentId}/submissions/${trackingSubmissionId}/status`;
    const source = new EventSource(statusUrl);
    eventSourceRef.current = source;

    const handleStatus = (event) => {
      if (!event?.data) return;
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!payload) return;

      if (payload.state === "graded" && payload.submission) {
        const gradedSubmission = payload.submission;
        const gradeValue = parseGradeValue(gradedSubmission?.grade);
        const penaltyLabel = computeLatePenaltyLabel(gradedSubmission);
        setPreviewModalState({
          status: "success",
          screenshotUrl: gradedSubmission?.screenshotUrl ?? null,
          gradeValue,
          gradeLabel: formatSubmissionGrade(gradedSubmission),
          feedback: gradedSubmission?.feedback ?? null,
          staffComment: gradedSubmission?.staffComment ?? null,
          downloadUrl: gradedSubmission?.fileUrl ?? null,
          downloadFilename:
            gradedSubmission?.fileName ??
            gradedSubmission?.fileKey?.split?.("/")?.pop?.() ??
            null,
          error: null,
          unpenalizedGrade: gradedSubmission?.unpenalizedGrade ?? null,
          latePenaltyLabel: penaltyLabel,
          submissionId: gradedSubmission?.id ?? null,
        });
        setManualGradeDraft(
          gradedSubmission?.grade != null ? String(gradedSubmission.grade) : ""
        );
        setQueueStatus(null);
        setSuccessMessage("Submission graded.");
        patchSubmission(gradedSubmission);
        stopQueueTracking();
        refetch();
        return;
      }

      if (payload.state === "error" || payload.state === "missing") {
        setPreviewModalState({
          status: "error",
          screenshotUrl: null,
          gradeValue: null,
          gradeLabel: null,
          feedback: null,
          staffComment: null,
          downloadUrl: null,
          downloadFilename: null,
          error:
            payload.error ||
            "Unable to monitor the grading request. Check your submissions list.",
          unpenalizedGrade: null,
          latePenaltyLabel: null,
          submissionId: null,
        });
        resetManualGradeControls();
        resetCommentControls();
        setQueueStatus(payload);
        setAutoTrackEnabled(false);
        stopQueueTracking();
        return;
      }

      if (payload.state === "timeout") {
        setPreviewModalState({
          status: "error",
          screenshotUrl: null,
          gradeValue: null,
          gradeLabel: null,
          feedback: null,
          staffComment: null,
          downloadUrl: null,
          downloadFilename: null,
          error:
            payload.error ||
            "Grading is taking longer than expected. We'll keep working on it.",
          unpenalizedGrade: null,
          latePenaltyLabel: null,
          submissionId: null,
        });
        resetManualGradeControls();
        resetCommentControls();
        setQueueStatus(payload);
        stopQueueTracking();
        return;
      }

      setQueueStatus(payload);
    };

    source.addEventListener("status", handleStatus);
    source.onerror = () => {
      setQueueStatus((prev) =>
        prev
          ? { ...prev, error: "Connection lost. Attempting to reconnect…" }
          : {
              state: "queued",
              error: "Connection lost. Attempting to reconnect…",
            }
      );
    };

    return () => {
      source.removeEventListener("status", handleStatus);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [
    trackingSubmissionId,
    courseId,
    assignmentId,
    formatSubmissionGrade,
    refetch,
    patchSubmission,
    stopQueueTracking,
  ]);

  useEffect(() => {
    return () => {
      stopQueueTracking();
    };
  }, [stopQueueTracking]);

  const displaySubmissionPreview = (submission) => {
    if (!submission) return;
    resetManualGradeControls();
    resetCommentControls();
    const pending = submission?.grade == null;

    setPreviewModalOpen(true);
    if (pending) {
      setPreviewModalState({
        status: "loading",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: null,
        feedback: null,
        staffComment: null,
        downloadUrl: null,
        downloadFilename: null,
        error: null,
        unpenalizedGrade: null,
        latePenaltyLabel: null,
        submissionId: submission?.id ?? null,
      });
      if (submission?.id) {
        setAutoTrackEnabled(true);
        setTrackingSubmissionId(submission.id);
      }
      return;
    }

    const previewGradeValue = parseGradeValue(submission?.grade);
    const penaltyLabel = computeLatePenaltyLabel(submission);
    setPreviewModalState({
      status: "success",
      screenshotUrl: submission?.screenshotUrl ?? null,
      gradeValue: previewGradeValue,
      gradeLabel: formatSubmissionGrade({
        grade: previewGradeValue,
      }),
      feedback: submission?.feedback ?? null,
      staffComment: submission?.staffComment ?? null,
      downloadUrl: submission?.fileUrl ?? null,
      downloadFilename:
        submission?.fileName ||
        submission?.fileKey?.split?.("/")?.pop?.() ||
        null,
      error: null,
      unpenalizedGrade: submission?.unpenalizedGrade ?? null,
      latePenaltyLabel: penaltyLabel,
      submissionId: submission?.id ?? null,
    });
    setManualGradeDraft(
      submission?.grade != null ? String(submission.grade) : ""
    );
    setCommentDraft(submission?.staffComment ?? "");
  };

  const showSubmissionInModal = (
    submission,
    submissionList = chronologicalSubmissions
  ) => {
    if (!submission) return;
    const list =
      Array.isArray(submissionList) && submissionList.length > 0
        ? submissionList
        : submission
        ? [submission]
        : [];
    if (list.length > 0) {
      const normalizedList = [...list];
      const foundIndex = findSubmissionIndexById(normalizedList, submission?.id);
      const normalizedIndex = foundIndex >= 0 ? foundIndex : 0;
      setPreviewSubmissions(normalizedList);
      setPreviewSubmissionIndex(normalizedIndex);
    } else {
      resetSubmissionNavigation();
    }
    displaySubmissionPreview(submission);
  };

  const handleTeacherSubmissionPreview = async (submission) => {
    if (!submission?.userId) return;
    showLoadingPreview();
    try {
      const params = new URLSearchParams();
      params.set("userId", submission.userId);
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions?${params}`
      );
      const studentSubmissions = payload?.submissions ?? [];
      if (!studentSubmissions.length) {
        throw new Error("No submission recorded for this assignment.");
      }
      const sorted = sortSubmissionsByTimestamp(studentSubmissions);
      showSubmissionInModal(submission, sorted);
    } catch (err) {
      resetSubmissionNavigation();
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: null,
        feedback: null,
        staffComment: null,
        downloadUrl: null,
        downloadFilename: null,
        error: err?.message || "Unable to load submission.",
        unpenalizedGrade: null,
        latePenaltyLabel: null,
        submissionId: null,
      });
      resetManualGradeControls();
      resetCommentControls();
    }
  };

  const handleManualGradeSubmit = useCallback(async () => {
    const submissionId = previewModalState.submissionId;
    if (!submissionId || manualGradeSaving) return;
    const trimmedGrade = manualGradeDraft?.toString?.().trim();
    if (!trimmedGrade) {
      setManualGradeError("Enter a grade value to override.");
      return;
    }
    const parsed = Number(trimmedGrade);
    if (!Number.isFinite(parsed)) {
      setManualGradeError("Grade must be a valid number.");
      return;
    }
    if (parsed < 0) {
      setManualGradeError("Grade cannot be negative.");
      return;
    }

    setManualGradeSaving(true);
    setManualGradeError(null);
    try {
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/grade`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ grade: parsed }),
        }
      );
      const updatedSubmission = payload?.submission ?? null;
      if (!updatedSubmission) {
        throw new Error("Updated submission data missing.");
      }

      patchSubmission(updatedSubmission);
      setPreviewSubmissions((current) =>
        current.map((item) =>
          item?.id === updatedSubmission?.id
            ? { ...item, ...updatedSubmission }
            : item
        )
      );
      const newGradeValue = parseGradeValue(updatedSubmission?.grade);
      const penaltyLabel = computeLatePenaltyLabel(updatedSubmission);
      setPreviewModalState((prev) => ({
        ...prev,
        gradeValue: newGradeValue,
        gradeLabel: formatSubmissionGrade(updatedSubmission),
        feedback: updatedSubmission?.feedback ?? prev.feedback,
        staffComment: updatedSubmission?.staffComment ?? prev.staffComment,
        screenshotUrl: updatedSubmission?.screenshotUrl ?? prev.screenshotUrl,
        downloadUrl: updatedSubmission?.fileUrl ?? prev.downloadUrl,
        downloadFilename:
          updatedSubmission?.fileName ?? prev.downloadFilename,
        unpenalizedGrade:
          updatedSubmission?.unpenalizedGrade ?? prev.unpenalizedGrade,
        latePenaltyLabel: penaltyLabel,
        submissionId: updatedSubmission?.id ?? prev.submissionId,
      }));
      setManualGradeDraft(
        updatedSubmission?.grade != null ? String(updatedSubmission.grade) : ""
      );
      await refetch();
      await refetchAssignments();
    } catch (err) {
      setManualGradeError(
        err?.message || "Failed to save manual grade override."
      );
    } finally {
      setManualGradeSaving(false);
    }
  }, [
    assignmentId,
    courseId,
    formatSubmissionGrade,
    manualGradeDraft,
    manualGradeSaving,
    patchSubmission,
    previewModalState.submissionId,
    refetch,
    refetchAssignments,
  ]);

  const handleManualGradeChange = useCallback(
    (value) => {
      setManualGradeDraft(value ?? "");
      if (manualGradeError) {
        setManualGradeError(null);
      }
    },
    [manualGradeError]
  );

  const handleCommentChange = useCallback(
    (value) => {
      setCommentDraft(value ?? "");
      if (commentError) {
        setCommentError(null);
      }
    },
    [commentError]
  );

  const handleCommentSubmit = useCallback(async () => {
    const submissionId = previewModalState.submissionId;
    if (!submissionId || commentSaving) return;
    const trimmedComment = commentDraft?.toString?.().trim();
    if (!trimmedComment) {
      setCommentError("Enter a comment to share.");
      return;
    }

    setCommentSaving(true);
    setCommentError(null);
    try {
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${assignmentId}/submissions/${submissionId}/comment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ comment: trimmedComment }),
        }
      );
      const updatedSubmission = payload?.submission ?? null;
      if (!updatedSubmission) {
        throw new Error("Updated submission data missing.");
      }

      patchSubmission(updatedSubmission);
      setPreviewSubmissions((current) =>
        current.map((item) =>
          item?.id === updatedSubmission?.id
            ? { ...item, ...updatedSubmission }
            : item
        )
      );
      setPreviewModalState((prev) => ({
        ...prev,
        staffComment: updatedSubmission?.staffComment ?? prev.staffComment,
        screenshotUrl: updatedSubmission?.screenshotUrl ?? prev.screenshotUrl,
        downloadUrl: updatedSubmission?.fileUrl ?? prev.downloadUrl,
        downloadFilename:
          updatedSubmission?.fileName ?? prev.downloadFilename,
      }));
      setCommentDraft(updatedSubmission?.staffComment ?? trimmedComment);
      await refetch();
      await refetchAssignments();
    } catch (err) {
      setCommentError(err?.message || "Failed to save comment.");
    } finally {
      setCommentSaving(false);
    }
  }, [
    assignmentId,
    courseId,
    commentDraft,
    commentSaving,
    patchSubmission,
    previewModalState.submissionId,
    refetch,
    refetchAssignments,
  ]);

  const goToPreviousPreviewSubmission = () => {
    if (!previewSubmissions.length) return;
    const nextIndex = Math.max(0, previewSubmissionIndex - 1);
    if (nextIndex === previewSubmissionIndex) return;
    const submission = previewSubmissions[nextIndex];
    if (!submission) return;
    setPreviewSubmissionIndex(nextIndex);
    displaySubmissionPreview(submission);
  };

  const goToNextPreviewSubmission = () => {
    if (!previewSubmissions.length) return;
    const nextIndex = Math.min(
      previewSubmissions.length - 1,
      previewSubmissionIndex + 1
    );
    if (nextIndex === previewSubmissionIndex) return;
    const submission = previewSubmissions[nextIndex];
    if (!submission) return;
    setPreviewSubmissionIndex(nextIndex);
    displaySubmissionPreview(submission);
  };

  const statsCards = useMemo(() => {
    if (!stats) return null;
    return [
      {
        label: "Turned in",
        value: formatPercent(stats.submittedPercent),
        subtext: `${stats.submittedCount}/${stats.totalStudents} students`,
      },
      {
        label: "Correct",
        value: formatPercent(stats.correctPercent),
        subtext: `${stats.correctCount}/${stats.totalStudents} students`,
      },
    ];
  }, [stats]);

  const showInlineQueueStatus = isStudent && Boolean(pendingSubmission);
  const queueAheadCount = parseQueueNumber(
    queueStatus?.queueAheadCount ?? queueStatus?.aheadCount
  );
  const queuePosition = parseQueueNumber(
    queueStatus?.queuePosition ?? queueStatus?.position
  );
  const queueSize = parseQueueNumber(
    queueStatus?.queueSize ?? queueStatus?.queueDepth
  );
  const queueState =
    queueStatus?.state ?? (pendingSubmission ? "processing" : null);
  const queueErrored =
    queueState === "error" ||
    queueState === "timeout" ||
    queueState === "missing";
  const inlineQueueTitle = (() => {
    if (queueState === "queued") return "Submission queued for grading";
    if (queueState === "processing") return "Grading your latest attempt…";
    if (queueErrored) return "We lost track of this grading job.";
    if (pendingSubmission) return "Preparing your submission for grading…";
    return null;
  })();
  const inlineQueueHelper = (() => {
    if (queueErrored) {
      if (queueStatus?.error) return queueStatus.error;
      if (queueState === "timeout") {
        return "Grading is taking longer than expected. We'll keep trying in the background.";
      }
      return "Unable to retrieve grading status right now. Check back soon.";
    }
    if (queueState === "queued" && queueAheadCount != null) {
      if (queueAheadCount > 0) {
        return `${queueAheadCount} ${
          queueAheadCount === 1 ? "submission" : "submissions"
        } ahead of you`;
      }
      return "You're up next!";
    }
    if (queueState === "processing") {
      return "SolidWorks is crunching the numbers now.";
    }
    if (pendingSubmission) {
      return "Hang tight while we analyze your file.";
    }
    return null;
  })();
  const inlineQueueMeta =
    !queueErrored &&
    queueSize != null &&
    (queueState === "queued" || queueState === "processing")
      ? `Position ${
          queuePosition ?? (queueAheadCount != null ? queueAheadCount + 1 : 1)
        } of ${queueSize}`
      : null;

  const teacherStudentCount = teacherSubmissions.length;
  const teacherTotalAttempts = teacherSubmissions.reduce(
    (sum, submission) => sum + (Number(submission?.attemptCount) || 0),
    0
  );

  const manualGradeEnabled =
    !isStudent && previewModalState.status === "success";
  const commentEnabled = manualGradeEnabled;

  if (loading) {
    return <p>Loading assignment...</p>;
  }

  if (error) {
    return (
      <p style={{ color: "#b00020" }}>
        Failed to load assignment: {error.message}
      </p>
    );
  }

  if (!assignment) {
    return <p style={{ color: "#666" }}>Assignment not found.</p>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.title}>
        <h2 style={{ margin: 0 }}>{assignment.name}</h2>
      </div>
      {dueDateLabel && (
        <p className={styles.meta}>
          Due {dueDateLabel} • {assignment.pointsPossible} pts
        </p>
      )}
      {assignment.description && (
        <>
          <p className={styles.description}>{assignment.description}</p>
          {isStudent && <div className={styles.sectionDivider} />}
        </>
      )}

      {statsCards && !isStudent && (
        <div className={styles.statsGrid}>
          {statsCards.map((card) => (
            <div
              key={card.label}
              className={styles.statCard}
              data-cy={`stat-${card.label}`}
            >
              <div className={styles.statLabel}>{card.label}</div>
              <div className={styles.statValue}>{card.value}</div>
              <div className={styles.statSubtext}>{card.subtext}</div>
            </div>
          ))}
        </div>
      )}

      {isStudent && (
        <div className={styles.uploadBox}>
          <strong>Upload your part</strong>
          <p className={styles.uploadHelper}>
            Submit a .sldprt file to get graded automatically.
          </p>
          <p className={styles.latePolicyNote}>{latePolicySummary}</p>
          {graderOffline && (
            <p className={styles.statusWarning}>
              Auto-grading is temporarily offline. You can still submit, and
              we&rsquo;ll grade it automatically once the worker comes back
              online.
            </p>
          )}
          {lateStatus.isLate && !lateStatus.locked && (
            <p className={styles.statusWarning}>
              This assignment is past due. A late penalty will be applied.
            </p>
          )}
          {lateStatus.locked && (
            <p className={styles.statusError}>
              Submissions are closed. Late work is not accepted for this
              assignment.
            </p>
          )}
          <input
            type="file"
            accept=".sldprt"
            onChange={handleFileChange}
            className={styles.fileInput}
            data-cy="part-file"
          />
          <Button
            onClick={handleSubmit}
            disabled={uploading || lateStatus.locked}
          >
            {lateStatus.locked
              ? "Submissions closed"
              : uploading
                ? "Uploading..."
                : "Upload submission"}
          </Button>
          {uploadError && (
            <p className={`${styles.status} ${styles.statusError}`}>
              {uploadError}
            </p>
          )}
          {successMessage && (
            <p className={`${styles.status} ${styles.statusSuccess}`}>
              {successMessage}
            </p>
          )}
        </div>
      )}

      {showInlineQueueStatus && inlineQueueTitle && (
        <div className={styles.gradingStatus}>
          <div className={styles.gradingSpinner}>
            <Spinner />
          </div>
          <div className={styles.gradingDetails}>
            <p
              className={
                queueErrored ? styles.gradingTitleError : styles.gradingTitle
              }
            >
              {inlineQueueTitle}
            </p>
            {inlineQueueHelper && (
              <p
                className={
                  queueErrored ? styles.gradingError : styles.gradingHelper
                }
              >
                {inlineQueueHelper}
              </p>
            )}
            {inlineQueueMeta && (
              <p className={styles.gradingMeta}>{inlineQueueMeta}</p>
            )}
          </div>
        </div>
      )}

      {isStudent && hasSubmission && (
        <div className={styles.submissionHistory}>
          <div className={styles.historyDivider} />
          <div className={styles.submissionList}>
            {sortedSubmissions.map((submission, index) => {
              const attemptNumber = sortedSubmissions.length - index;
              const timestamp =
                submission?.updatedAt ?? submission?.createdAt ?? null;
              const penaltyLabel = computeLatePenaltyLabel(submission);
              const fileUrl = submission?.fileUrl;
              const fileName =
                submission?.fileName ||
                submission?.fileKey?.split?.("/")?.pop?.() ||
                `submission-${attemptNumber}.sldprt`;
              return (
                <React.Fragment key={submission?.id ?? index}>
                  <div className={styles.submissionEntry}>
                    <div className={styles.submissionRow}>
                      <div className={styles.submissionInfoBlock}>
                        <div className={styles.submissionAttempt}>
                          Attempt {attemptNumber}
                        </div>
                        <div className={styles.submissionDetails}>
                          <span>{formatDateTime(timestamp)}</span>
                          <span>
                            Grade: {formatSubmissionGrade(submission)}
                          </span>
                          {penaltyLabel && (
                            <span className={styles.penaltyNote}>
                              {penaltyLabel}
                            </span>
                          )}
                        </div>
                      </div>
                          {fileUrl && (
                            <Button
                              onClick={() =>
                                showSubmissionInModal(submission, chronologicalSubmissions)
                              }
                            >
                              View
                            </Button>
                          )}
                    </div>
                  </div>
                  {index < sortedSubmissions.length - 1 && (
                    <div className={styles.rowDivider} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className={styles.historyDivider} />
        </div>
      )}

      {!isStudent && !statsCards && (
        <p style={{ color: "#666" }}>
          Stats will appear once students begin submitting.
        </p>
      )}

      {!isStudent && teacherSubmissions?.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.teacherSubmissionsHeader}>
            <div className={styles.sectionTitle}>Student submissions</div>
            <p className={styles.sectionMeta}>
              Latest submission from {teacherStudentCount} student
              {teacherStudentCount === 1 ? "" : "s"} · {teacherTotalAttempts}{" "}
              attempt
              {teacherTotalAttempts === 1 ? "" : "s"}
            </p>
          </div>
          <div className={styles.teacherSubmissionList}>
            {teacherSubmissions.map((submission, index) => {
              const penaltyLabel = computeLatePenaltyLabel(submission);
              return (
                <React.Fragment
                  key={submission?.id ?? `${submission?.userId}-${index}`}
                >
                  <div
                    className={styles.teacherSubmissionEntry}
                    data-cy={`submission-${formatName(submission.user)}`}
                  >
                    <div className={styles.teacherSubmissionInfo}>
                      <div className={styles.teacherSubmissionName}>
                        {formatName(submission.user)}
                      </div>
                      <div className={styles.teacherSubmissionDetails}>
                        <span>{formatDateTime(submission.updatedAt)}</span>
                        <span>Grade: {formatSubmissionGrade(submission)}</span>
                        <span>
                          {formatAttemptCount(submission.attemptCount)}
                        </span>
                        {penaltyLabel && (
                          <span className={styles.penaltyNote}>
                            {penaltyLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button onClick={() => handleTeacherSubmissionPreview(submission)}>
                      View
                    </Button>
                  </div>
                  {index < teacherSubmissions.length - 1 && (
                    <div className={styles.rowDivider} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}

      {!isStudent && hasSubmission && (
        <div className={styles.submissionInfo}>
          Last submission recorded {formatDateTime(submissionTimestamp)}.
        </div>
      )}
      <SubmissionPreviewModal
        open={previewModalOpen}
        status={previewModalState.status}
        screenshotUrl={previewModalState.screenshotUrl}
        gradeValue={previewModalState.gradeValue}
        gradeLabel={previewModalState.gradeLabel}
        feedback={previewModalState.feedback}
        commentValue={
          commentEnabled
            ? commentDraft
            : previewModalState.staffComment ?? ""
        }
        commentEnabled={commentEnabled}
        commentError={commentError}
        commentSaving={commentSaving}
        downloadUrl={previewModalState.downloadUrl}
        downloadFilename={previewModalState.downloadFilename}
        error={previewModalState.error}
        queueStatus={queueStatus}
        onClose={closePreviewModal}
        latePenaltyLabel={previewModalState.latePenaltyLabel}
        manualGradeEnabled={manualGradeEnabled}
        manualGradeValue={manualGradeDraft}
        manualGradeError={manualGradeError}
        manualGradeSaving={manualGradeSaving}
        onManualGradeChange={handleManualGradeChange}
        onManualGradeSubmit={handleManualGradeSubmit}
        onCommentChange={handleCommentChange}
        onCommentSubmit={handleCommentSubmit}
        navigation={
          previewSubmissions.length > 1
            ? {
                totalSubmissions: previewSubmissions.length,
                currentIndex: previewSubmissionIndex,
                onPrevious: goToPreviousPreviewSubmission,
                onNext: goToNextPreviewSubmission,
              }
            : undefined
        }
      />
    </div>
  );
};
