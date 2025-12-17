import { defineConfig } from "cypress";
import { yamlPreprocessor } from "cypress-yaml-plugin";

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
    },
    specPattern: "cypress/e2e/**/*.yaml",
  },
});
