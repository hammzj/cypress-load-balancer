import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    reporter: "dot",
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    video: false,
    retries: 1,
    setupNodeEvents(on, config) {
      addCypressLoadBalancerPlugin(on, config, "e2e");
      return config;
    }
  }
});
