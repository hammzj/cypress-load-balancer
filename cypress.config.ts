import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    specPattern: "e2e/**/*.cy.ts",
    video: false,
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
