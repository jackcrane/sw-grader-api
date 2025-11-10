import React from "react";
import { Navigate, useOutletContext } from "react-router-dom";

export const CourseRoster = () => {
  const { canViewRoster, courseId } = useOutletContext();

  if (!canViewRoster) {
    return <Navigate to={`/${courseId}`} replace />;
  }

  return (
    <section>
      <p>Roster tools will live here. Only teachers and TAs can see this tab.</p>
    </section>
  );
};
