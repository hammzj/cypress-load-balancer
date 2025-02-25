import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
