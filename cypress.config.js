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
await client.connect();
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
generateJsonSchema();
// console.log(listRegisteredCommands());

function runPsql(dbUrl, args) {
  const result = spawnSync("psql", [dbUrl, ...args], {
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
    setupNodeEvents(on, config) {
      // implement node event listeners here
      yamlPreprocessor(on);

      on("task", {
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
      });

      return config;
    },
    specPattern: "cypress/e2e/**/*.yaml",
  },
});
