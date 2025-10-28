import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
//@ts-expect-error Ignore
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild";
import cypressOnFix from "cypress-on-fix";

export default defineConfig({
  e2e: {
    specPattern: "cypress/cucumber/features/**/*.feature",
    video: false,
    retries: 1,
    env: {
      filterSpecs: true,
      stepDefinitions: "cypress/cucumber/stepDefinitions/**/*.ts"
    },
    async setupNodeEvents(origOn, config) {
      const on = cypressOnFix(origOn);

      on(
        "file:preprocessor",
        createBundler({
          plugins: [createEsbuildPlugin(config)]
        })
      );

      await addCucumberPreprocessorPlugin(on, config);
      addCypressLoadBalancerPlugin(on, config, "e2e");
      return config;
    }
  }
});
