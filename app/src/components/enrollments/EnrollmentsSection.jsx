import React, { useState } from "react";
import { Lead } from "../typography/Typography";
import { Spacer } from "../spacer/Spacer";
import { Button } from "../button/Button";
import { Row } from "../flex/Flex";
import { Spinner } from "../spinner/Spinner";
import { CreateCourseModal } from "./CreateCourseModal";
import { EnrollmentRow } from "./EnrollmentRow";
import { useAuthContext } from "../../context/AuthContext";

export const EnrollmentsSection = ({
  loading,
  enrollments,
  createEnrollment,
}) => {
  const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);
  const enrollmentsList = enrollments ?? [];
  const { user } = useAuthContext();

  if (loading) {
    return (
      <Row>
        <Spinner />
        <Lead>Enrollments loading...</Lead>
      </Row>
    );
  }

  return (
    <div>
      {enrollmentsList.length === 0 ? (
        <>
          <Lead>No enrollments</Lead>
          <Spacer />
        </>
      ) : (
        <>
          <Lead>Here are your enrollments</Lead>
          <Spacer />
          <div>
            {enrollmentsList.map((enrollment) => (
              <EnrollmentRow
                key={
                  enrollment.id ?? enrollment.courseId ?? enrollment.course?.id
                }
                enrollment={enrollment}
              />
            ))}
          </div>
          <Spacer />
        </>
      )}

      <Spacer size={3} />

      {user.canCreateCourses && (
        <Button onClick={() => setNewCourseModalOpen(true)}>
          + Create a new course
        </Button>
      )}

      <CreateCourseModal
        open={newCourseModalOpen}
        onClose={() => setNewCourseModalOpen(false)}
        onCreateCourse={async (courseDetails) => {
          await createEnrollment?.(courseDetails);
        }}
      />
    </div>
  );
};
