import React, { useEffect, useState } from "react";
import { NavLink, useParams, useSearchParams } from "react-router-dom";
import classNames from "classnames";
import { CaretRight, PencilSimple } from "@phosphor-icons/react";
import styles from "./AssignmentList.module.css";
import { H2 } from "../typography/Typography";
import { CreateAssignmentModal } from "../createAssignmentModal/CreateAssignmentModal";
import { useAssignments } from "../../hooks/useAssignments";

export const AssignmentList = ({
  courseId,
  enrollmentType,
  detailsPane = null,
  hasCanvasIntegration = false,
}) => {
  const {
    assignments,
    loading,
    error,
    createAssignment,
    updateAssignment,
    deleteAssignment,
  } = useAssignments(courseId);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [assignmentBeingEdited, setAssignmentBeingEdited] = useState(null);
  const canManageAssignments = ["TEACHER", "TA"].includes(enrollmentType);
  const { assignmentId: activeAssignmentId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const modalQueryParam = searchParams.get("modal");

  const handleCreateAssignment = async (payload) => {
    return createAssignment(payload);
  };

  const handleUpdateAssignment = async (assignmentId, payload) => {
    await updateAssignment(assignmentId, payload);
    handleCloseModal();
  };

  const openCreateModal = () => {
    setModalMode("create");
    setAssignmentBeingEdited(null);
    setAssignmentModalOpen(true);
  };

  const openEditModal = (assignment) => {
    if (!canManageAssignments) return;
    setModalMode("edit");
    setAssignmentBeingEdited(assignment);
    setAssignmentModalOpen(true);
  };

  const handleCloseModal = () => {
    setAssignmentModalOpen(false);
    setAssignmentBeingEdited(null);
    setModalMode("create");
  };

  const handleDeleteAssignment = async (assignmentId) => {
    await deleteAssignment(assignmentId);
    handleCloseModal();
  };

  useEffect(() => {
    if (!canManageAssignments) return;
    if (assignmentModalOpen) return;
    if (modalQueryParam !== "edit-assignment") return;
    if (!assignments || !assignments.length) return;
    if (!activeAssignmentId) return;

    const assignmentToEdit = assignments.find(
      (assignment) => assignment.id === activeAssignmentId
    );
    if (!assignmentToEdit) return;

    setModalMode("edit");
    setAssignmentBeingEdited(assignmentToEdit);
    setAssignmentModalOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("modal");
    setSearchParams(nextParams, { replace: true });
  }, [
    assignments,
    activeAssignmentId,
    assignmentModalOpen,
    canManageAssignments,
    modalQueryParam,
    searchParams,
    setSearchParams,
  ]);

  return (
    <>
      <div className={styles.list}>
        <div className={classNames(styles.side, styles.left)}>
          {canManageAssignments && (
            <div
              className={styles.assignment}
              onClick={openCreateModal}
            >
              <div>
                <H2>New Assignment</H2>
                <p>Create a new assignment</p>
              </div>
              <PencilSimple size={24} />
            </div>
          )}
          {loading && <p>Loading assignments...</p>}
          {error && (
            <p style={{ color: "#b00020" }}>
              Failed to load assignments: {error.message}
            </p>
          )}
          {!loading && !error && (!assignments || assignments.length === 0) && (
            <p
              style={{
                padding: 16,
              }}
            >
              No assignments yet.
            </p>
          )}
          {(assignments || []).map((assignment) => {
            const isActive = assignment.id === activeAssignmentId;

            return (
              <NavLink
                key={assignment.id}
                to={`/${courseId}/assignments/${assignment.id}`}
                className={styles.a}
              >
                <div
                  className={classNames(styles.assignment, {
                    [styles.assignmentActive]: isActive,
                  })}
                >
                  <div>
                    <H2>{assignment.name}</H2>
                    <p>
                      {assignment.pointsPossible} pts • {assignment.unitSystem}
                    </p>
                    {assignment.dueDate && (
                      <p>
                        Due{" "}
                        {new Date(assignment.dueDate).toLocaleString(
                          undefined,
                          {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }
                        )}
                      </p>
                    )}
                  </div>
                  <div className={styles.assignmentActions}>
                    {canManageAssignments && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Edit ${assignment.name}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openEditModal(assignment);
                        }}
                      >
                        <PencilSimple size={18} />
                      </button>
                    )}
                    <CaretRight size={24} />
                  </div>
                </div>
              </NavLink>
            );
          })}
        </div>
        <div className={classNames(styles.side, styles.right)}>
          {detailsPane || (
            <div className={styles.emptyState}>
              Select an assignment to view details
            </div>
          )}
        </div>
      </div>
      {canManageAssignments && (
        <CreateAssignmentModal
          open={assignmentModalOpen}
          onClose={handleCloseModal}
          onCreateAssignment={handleCreateAssignment}
          onUpdateAssignment={handleUpdateAssignment}
          courseId={courseId}
          mode={modalMode}
          assignment={assignmentBeingEdited}
          onDeleteAssignment={handleDeleteAssignment}
          hasCanvasIntegration={hasCanvasIntegration}
        />
      )}
    </>
  );
};
