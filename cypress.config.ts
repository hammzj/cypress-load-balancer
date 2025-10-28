import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    video: false,
    retries: 1,
    env: {},
    setupNodeEvents(on, config) {
      addCypressLoadBalancerPlugin(on, config, "e2e");
      return config;
    }
  }
});
