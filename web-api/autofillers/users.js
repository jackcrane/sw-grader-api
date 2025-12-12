#!/usr/bin/env node

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { faker } from "@faker-js/faker";
import { SESSION_COOKIE_NAME } from "../util/auth.js";
import { prisma } from "#prisma";

const DEFAULT_COUNT = 20;
const DEFAULT_BASE_URL = "http://localhost:3000";
const USAGE =
  "Usage: yarn autofill:users [-n COUNT] [-c COURSE] [-b BASE_URL]\n" +
  "  -n, --count     how many student accounts to create (default 20)\n" +
  "  -c, --course    optional course id/name substring to auto-choose\n" +
  "  -b, --base      API base URL (default http://localhost:3000)\n" +
  "  -h, --help      show this message";

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    count: DEFAULT_COUNT,
    courseQuery: null,
    baseUrl: DEFAULT_BASE_URL,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];
    if (arg === "-n" || arg === "--count") {
      if (!nextValue || nextValue.startsWith("-")) {
        console.error("Expected a number after", arg);
        console.error(USAGE);
        process.exit(1);
      }
      index += 1;
      const parsedCount = Number.parseInt(nextValue, 10);
      if (!Number.isFinite(parsedCount) || parsedCount <= 0) {
        console.error("Count must be a positive integer");
        console.error(USAGE);
        process.exit(1);
      }
      parsed.count = parsedCount;
      continue;
    }

    if (arg === "-b" || arg === "--base") {
      if (!nextValue || nextValue.startsWith("-")) {
        console.error("Expected a base URL after", arg);
        console.error(USAGE);
        process.exit(1);
      }
      index += 1;
      parsed.baseUrl = nextValue.trim();
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

const buildApiUrl = (baseUrl, path) => {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const sanitizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}/api${sanitizedPath}`;
};

const fetchCourses = async () =>
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
  const ask = async () => {
    const answer = await rl.question(
      `Select course number (1-${courses.length}): `
    );
    const parsed = Number.parseInt(answer, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > courses.length) {
      console.log("Enter a valid number from the list above.");
      return ask();
    }
    return courses[parsed - 1];
  };

  try {
    return await ask();
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

const getSetFetch = (() => {
  let fetchImpl = null;
  return async () => {
    if (fetchImpl) return fetchImpl;
    if (typeof globalThis.fetch === "function") {
      fetchImpl = globalThis.fetch;
      return fetchImpl;
    }
    const undici = await import("undici");
    fetchImpl = undici.fetch;
    return fetchImpl;
  };
})();

const extractSessionCookie = (setCookieHeader) => {
  if (!setCookieHeader) return null;
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [String(setCookieHeader)];

  for (const rawCookie of cookies) {
    const trimmed = rawCookie.trim();
    const [pair] = trimmed.split(";");
    if (pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return pair;
    }
  }

  const fallback = String(cookies[0] || "").split(";")[0];
  return fallback || null;
};

const readErrorMessage = async (response) => {
  try {
    const body = await response.text();
    if (!body) return null;
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const registerStudent = async (fetchFn, baseUrl, student) => {
  const response = await fetchFn(buildApiUrl(baseUrl, "/auth/register"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(student),
  });

  if (!response.ok) {
    const errorBody = await readErrorMessage(response);
    throw new Error(
      errorBody?.message ||
        errorBody?.error ||
        `Registration failed (${response.status})`
    );
  }

  const payload = await response.json();
  const rawHeader = response.headers.raw?.()["set-cookie"];
  const setCookieHeader = rawHeader ?? response.headers.get("set-cookie");
  const sessionCookie = extractSessionCookie(setCookieHeader);
  if (!sessionCookie) {
    throw new Error("Session cookie missing from register response");
  }

  return {
    user: payload.user,
    password: student.password,
    sessionCookie,
  };
};

const enrollStudent = async (fetchFn, baseUrl, cookie, inviteCode) => {
  const response = await fetchFn(buildApiUrl(baseUrl, "/enrollments"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ inviteCode }),
  });

  if (!response.ok) {
    const errorBody = await readErrorMessage(response);
    throw new Error(
      errorBody?.message ||
        errorBody?.error ||
        `Enrollment failed (${response.status})`
    );
  }

  return response.json();
};

const makeEmail = (firstName, lastName) => {
  const safeFirst = (firstName || "student")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const safeLast = (lastName || "user").toLowerCase().replace(/[^a-z]/g, "");
  const suffix = faker.string.numeric({ length: 4 });
  // const domain = faker.internet.domainName();
  const domain = "featurebench-test.com";
  return `${safeFirst || "student"}.${safeLast || "user"}.${suffix}@${domain}`;
};

const run = async () => {
  const { count, courseQuery, baseUrl } = parseArgs();
  const fetchFn = await getSetFetch();
  const course = await determineCourse(courseQuery);
  const inviteCode = course.studentInviteCode;
  console.log(
    `Seeding ${count} students via ${baseUrl} into ${describeCourse(course)}`
  );

  const stats = {
    registered: 0,
    enrolled: 0,
    errors: 0,
  };

  for (let index = 0; index < count; index += 1) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = makeEmail(firstName, lastName);
    const password = `${faker.internet.password(12)}!`;

    try {
      const {
        user,
        password: savedPassword,
        sessionCookie,
      } = await registerStudent(fetchFn, baseUrl, {
        email,
        password,
        firstName,
        lastName,
      });

      stats.registered += 1;

      await enrollStudent(fetchFn, baseUrl, sessionCookie, inviteCode);
      stats.enrolled += 1;

      console.log(
        `[${index + 1}/${count}] ${user.email} (${savedPassword}) – enrolled`
      );
    } catch (error) {
      stats.errors += 1;
      console.error(
        `[${index + 1}/${count}] Failed to create student:`,
        error?.message ?? error
      );
    }
  }

  console.log(
    `Done: ${stats.registered} created, ${stats.enrolled} enrolled${
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
