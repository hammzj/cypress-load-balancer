import { defineConfig } from "cypress";
import { addCypressLoadBalancerPlugin } from "./";

export default defineConfig({
  e2e: {
    video: false,
    setupNodeEvents(on) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
