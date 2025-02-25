import fs from "node:fs";
import utils from "./utils";
import { LoadBalancingMap, TestingType } from "./types";
import CypressRunResult = CypressCommandLine.CypressRunResult;
import CypressFailedRunResult = CypressCommandLine.CypressFailedRunResult;

export default function addCypressLoadBalancerPlugin(on: Cypress.PluginEvents, testingType?: TestingType) {
  on("after:run", (results: CypressRunResult | CypressFailedRunResult) => {
    if ((results as CypressFailedRunResult).status === "failed") {
      console.error("cypress-load-balancer", "Cypress failed to execute, so load balancing is skipped");
    } else {
      const cypressRunResult = results as CypressRunResult;
      //Prep load balancing file if not existing and read it
      utils.initializeLoadBalancingFiles();
      const loadBalancingMap = JSON.parse(
        fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()
      ) as LoadBalancingMap;

      for (const run of cypressRunResult.runs) {
        // @ts-expect-error THe Cypress config type for PublicConfig is wrong
        testingType = (cypressRunResult.config?.testingType || testingType) as TestingType;
        const fileName = run.spec.relative;
        utils.createNewEntry(loadBalancingMap, testingType, fileName);
        utils.updateFileStats(loadBalancingMap, testingType, fileName, run.stats.duration);
      }
      //Overwrite original load balancing file
      utils.saveMapFile(loadBalancingMap);
      utils.DEBUG("Updated load balancing map with new file averages");
    }
  });
}
