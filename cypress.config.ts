import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    specPattern: "cypress/e2e/**/*.cy.{js,ts}",
    video: false,
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
