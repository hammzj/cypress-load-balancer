import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./src";

export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on)
    },
  },
});
