import React, { useState } from "react";
import styles from "./AssignmentList.module.css";
import classNames from "classnames";
import { H2 } from "../typography/Typography";
import { CaretRight, PencilSimple } from "@phosphor-icons/react";
import { CreateAssignmentModal } from "../createAssignmentModal/CreateAssignmentModal";
import { useAssignments } from "../../hooks/useAssignments";

export const AssignmentList = ({ courseId, enrollmentType }) => {
  const { assignments, loading, error, createAssignment } =
    useAssignments(courseId);

  const [newAssignmentModalOpen, setNewAssignmentModalOpen] = useState(false);
  const canManageAssignments = ["TEACHER", "TA"].includes(enrollmentType);

  const handleCreateAssignment = async (payload) => {
    await createAssignment(payload);
    setNewAssignmentModalOpen(false);
  };

  return (
    <>
      <div className={styles.list}>
        <div className={classNames(styles.side, styles.left)}>
          {canManageAssignments && (
            <div
              className={styles.assignment}
              onClick={() => setNewAssignmentModalOpen(true)}
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
          {(assignments || []).map((assignment) => (
            <a
              key={assignment.id}
              href={`/${courseId}/assignments/${assignment.id}`}
              className={styles.a}
            >
              <div className={styles.assignment}>
                <div>
                  <H2>{assignment.name}</H2>
                  <p>
                    {assignment.pointsPossible} pts • {assignment.unitSystem}
                  </p>
                  {assignment.dueDate && (
                    <p>
                      Due{" "}
                      {new Date(assignment.dueDate).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                </div>
                <CaretRight size={24} />
              </div>
            </a>
          ))}
        </div>
        <div className={classNames(styles.side, styles.right)}>
          Select an assignment to view details
        </div>
      </div>
      {canManageAssignments && (
        <CreateAssignmentModal
          open={newAssignmentModalOpen}
          onClose={() => setNewAssignmentModalOpen(false)}
          onCreateAssignment={handleCreateAssignment}
          courseId={courseId}
        />
      )}
    </>
  );
};
