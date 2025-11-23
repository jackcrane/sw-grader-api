import React from "react";
import { Outlet, useOutletContext } from "react-router-dom";
import { AssignmentList } from "../../components/assignmentList/AssignmentList";

export const CourseOverview = () => {
  const { enrollment } = useOutletContext();
  const outletContext = {
    courseId: enrollment.courseId,
    enrollmentType: enrollment.type,
  };
  const hasCanvasIntegration = Boolean(
    enrollment.course?.canvasIntegration?.id
  );

  return (
    <div>
      <AssignmentList
        courseId={enrollment.courseId}
        enrollmentType={enrollment.type}
        detailsPane={<Outlet context={outletContext} />}
        hasCanvasIntegration={hasCanvasIntegration}
      />
    </div>
  );
};
