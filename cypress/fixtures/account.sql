INSERT INTO "public"."User"
("id", "email", "firstName", "lastName", "createdAt", "updatedAt",
 "canCreateCourses", "deleted", "passwordHash", "stripeCustomerId")
VALUES
(
  'cmj9ffow70000qr6banbe3856',
  'test@featurebench-test.com',
  'Test',
  'Teacher',
  '2025-12-17 03:03:16.423',
  '2025-12-17 03:03:17.003',
  false,
  false,
  '$2b$12$H1o/8a1EWLPeI/CEPTUN3OmAscG9.9KEZO887HA9BH2ktZLf8xdUC',
  'cus_TcPqnBZbrdH575'
),
(
  'cmj9ffow70000qr6banbe3d56',
  'student@featurebench-test.com',
  'Test',
  'Student',
  '2025-12-17 03:03:16.423',
  '2025-12-17 03:03:17.003',
  false,
  false,
  '$2b$12$H1o/8a1EWLPeI/CEPTUN3OmAscG9.9KEZO887HA9BH2ktZLf8xdUC',
  NULL
),
(
  'cmj9ff2w70000qr6banbe3d56',
  'ta@featurebench-test.com',
  'Test',
  'TA',
  '2025-12-17 03:03:16.423',
  '2025-12-17 03:03:17.003',
  false,
  false,
  '$2b$12$H1o/8a1EWLPeI/CEPTUN3OmAscG9.9KEZO887HA9BH2ktZLf8xdUC',
  NULL
);