import React, { useState } from "react";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { useEnrollments } from "../hooks/useEnrollments";
import { Card } from "../components/card/Card";
import { H2, Lead } from "../components/typography/Typography";
import { Spinner } from "../components/spinner/Spinner";
import { Row } from "../components/flex/Flex";
import { Spacer } from "../components/spacer/Spacer";
import { Button } from "../components/button/Button";
import { Modal } from "../components/modal/Modal";

export const AppLander = () => {
  const { user, logout, isLoggingOut } = useAuthContext();
  const { enrollments, loading } = useEnrollments();
  const [newCourseModalOpen, setNewCourseModalOpen] = useState(false);

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
          {loading ? (
            <Row>
              <Spinner />
              <Lead>Enrollments loading...</Lead>
            </Row>
          ) : (
            <>
              {enrollments.length === 0 ? (
                <div>
                  <Lead>No enrollments</Lead>
                  <Spacer />
                  <Button onClick={() => setNewCourseModalOpen(true)}>
                    + Create a new course
                  </Button>
                  <Modal
                    title="Create a new Course"
                    open={newCourseModalOpen}
                    onClose={() => setNewCourseModalOpen(false)}
                  >
                    asdfs
                  </Modal>
                </div>
              ) : (
                <>
                  <Lead>Here are your enrollments</Lead>
                </>
              )}
            </>
          )}
        </Card>
      </main>
    </Page>
  );
};
