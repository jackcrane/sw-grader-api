import React from "react";
import { useOutletContext } from "react-router-dom";

export const CourseGradebook = () => {
  const { courseId } = useOutletContext();

  return (
    <section>
      <p>Gradebook scaffolding for course ID {courseId}. Hook up data here.</p>
    </section>
  );
};
