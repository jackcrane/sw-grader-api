import { defineConfig } from "cypress";
import {
  yamlPreprocessor,
  registerCommand,
  listRegisteredCommands,
  generateJsonSchema,
} from "cypress-yaml-plugin";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
import { getStripeClient } from "./web-api/util/stripe";
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});
const stripe = getStripeClient();

registerCommand(
  "createAndAffiliateStripeCustomer",
  (options) => [
    `cy.task('stripe:createAndAffiliateCustomer', ${JSON.stringify(options)})`,
  ],
  {
    schema: z.object({
      dbId: z.string(),
      email: z.string().email(),
      name: z.string(),
    }),
  }
);

registerCommand(
  "authenticateUser",
  (options) => {
    const encodedOptions = JSON.stringify(options);
    const usernameLabel = JSON.stringify(options.username);
    return [
      `cy.task('authenticateUser', ${encodedOptions}).then(({ cookieName, cookieValue, cookieOptions }) => {
        if (!cookieName || typeof cookieValue === 'undefined') {
          throw new Error('authenticateUser task returned invalid cookie data');
        }
        cy.clearCookies();
        cy.setCookie(cookieName, cookieValue, cookieOptions || {});
        cy.log('Authenticated as ' + ${usernameLabel});
      });`,
    ];
  },
  {
    schema: z.object({
      username: z.string().min(1, "username is required"),
      password: z.string().min(1, "password is required"),
    }),
  }
);

registerCommand(
  "fillStripeElementsInput",
  ({ field, value }) => {
    return [
      `cy.get('iframe[name^="__privateStripeFrame"]')`,
      `  .its("0.contentDocument.body")`,
      `  .should("not.be.empty")`,
      `  .then(cy.wrap)`,
      `  .find(\`input[data-elements-stable-field-name="${field}"]\`)`,
      `  .type(${value});`,
    ];
  },
  {
    schema: z.object({
      field: z.string(),
      value: z.string(),
    }),
  }
);

registerCommand(
  "acceptStripe3dSecure",
  ({ action }) => {
    return [
      `cy.get('iframe[name^="__privateStripeFrame"][role="presentation"]')`,
      `  .filter((_, iframe) =>`,
      `    iframe.contentDocument?.querySelector('iframe[name="stripe-challenge-frame"]')`,
      `  )`,
      `  .first()`,
      `  .its("0.contentDocument.body")`,
      `  .should("not.be.empty")`,
      `  .then(cy.wrap)`,
      `  .find('iframe[name^="stripe-challenge-frame"]')`,
      `  .its("0.contentDocument.body")`,
      `  .should("not.be.empty")`,
      `  .then(cy.wrap)`,
      action === "accept"
        ? `  .find('#test-source-authorize-3ds')`
        : `  .find('#test-source-fail-3ds')`,
      `  .click();`,
    ];
  },
  {
    schema: z.object({
      action: z.enum(["accept", "reject"]),
    }),
  }
);

registerCommand(
  "assertStripeCustomerValue",
  ({ dbId, balance }) => {
    return [
      `cy.task('stripe:assertStripeCustomerValue', { dbId: '${dbId}' }).then((actualBalance) => {
        expect(actualBalance).to.equal(${balance});
      });`,
    ];
  },
  {
    schema: z.object({
      dbId: z.string(),
      balance: z.number(),
    }),
  }
);

registerCommand(
  "forceSetJoinCode",
  ({ code }) => {
    return [`cy.task('forceSetJoinCode', { code: '${code}' })`];
  },
  {
    schema: z.object({
      code: z.string(),
    }),
  }
);

registerCommand(
  "assertEnrollmentFollowUpResolvedAt",
  ({ userId }) => {
    return [
      `cy.task('assertEnrollmentFollowUpResolvedAt', { userId: '${userId}' })`,
    ];
  },
  {
    schema: z.object({
      userId: z.string(),
    }),
  }
);

generateJsonSchema();
// console.log(listRegisteredCommands());

const SESSION_COOKIE_NAME = "wos-session";
const DEFAULT_BASE_URL =
  process.env.CYPRESS_BASE_URL || "http://localhost:3000";

