import React, { useState } from "react";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { useEnrollments } from "../hooks/useEnrollments";
import { Card } from "../components/card/Card";
import { H2 } from "../components/typography/Typography";
import { Spacer } from "../components/spacer/Spacer";
import { EnrollmentsSection } from "../components/enrollments/EnrollmentsSection";
import { Button } from "../components/button/Button";
import { CreateCourseModal } from "../components/enrollments/CreateCourseModal";
import { useNavigate } from "react-router-dom";

export const AppLander = () => {
  const { user } = useAuthContext();
  const { enrollments, loading, createEnrollment } = useEnrollments();
  const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);
  const navigate = useNavigate();

  const handleCreateCourse = async (courseDetails) => {
    return createEnrollment?.(courseDetails);
  };

  const handleIntegrationContinue = (courseId) => {
    if (courseId) {
      navigate(`/${courseId}`);
    }
  };

  return (
    <Page title="FeatureBench" user={user}>
      <main>
        <header>
          <h1>
            Hello, {user?.firstName} {user?.lastName}
          </h1>
        </header>
        <Card>
          <H2>Enrollments & Courses</H2>

          <Spacer />
          <EnrollmentsSection
            loading={loading}
            enrollments={enrollments}
            createEnrollment={createEnrollment}
            onCreateCourseClick={() => setNewCourseModalOpen(true)}
          />
        </Card>
        <Spacer size={2} />
        <Card>
          <H2>Set up a new course</H2>
          <Spacer />
          <p>
            Are you a teacher? Start improving student outcomes with
            FeatureBench.
          </p>
          <Spacer size={4} />
          <Button onClick={() => setNewCourseModalOpen(true)}>
            Create a new course
          </Button>
        </Card>
      </main>
      <CreateCourseModal
        open={newCourseModalOpen}
        onClose={() => setNewCourseModalOpen(false)}
        onCreateCourse={handleCreateCourse}
        onIntegrationContinue={handleIntegrationContinue}
      />
    </Page>
  );
};
