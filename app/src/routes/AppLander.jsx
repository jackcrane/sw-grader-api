import React from "react";
import { Page } from "../components/page/Page";
import { useAuthContext } from "../context/AuthContext";
import { useEnrollments } from "../hooks/useEnrollments";
import { Card } from "../components/card/Card";
import { H2 } from "../components/typography/Typography";
import { Spacer } from "../components/spacer/Spacer";
import { EnrollmentsSection } from "../components/enrollments/EnrollmentsSection";

export const AppLander = () => {
  const { user } = useAuthContext();
  const { enrollments, loading, createEnrollment } = useEnrollments();

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
          />
        </Card>
      </main>
    </Page>
  );
};
