import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    video: false,
    retries: 1,
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
