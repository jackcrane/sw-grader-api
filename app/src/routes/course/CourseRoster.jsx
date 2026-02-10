import React, { useCallback, useEffect, useMemo, useState } from "react";
import classNames from "classnames";
import {
  Navigate,
  NavLink,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { H2 } from "../../components/typography/Typography";
import { Spacer } from "../../components/spacer/Spacer";
import { Button } from "../../components/button/Button";
import { SubmissionPreviewModal } from "../../components/submissionPreview/SubmissionPreviewModal";
import { useCourseRoster } from "../../hooks/useCourseRoster";
import { calculateAverageGrade } from "../../utils/calculateAverageGrade";
import { fetchJson } from "../../utils/fetchJson";
import {
  getLatePenaltyLabel,
  getSubmissionGradeLabel,
  parseGradeValue,
} from "../../utils/gradeUtils";
import {
  findSubmissionIndexById,
  sortSubmissionsByTimestamp,
} from "../../utils/submissionUtils";
import styles from "./CourseRoster.module.css";
import { CaretRight } from "@phosphor-icons/react";

const roleLabels = {
  STUDENT: "Student",
  TA: "Teaching assistant",
  TEACHER: "Teacher",
};

const formatName = (user) => {
  if (!user) return "Unknown";
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || user.email || "Unnamed student";
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "–";
  return `${value.toFixed(1)}%`;
};

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const getRoleAction = (type) => {
  if (type === "STUDENT") {
    return { label: "Promote to TA", nextType: "TA" };
  }
  if (type === "TA") {
    return { label: "Demote to student", nextType: "STUDENT" };
  }
  return null;
};

const formatGradeLabel = (gradeValue, pointsPossible) => {
  const numeric = parseGradeValue(gradeValue);
  return getSubmissionGradeLabel({
    gradeValue: numeric,
    hasSubmission: true,
    pointsPossible,
  });
};

const deriveSubmissionFilename = (submission) => {
  if (!submission) return null;
  return (
    submission.fileName || submission.fileKey?.split?.("/")?.pop?.() || null
  );
};

const normalizeId = (value) => (value == null ? null : String(value));

const submissionPreviewInitialState = {
  status: "idle",
  screenshotUrl: null,
  gradeValue: null,
  gradeLabel: null,
  downloadUrl: null,
  downloadFilename: null,
  feedback: null,
  staffComment: null,
  error: null,
  latePenaltyLabel: null,
  submissionId: null,
  assignmentId: null,
};

export const CourseRoster = () => {
  const {
    canViewRoster,
    courseId,
    enrollment,
    viewerEnrollmentType,
    isViewingAsStudent,
  } = useOutletContext();
  const {
    roster,
    assignments,
    loading,
    error,
    updateEnrollmentType,
    removeEnrollment,
    refetch: refetchRoster,
  } = useCourseRoster(courseId, { enabled: canViewRoster });

  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewModalState, setPreviewModalState] = useState(
    submissionPreviewInitialState
  );
  const [previewSubmissions, setPreviewSubmissions] = useState([]);
  const [previewSubmissionIndex, setPreviewSubmissionIndex] = useState(0);
  const [previewSubmissionPointsPossible, setPreviewSubmissionPointsPossible] =
    useState(null);
  const [manualGradeDraft, setManualGradeDraft] = useState("");
  const [manualGradeError, setManualGradeError] = useState(null);
  const [manualGradeSaving, setManualGradeSaving] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentError, setCommentError] = useState(null);
  const [commentSaving, setCommentSaving] = useState(false);

  const visibleRoster = useMemo(
    () => roster.filter((entry) => entry.type !== "TEACHER"),
    [roster]
  );

  const { enrollmentId: routeEnrollmentId } = useParams();

  useEffect(() => {
    if (visibleRoster.length === 0) {
      setSelectedEnrollmentId(null);
      return;
    }

    const normalizedRouteId = normalizeId(routeEnrollmentId);
    if (normalizedRouteId) {
      const matchingEntry = visibleRoster.find(
        (entry) => normalizeId(entry.id) === normalizedRouteId
      );
      if (matchingEntry) {
        if (selectedEnrollmentId !== normalizedRouteId) {
          setSelectedEnrollmentId(normalizedRouteId);
        }
        return;
      }
    }

    const isCurrentValid =
      selectedEnrollmentId &&
      visibleRoster.some(
        (entry) => normalizeId(entry.id) === selectedEnrollmentId
      );

    if (!isCurrentValid) {
      setSelectedEnrollmentId(normalizeId(visibleRoster[0]?.id));
    }
  }, [visibleRoster, selectedEnrollmentId, routeEnrollmentId]);

  const resetSubmissionNavigation = () => {
    setPreviewSubmissions([]);
    setPreviewSubmissionIndex(0);
    setPreviewSubmissionPointsPossible(null);
  };

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

  const closePreviewModal = () => {
    setPreviewModalOpen(false);
    setPreviewModalState(submissionPreviewInitialState);
    resetManualGradeControls();
    resetCommentControls();
    resetSubmissionNavigation();
  };

  const showSubmissionPreview = (
    submission,
    pointsPossible = null,
    assignmentIdArg = null
  ) => {
    if (!submission) return;
    setPreviewModalOpen(true);
    setPreviewModalState((prev) => ({
      ...prev,
      status: "success",
      screenshotUrl: submission?.screenshotUrl ?? null,
      gradeValue: submission?.grade ?? null,
      gradeLabel: formatGradeLabel(submission?.grade, pointsPossible),
      feedback: submission?.feedback ?? null,
      staffComment: submission?.staffComment ?? null,
      downloadUrl: submission?.fileUrl ?? null,
      downloadFilename: deriveSubmissionFilename(submission),
      error: null,
      latePenaltyLabel: getLatePenaltyLabel({
        grade: submission?.grade,
        unpenalizedGrade: submission?.unpenalizedGrade,
        pointsPossible,
      }),
      submissionId: submission?.id ?? null,
      assignmentId: assignmentIdArg ?? prev.assignmentId,
    }));
    setManualGradeDraft(
      submission?.grade != null ? String(submission.grade) : ""
    );
    setCommentDraft(submission?.staffComment ?? "");
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
      downloadUrl: null,
      downloadFilename: null,
      feedback: null,
      staffComment: null,
      error: null,
      latePenaltyLabel: null,
      submissionId: null,
      assignmentId: null,
    });
  };

  const activeEnrollment = visibleRoster.find(
    (entry) => normalizeId(entry.id) === selectedEnrollmentId
  );
  const roleAction = activeEnrollment
    ? getRoleAction(activeEnrollment.type)
    : null;

  const submissions = activeEnrollment?.submissions ?? [];
  const averageGrade = useMemo(
    () => calculateAverageGrade(assignments, submissions),
    [assignments, submissions]
  );
  const gradedCount = submissions.filter(
    (entry) => parseGradeValue(entry?.grade) != null
  ).length;
  const totalAssignments = assignments.length;
  const lastSubmissionDate = submissions.reduce((latest, entry) => {
    if (!entry?.updatedAt) return latest;
    if (!latest) return entry.updatedAt;
    return new Date(entry.updatedAt) > new Date(latest)
      ? entry.updatedAt
      : latest;
  }, null);
  const statsCards = useMemo(
    () => [
      {
        label: "Overall average",
        value: formatPercent(averageGrade),
        subtext:
          totalAssignments > 0
            ? `${gradedCount}/${totalAssignments} graded`
            : "No graded work yet",
      },
      {
        label: "Submission rate",
        value: totalAssignments
          ? formatPercent((gradedCount / totalAssignments) * 100)
          : "–",
        subtext:
          totalAssignments > 0
            ? "Share of assignments with scores"
            : "Assignments pending",
      },
      {
        label: "Last submission",
        value:
          submissions.length > 0 ? formatDateTime(lastSubmissionDate) : "—",
        subtext:
          submissions.length > 0 ? "Latest upload time" : "No submissions yet",
      },
    ],
    [
      averageGrade,
      gradedCount,
      totalAssignments,
      submissions.length,
      lastSubmissionDate,
    ]
  );

  const canManageRoster =
    viewerEnrollmentType === "TEACHER" && !isViewingAsStudent;

  const handleChangeRole = async (nextType) => {
    if (!activeEnrollment || !nextType) return;
    setActionError(null);
    setPendingAction("role");
    try {
      await updateEnrollmentType(activeEnrollment.id, nextType);
    } catch (err) {
      setActionError(err?.message || "Failed to update roster role.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleRemove = async () => {
    if (!activeEnrollment) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Remove ${formatName(activeEnrollment.user)} from the course?`
      )
    ) {
      return;
    }
    setActionError(null);
    setPendingAction("remove");
    try {
      await removeEnrollment(activeEnrollment.id);
    } catch (err) {
      setActionError(err?.message || "Failed to remove user from course.");
    } finally {
      setPendingAction(null);
    }
  };

  const handleViewAssignment = async (assignment, defaultSubmissionId) => {
    if (!activeEnrollment?.user?.id) return;
    showLoadingPreview();
    try {
      const params = new URLSearchParams();
      params.set("userId", activeEnrollment.user.id);
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${assignment.id}/submissions?${params}`
      );
      const submissions = sortSubmissionsByTimestamp(payload?.submissions ?? []);
      if (!submissions.length) {
        throw new Error("No submission recorded for this assignment.");
      }
      const defaultIndex = Math.max(
        0,
        findSubmissionIndexById(submissions, defaultSubmissionId)
      );
      const pointsPossible = assignment.pointsPossible ?? null;
      setPreviewSubmissions(submissions);
      setPreviewSubmissionIndex(defaultIndex);
      setPreviewSubmissionPointsPossible(pointsPossible);
      showSubmissionPreview(
        submissions[defaultIndex],
        pointsPossible,
        assignment.id
      );
    } catch (err) {
      resetSubmissionNavigation();
      setPreviewModalState({
        status: "error",
        screenshotUrl: null,
        gradeValue: null,
        gradeLabel: null,
        downloadUrl: null,
        downloadFilename: null,
        feedback: null,
        staffComment: null,
        error: err?.message || "Unable to load submission.",
        latePenaltyLabel: null,
        submissionId: null,
        assignmentId: null,
      });
      resetManualGradeControls();
      resetCommentControls();
    }
  };

  const previewSubmissionId = previewModalState.submissionId;
  const previewAssignmentId = previewModalState.assignmentId;

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
    if (
      commentSaving ||
      !previewAssignmentId ||
      !previewSubmissionId
    ) {
      return;
    }
    const trimmedComment = commentDraft?.toString?.().trim();
    if (!trimmedComment) {
      setCommentError("Enter a comment to share.");
      return;
    }

    setCommentSaving(true);
    setCommentError(null);
    try {
      const payload = await fetchJson(
        `/api/courses/${courseId}/assignments/${previewAssignmentId}/submissions/${previewSubmissionId}/comment`,
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
      await refetchRoster();
    } catch (err) {
      setCommentError(err?.message || "Failed to save comment.");
    } finally {
      setCommentSaving(false);
    }
  }, [
    commentDraft,
    commentSaving,
    courseId,
    previewAssignmentId,
    previewSubmissionId,
    refetchRoster,
  ]);

  const handleManualGradeSubmit = useCallback(async () => {
    if (
      manualGradeSaving ||
      !previewAssignmentId ||
      !previewSubmissionId
    ) {
      return;
    }
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
        `/api/courses/${courseId}/assignments/${previewAssignmentId}/submissions/${previewSubmissionId}/grade`,
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

      setPreviewSubmissions((current) =>
        current.map((item) =>
          item?.id === updatedSubmission?.id
            ? { ...item, ...updatedSubmission }
            : item
        )
      );

      const updatedGradeValue = parseGradeValue(updatedSubmission?.grade);
      setPreviewModalState((prev) => ({
        ...prev,
        gradeValue: updatedGradeValue,
        gradeLabel: formatGradeLabel(
          updatedSubmission?.grade,
          previewSubmissionPointsPossible
        ),
        feedback: updatedSubmission?.feedback ?? prev.feedback,
        staffComment: updatedSubmission?.staffComment ?? prev.staffComment,
        screenshotUrl: updatedSubmission?.screenshotUrl ?? prev.screenshotUrl,
        downloadUrl: updatedSubmission?.fileUrl ?? prev.downloadUrl,
        downloadFilename:
          updatedSubmission?.fileName ?? prev.downloadFilename,
        latePenaltyLabel: getLatePenaltyLabel({
          grade: updatedSubmission?.grade,
          unpenalizedGrade: updatedSubmission?.unpenalizedGrade,
          pointsPossible: previewSubmissionPointsPossible,
        }),
      }));
      setManualGradeDraft(
        updatedSubmission?.grade != null ? String(updatedSubmission.grade) : ""
      );
      await refetchRoster();
    } catch (err) {
      setManualGradeError(
        err?.message || "Failed to save manual grade override."
      );
    } finally {
      setManualGradeSaving(false);
    }
  }, [
    courseId,
    manualGradeDraft,
    manualGradeSaving,
    previewAssignmentId,
    previewSubmissionId,
    previewSubmissionPointsPossible,
    refetchRoster,
  ]);

  const goToPreviousPreviewSubmission = () => {
    if (!previewSubmissions.length) return;
    const nextIndex = Math.max(0, previewSubmissionIndex - 1);
    if (nextIndex === previewSubmissionIndex) return;
    const submission = previewSubmissions[nextIndex];
    if (!submission) return;
    setPreviewSubmissionIndex(nextIndex);
    showSubmissionPreview(submission, previewSubmissionPointsPossible);
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
    showSubmissionPreview(submission, previewSubmissionPointsPossible);
  };

  if (!canViewRoster) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  const viewerCanEditGrades =
    Boolean(viewerEnrollmentType && viewerEnrollmentType !== "STUDENT");
  const manualGradeEnabled =
    viewerCanEditGrades && Boolean(previewModalState.submissionId);
  const commentEnabled = manualGradeEnabled;

  return (
    <section className={styles.roster}>
      <div className={classNames(styles.column, styles.left)}>
        <div className={styles.listHeader}>
          <H2>Students</H2>
          <p>
            {visibleRoster.length === 1
              ? "1 member"
              : `${visibleRoster.length} members`}
          </p>
        </div>
        {loading && <p className={styles.state}>Loading roster…</p>}
        {error && (
          <p className={styles.error}>
            Failed to load roster: {error.message ?? "Unknown error"}
          </p>
        )}
        {!loading && !error && visibleRoster.length === 0 && (
          <p className={styles.state}>No students enrolled yet.</p>
        )}
        {visibleRoster.map((entry) => (
          <NavLink
            key={entry.id}
            to={`/${courseId}/roster/${entry.id}`}
            end
            className={({ isActive }) =>
              classNames(styles.studentRow, {
                [styles.studentRowActive]: isActive,
              })
            }
          >
            <div className={styles.studentRowDetails}>
              <h2 className={styles.studentName}>{formatName(entry.user)}</h2>
              <p className={styles.studentMeta}>
                {entry.user?.email || "No email"} •{" "}
                {roleLabels[entry.type] ?? entry.type}
              </p>
            </div>
            <CaretRight size={16} className={styles.studentRowIcon} />
          </NavLink>
        ))}
      </div>
      <div className={classNames(styles.column, styles.details)}>
        {!activeEnrollment ? (
          <p className={styles.state}>Select a student to view details.</p>
        ) : (
          <div className={styles.detailContent}>
            <div className={styles.detailHeader}>
              <h2>{formatName(activeEnrollment.user)}</h2>
              <p className={styles.detailMeta}>
                {activeEnrollment.user?.email || "No email on file"} •{" "}
                {roleLabels[activeEnrollment.type] ?? activeEnrollment.type}
              </p>
            </div>
            <div className={styles.sectionDivider} />
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

            {canManageRoster && (
              <>
                <div className={styles.sectionDivider} />
                <div className={styles.manageSection}>
                <div>
                  <div className={styles.sectionTitle}>Manage access</div>
                  <p className={styles.sectionMeta}>
                    Promote standout students to TAs, demote TAs back to
                    students, or remove inactive accounts. Use Course Details to
                    assign admin access.
                  </p>
                </div>
                <div className={styles.actions}>
                  <Button
                    onClick={() => handleChangeRole(roleAction?.nextType)}
                    disabled={pendingAction === "role" || !roleAction}
                    data-cy="manage-role-button"
                  >
                    {roleAction?.label ?? "Update role"}
                  </Button>
                    <Button
                      onClick={handleRemove}
                      disabled={pendingAction === "remove"}
                      className={styles.removeButton}
                    >
                      {pendingAction === "remove"
                        ? "Removing..."
                        : "Remove from course"}
                    </Button>
                  </div>
                </div>
                {actionError && <p className={styles.error}>{actionError}</p>}
              </>
            )}

            <div className={styles.sectionDivider} />
            <div className={styles.gradeSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <div className={styles.sectionTitle}>Assignment grades</div>
                  <p className={styles.sectionMeta}>
                    {gradedCount}/{totalAssignments || 0} submissions recorded
                  </p>
                </div>
              </div>
              {assignments.length === 0 ? (
                <p className={styles.state}>No assignments available yet.</p>
              ) : (
                <div className={styles.gradeList}>
                  {assignments.map((assignment, index) => {
                    const submission = submissions.find(
                      (entry) => entry.assignmentId === assignment.id
                    );
                    const gradeValue = parseGradeValue(submission?.grade);
                    const pointsPossible = Number(assignment.pointsPossible);
                    const hasGrade = gradeValue != null;
                    const pointsLabel = Number.isFinite(pointsPossible)
                      ? `${pointsPossible} pts`
                      : "Ungraded";
                    const gradeLabel = getSubmissionGradeLabel({
                      gradeValue,
                      hasSubmission: Boolean(submission),
                      pointsPossible: assignment?.pointsPossible,
                      dueDate: assignment?.dueDate,
                    });
                    const percent =
                      hasGrade &&
                      Number.isFinite(pointsPossible) &&
                      pointsPossible > 0
                        ? `${((gradeValue / pointsPossible) * 100).toFixed(1)}%`
                        : "—";
                    return (
                      <React.Fragment key={assignment.id}>
                        <div
                          className={styles.gradeRow}
                          data-cy={`grade-row-${assignment.name}`}
                        >
                          <div style={{ flex: 1 }}>
                            <div className={styles.assignmentName}>
                              {assignment.name}
                            </div>
                            <div className={styles.assignmentMeta}>
                              {pointsLabel}
                            </div>
                          </div>
                          <div className={styles.gradeValues}>
                            <span className={styles.gradeValue}>
                              {gradeLabel}
                            </span>
                            <span className={styles.gradePercent}>
                              {percent}
                            </span>
                          </div>
                          {submission && (
                            <div className={styles.gradeRowActions}>
                              <Button
                                onClick={() =>
                                  handleViewAssignment(
                                    assignment,
                                    submission?.id ?? null
                                  )
                                }
                                disabled={
                                  previewModalState.status === "loading"
                                }
                              >
                                View
                              </Button>
                            </div>
                          )}
                        </div>
                        {index < assignments.length - 1 && (
                          <div className={styles.rowDivider} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <SubmissionPreviewModal
        open={previewModalOpen}
        status={previewModalState.status}
        screenshotUrl={previewModalState.screenshotUrl}
        gradeValue={previewModalState.gradeValue}
        gradeLabel={previewModalState.gradeLabel}
        downloadUrl={previewModalState.downloadUrl}
        downloadFilename={previewModalState.downloadFilename}
        error={previewModalState.error}
        feedback={previewModalState.feedback}
        commentValue={
          commentEnabled
            ? commentDraft
            : previewModalState.staffComment ?? ""
        }
        commentEnabled={commentEnabled}
        commentError={commentError}
        commentSaving={commentSaving}
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
    </section>
  );
};
