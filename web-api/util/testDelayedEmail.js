import readline from "readline";
import { enqueueBillingJob } from "../services/billingQueue.js";
import { BILLING_FOLLOW_UP_JOB } from "../services/enrollmentFollowUps.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) =>
  new Promise((resolve) => rl.question(prompt, resolve));

const main = async () => {
  try {
    const email = (await question("Teacher email (for notification): ")).trim();
    const courseName = (await question("Course name: ")).trim() || "Test Course";
    const studentName =
      (await question("Student name (optional): ")).trim() || "Test Student";
    rl.close();

    if (!email) {
      console.error("Email is required.");
      process.exit(1);
    }

    const runAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    await enqueueBillingJob(
      {
        type: BILLING_FOLLOW_UP_JOB,
        action: "WARNING",
        enrollmentId: "test-enrollment",
        teacherId: "test-teacher",
        studentId: "test-student",
        courseId: "test-course",
        runAt,
        testEmailOverride: {
          email,
          courseName,
          studentName,
        },
      },
      { delayMs: 2 * 60 * 1000 }
    );

    console.log(
      `Scheduled a test follow-up email for ${runAt}. Check your inbox shortly.`
    );
  } catch (error) {
    console.error("Failed to schedule test email", error);
    process.exit(1);
  }
};

if (process.argv[1] && process.argv[1].includes("testDelayedEmail")) {
  main();
}
