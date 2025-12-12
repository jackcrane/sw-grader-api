#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import assignmentConfig from "./assignment-config.json" with { type: "json" };
import { SESSION_COOKIE_NAME, createSessionToken } from "../util/auth.js";
import { prisma } from "#prisma";
import { Blob } from "node:buffer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIGNATURES_DIR = path.resolve(__dirname, "..", "..", "test-variants");

const DEFAULT_BASE_URL = "http://localhost:3000";
const USAGE =
  "Usage: yarn autofill:assignment [-c COURSE] [-b BASE_URL] [-h]\n" +
  "  -c, --course    optional course id/name substring to auto-choose\n" +
  "  -b, --base      API base URL (default http://localhost:3000)\n" +
  "  -h, --help      show this message";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    courseQuery: null,
    baseUrl: DEFAULT_BASE_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "-c" || arg === "--course") {
      if (!next || next.startsWith("-")) {
        console.error("Expected a course identifier after", arg);
        console.error(USAGE);
        process.exit(1);
      }
      parsed.courseQuery = next.trim();
      index += 1;
      continue;
    }

    if (arg === "-b" || arg === "--base") {
      if (!next || next.startsWith("-")) {
        console.error("Expected a base URL after", arg);
        console.error(USAGE);
        process.exit(1);
      }
      parsed.baseUrl = next.trim();
      index += 1;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      console.log(USAGE);
      process.exit(0);
    }

    console.error("Unknown argument:", arg);
    console.error(USAGE);
    process.exit(1);
  }

  return parsed;
};

const normalizeBaseUrl = (value) => {
  let normalized = (value || "").trim();
  if (!normalized) {
    throw new Error("API base URL cannot be empty");
  }
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  return normalized.replace(/\/+$/, "");
};