const getSetCookieHeaders = (headers) => {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  if (typeof headers.raw === "function") {
    const raw = headers.raw();
    if (raw && Array.isArray(raw["set-cookie"])) {
      return raw["set-cookie"];
    }
  }
  if (typeof headers.get === "function") {
    const header = headers.get("set-cookie");
    return header ? [header] : [];
  }
  return [];
};

const parseCookieHeader = (cookieHeader) => {
  const segments = cookieHeader.split(";").map((segment) => segment.trim());
  const [nameValue, ...attributes] = segments;
  const [rawName, ...valueParts] = nameValue.split("=");
  const cookieName = rawName?.trim();
  const cookieValue = valueParts.join("=");
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  };

  attributes.forEach((attribute) => {
    if (!attribute) return;
    const [attrName, ...attrValueParts] = attribute.split("=");
    const key = attrName?.toLowerCase();
    const value = attrValueParts.join("=");
    switch (key) {
      case "path":
        cookieOptions.path = value || "/";
        break;
      case "secure":
        cookieOptions.secure = true;
        break;
      case "httponly":
        cookieOptions.httpOnly = true;
        break;
      case "samesite": {
        const normalized = value?.toLowerCase();
        if (normalized === "lax" || normalized === "strict") {
          cookieOptions.sameSite = normalized;
        } else if (normalized === "none" || normalized === "no_restriction") {
          cookieOptions.sameSite = "no_restriction";
        }
        break;
      }
      case "expires": {
        const expiresDate = new Date(value);
        if (!Number.isNaN(expiresDate.getTime())) {
          cookieOptions.expiry = Math.floor(expiresDate.getTime() / 1000);
        }
        break;
      }
      case "max-age": {
        const seconds = parseInt(value, 10);
        if (!Number.isNaN(seconds)) {
          cookieOptions.expiry =
            Math.floor(Date.now() / 1000) + Math.max(seconds, 0);
        }
        break;
      }
      default:
        break;
    }
  });

  return { cookieName, cookieValue, cookieOptions };
};

const findSessionCookie = (setCookieHeaders) => {
  for (const header of setCookieHeaders) {
    if (!header) continue;
    const trimmed = header.trim();
    const [namePart] = trimmed.split(";");
    const [name] = namePart.split("=");
    if (name?.trim() === SESSION_COOKIE_NAME) {
      return parseCookieHeader(trimmed);
    }
  }
  return null;
};

function sanitizeDbUrlForPsql(dbUrl) {
  try {
    const url = new URL(dbUrl);
    let mutated = false;

    if (url.searchParams.has("schema")) {
      url.searchParams.delete("schema");
      mutated = true;
    }

    return mutated ? url.toString() : dbUrl;
  } catch (error) {
    return dbUrl;
  }
}

function runPsql(dbUrl, args) {
  const sanitizedDbUrl = sanitizeDbUrlForPsql(dbUrl);
  const result = spawnSync("psql", [sanitizedDbUrl, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`psql command failed with exit code ${result.status}`);
  }
}

function runPrismaMigrate(dbUrl) {
  const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
    cwd: path.resolve(process.cwd(), "web-api"),
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error("Prisma migrate deploy failed");
  }
}

function resolveSqlPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error(
      "db:seed expects the relative path to a SQL file, e.g. fixtures/account.sql"
    );
  }

  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return path.resolve(process.cwd(), "cypress", relativePath);
}

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    video: false,
    screenshotsFolder: "cypress/screenshots",
    downloadsFolder: "cypress/downloads",
    retries: {
      runMode: 2,
      openMode: 0,
    },
    viewportWidth: 1280,
    viewportHeight: 800,
    chromeWebSecurity: false,
    defaultCommandTimeout: 8000,
    requestTimeout: 8000,
    responseTimeout: 8000,
    supportFile: false,
    async setupNodeEvents(on, config) {
      await client.connect();
      // implement node event listeners here
      yamlPreprocessor(on);
      const resolvedBaseUrl = config?.baseUrl || DEFAULT_BASE_URL;

      on("task", {
        authenticateUser: async ({ username, password }) => {
          if (!username || !password) {
            throw new Error(
              "authenticateUser requires both username and password"
            );
          }

          const loginUrl = new URL("/api/auth/login", resolvedBaseUrl);
          const response = await fetch(loginUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              email: username,
              password,
            }),
          });

          let body = null;
          try {
            body = await response.json();
          } catch (error) {
            // Ignore parsing error; handled below.
          }

          if (!response.ok || !body?.authenticated) {
            const statusText = response.statusText || "";
            throw new Error(
              `Failed to authenticate user ${username}: ${response.status} ${statusText}`.trim()
            );
          }

          const sessionCookie = findSessionCookie(
            getSetCookieHeaders(response.headers)
          );
          if (!sessionCookie) {
            throw new Error(
              "authenticateUser task did not receive the session cookie"
            );
          }
          return sessionCookie;
        },
        "db:seed": (relativeSqlPath) => {
          const dbUrl = process.env.DATABASE_URL;

          if (!dbUrl) {
            throw new Error(
              "DATABASE_URL env variable must be set for db:seed"
            );
          }

          if (!dbUrl.includes("localhost")) {
            console.error(
              "DATABASE_URL must point to localhost; refusing to seed remote database"
            );
            process.exit(1);
          }

          const sqlFilePath = resolveSqlPath(relativeSqlPath);

          if (!fs.existsSync(sqlFilePath)) {
            throw new Error(`SQL file not found: ${sqlFilePath}`);
          }

          runPsql(dbUrl, ["-c", "DROP SCHEMA IF EXISTS public CASCADE"]);
          runPsql(dbUrl, ["-c", "CREATE SCHEMA public"]);
          runPrismaMigrate(dbUrl);
          runPsql(dbUrl, ["-f", sqlFilePath]);

          return null;
        },
        "stripe:createAndAffiliateCustomer": async ({ dbId, name, email }) => {
          const customer = await stripe.customers.create({
            email,
            name,
          });

          // Update the customer in the databse
          let res;
          try {
            const query = `UPDATE "User" SET "stripeCustomerId" = '${customer.id}' WHERE "id" = '${dbId}'`;
            res = await client.query(query);
            if (res.rowCount !== 1) {
              throw new Error(
                `Expected to update 1 row, but updated ${res.rowCount} rows`
              );
            }
          } catch (e) {
            console.error(e);
          }

          return {
            customerId: customer.id,
            updatedRows: res.rowCount,
          };
        },
        "stripe:assertStripeCustomerValue": async ({ dbId }) => {
          const customerId = await client.query(
            `SELECT "stripeCustomerId" FROM "User" WHERE "id" = '${dbId}'`
          );
          if (customerId.rowCount !== 1) {
            throw new Error(
              `Expected to find 1 row, but found ${customerId.rowCount} rows`
            );
          }
          if (!customerId.rows[0].stripeCustomerId) {
            throw new Error(`No stripe customer id found for ${dbId}`);
          }
          const pis = await stripe.paymentIntents.list({
            customer: customerId.rows[0].stripeCustomerId,
            limit: 100,
          });
          const filtered = pis.data.filter((p) => p.status === "succeeded");
          return filtered.reduce((acc, p) => acc + p.amount, 0);
        },
        forceSetJoinCode: async ({ code }) => {
          const course = await client.query(`SELECT * FROM "Course" LIMIT 1`);
          await client.query(
            `UPDATE "Course" SET "studentInviteCode" = 'STU-${code}' WHERE "id" = '${course.rows[0].id}'`
          );
          await client.query(
            `UPDATE "Course" SET "taInviteCode" = 'TA-${code}' WHERE "id" = '${course.rows[0].id}'`
          );
          return null;
        },
        assertEnrollmentFollowUpResolvedAt: async ({ userId }) => {
          // Make sure the enrollment with userId has a billingFollowUpResolvedAt within the last 15 seconds
          const enrollment = await client.query(
            `SELECT * FROM "Enrollment" WHERE "userId" = '${userId}' AND "billingFollowUpResolvedAt" >= NOW() - INTERVAL '60 seconds' LIMIT 1`
          );
          if (enrollment.rowCount !== 1) {
            throw new Error(
              `Expected to find 1 enrollment with userId ${userId} and a billingFollowUpResolvedAt within the last 60 seconds, but found ${enrollment.rowCount}`
            );
          }
          return null;
        },
      });

      return config;
    },
    specPattern: "cypress/e2e/**/*.yaml",
  },
});
