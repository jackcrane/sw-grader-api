import React from "react";
import { useOutletContext } from "react-router-dom";
import { AssignmentList } from "../../components/assignmentList/AssignmentList";

export const CourseOverview = () => {
  const { enrollment } = useOutletContext();

  return (
    <div>
      <AssignmentList
        courseId={enrollment.courseId}
        enrollmentType={enrollment.type}
      />
    </div>
  );
};
