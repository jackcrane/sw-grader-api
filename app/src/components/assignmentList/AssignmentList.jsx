import React, { useState } from "react";
import styles from "./AssignmentList.module.css";
import classNames from "classnames";
import { H2 } from "../typography/Typography";
import { CaretRight, PencilSimple } from "@phosphor-icons/react";
import { useAuthContext } from "../../context/AuthContext";
import { CreateAssignmentModal } from "../createAssignmentModal/CreateAssignmentModal";

export const AssignmentList = ({ courseId, enrollmentType }) => {
  const assignments = [
    { name: "HW 1", dueDate: "2023-01-01", id: "hw-1" },
    { name: "HW 2", dueDate: "2023-01-02", id: "hw-2" },
    { name: "HW 3", dueDate: "2023-01-03", id: "hw-3" },
  ];

  const [newAssignmentModalOpen, setNewAssignmentModalOpen] = useState(false);

  return (
    <>
      <div className={styles.list}>
        <div className={classNames(styles.side, styles.left)}>
          {["TEACHER", "TA"].includes(enrollmentType) && (
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
          {assignments.map((assignment) => (
            <a
              href={`/${courseId}/assignments/${assignment.id}`}
              className={styles.a}
            >
              <div className={styles.assignment}>
                <div>
                  <H2>{assignment.name}</H2>
                  <p>{new Date(assignment.dueDate).toLocaleDateString()}</p>
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
      {["TEACHER", "TA"].includes(enrollmentType) && (
        <CreateAssignmentModal
          open={newAssignmentModalOpen}
          onClose={() => setNewAssignmentModalOpen(false)}
          onCreateAssignment={() => setNewAssignmentModalOpen(false)}
          courseId={courseId}
        />
      )}
    </>
  );
};