const buildApiUrl = (baseUrl, pathSuffix) => {
  const normalized = normalizeBaseUrl(baseUrl);
  const sanitized = pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`;
  return `${normalized}/api${sanitized}`;
};

const fetchCourses = () =>
  prisma.course.findMany({
    where: {
      billingScheme: "PER_COURSE",
      deleted: false,
      studentInviteCode: {
        not: null,
      },
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      abbr: true,
      studentInviteCode: true,
    },
  });

const describeCourse = (course) => {
  const abbr = course.abbr ? ` (${course.abbr})` : "";
  return `${course.name}${abbr} [${course.id}] – invite: ${course.studentInviteCode}`;
};

const promptCourseSelection = async (courses) => {
  console.log("Available courses:");
  courses.forEach((course, index) => {
    console.log(`  ${index + 1}) ${describeCourse(course)}`);
  });

  const rl = readline.createInterface({ input, output });
  const askSelection = async () => {
    const answer = await rl.question(
      `Select course number (1-${courses.length}): `
    );
    const parsed = Number.parseInt(answer, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > courses.length) {
      console.log("Enter a valid number from the list above.");
      return askSelection();
    }
    return courses[parsed - 1];
  };

  try {
    return await askSelection();
  } finally {
    rl.close();
  }
};

const matchesCourseQuery = (course, query) => {
  if (!query) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  const courseId = course.id?.toLowerCase() ?? "";
  return (
    courseId === normalized ||
    (course.studentInviteCode || "").toLowerCase() === normalized ||
    (course.name || "").toLowerCase().includes(normalized) ||
    (course.abbr || "").toLowerCase().includes(normalized)
  );
};

const determineCourse = async (courseQuery) => {
  const courses = await fetchCourses();
  if (!courses.length) {
    throw new Error("No per-course billing courses found in the database.");
  }

  if (courseQuery) {
    const match = courses.find((course) =>
      matchesCourseQuery(course, courseQuery)
    );
    if (match) {
      return match;
    }
    console.log(
      `No course matched "${courseQuery}", please select from the list.`
    );
  }

  return promptCourseSelection(courses);
};

const getHttpHelpers = (() => {
  let cache = null;
  return async () => {
    if (cache) return cache;
    if (
      typeof globalThis.fetch === "function" &&
      typeof globalThis.FormData === "function"
    ) {
      cache = { fetchFn: globalThis.fetch, FormData: globalThis.FormData };
      return cache;
    }
    const undici = await import("undici");
    cache = { fetchFn: undici.fetch, FormData: undici.FormData };
    return cache;
  };
})();

const readErrorMessage = async (response) => {
  try {
    const body = await response.text();
    if (!body) return null;
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const prepareSignatures = async () => {
  const rawSignatures = (assignmentConfig.signatures || []).map(
    (signature) => ({
      ...signature,
      probability:
        typeof signature.probability === "number" && signature.probability >= 0
          ? signature.probability
          : 1,
    })
  );

  if (!assignmentConfig.assignmentId) {
    throw new Error("Assignment ID is missing from the configuration.");
  }

  if (!rawSignatures.length) {
    throw new Error("No signatures defined in the assignment configuration.");
  }

  const loaded = [];
  for (const signature of rawSignatures) {
    const absolute = path.resolve(SIGNATURES_DIR, signature.file);
    const buffer = await fs.readFile(absolute);
    loaded.push({
      ...signature,
      buffer,
      fileName: path.basename(signature.file),
    });
  }

  return loaded;
};

const totalWeight = (signatures) =>
  signatures.reduce((sum, signature) => sum + signature.probability, 0);

const chooseSignature = (signatures, weightSum) => {
  const rand = Math.random() * weightSum;
  let running = 0;
  for (const signature of signatures) {
    running += signature.probability;
    if (rand <= running) {
      return signature;
    }
  }
  return signatures[signatures.length - 1];
};

const fetchStudents = (courseId) =>
  prisma.enrollment.findMany({
    where: {
      courseId,
      type: "STUDENT",
      deleted: false,
      user: {
        deleted: false,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      user: true,
    },
  });

const createSessionCookie = (userId) => {
  const token = createSessionToken(userId);
  return `${SESSION_COOKIE_NAME}=${token}`;
};

const run = async () => {
  const { courseQuery, baseUrl } = parseArgs();
  const { fetchFn, FormData } = await getHttpHelpers();
  const course = await determineCourse(courseQuery);
  const students = await fetchStudents(course.id);

  const signatures = await prepareSignatures();
  const signatureWeight = totalWeight(signatures);
  const missingRate =
    typeof assignmentConfig.missingRate === "number"
      ? Math.max(0, Math.min(1, assignmentConfig.missingRate))
      : 0;

  if (!students.length) {
    console.log("No enrolled students found for the selected course.");
    return;
  }

  console.log(
    `Submitting assignment ${assignmentConfig.assignmentId} for ${
      students.length
    } students in ${describeCourse(course)}`
  );

  const stats = {
    submitted: 0,
    skipped: 0,
    errors: 0,
  };

  for (const enrollment of students) {
    const user = enrollment.user;
    if (!user) {
      continue;
    }

    if (Math.random() < missingRate) {
      stats.skipped += 1;
      console.log(`[skip] ${user.email} left assignment missing`);
      continue;
    }

    const signature = chooseSignature(signatures, signatureWeight);
    const form = new FormData();
    form.append(
      "file",
      new Blob([signature.buffer], { type: "application/octet-stream" }),
      signature.fileName
    );

    const url = buildApiUrl(
      baseUrl,
      `/courses/${course.id}/assignments/${assignmentConfig.assignmentId}/submissions`
    );

    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: {
          Cookie: createSessionCookie(user.id),
        },
        body: form,
      });

      if (!response.ok) {
        const errorBody = await readErrorMessage(response);
        throw new Error(
          errorBody?.message ||
            errorBody?.error ||
            `Submission failed (${response.status})`
        );
      }

      stats.submitted += 1;
      console.log(
        `[${stats.submitted}/${students.length}] ${user.email} submitted ${signature.fileName}`
      );
    } catch (error) {
      stats.errors += 1;
      console.error(
        `[error] ${user.email} could not submit:`,
        error?.message || error
      );
    }
  }

  console.log(
    `Finished: ${stats.submitted} submissions, ${stats.skipped} skipped${
      stats.errors ? `, ${stats.errors} errors` : ""
    }.`
  );
};

const main = async () => {
  try {
    await run();
  } catch (error) {
    console.error("Autofill failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

main();
