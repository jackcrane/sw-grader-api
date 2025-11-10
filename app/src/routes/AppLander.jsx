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
import { Section } from "../components/form/Section";
import { Input } from "../components/input/Input";

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
                    footer={
                      <Row gap={2}>
                        <Button onClick={() => setNewCourseModalOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => setNewCourseModalOpen(false)}
                          variant="primary"
                        >
                          Create course
                        </Button>
                      </Row>
                    }
                  >
                    <Section
                      title="Details"
                      subtitle={
                        <>
                          <p>
                            Tell us about your course. While you can update this
                            later, it is not recommended.
                          </p>
                        </>
                      }
                    >
                      <Input
                        placeholder="e.g., Intro to CAD"
                        label="Course name"
                      />
                      <Input
                        placeholder="e.g., ENGR 1701"
                        label="Course abbreviation"
                      />
                    </Section>
                    <Section
                      title="Student Access"
                      subtitle={
                        <>
                          <p>
                            We will create a code to allow students to join your
                            class on FeatureBench. This is a code you can put on
                            your course page, syllabus, etc.
                          </p>
                        </>
                      }
                    ></Section>
                    <Section
                      title="Instructor Access"
                      last
                      subtitle={
                        <>
                          <p>
                            We will create a code to allow other instructors,
                            TAs, and auditors to join your class on
                            FeatureBench. Instructors have access to view course
                            information like rosters and grades.
                          </p>
                        </>
                      }
                    ></Section>
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
