import fs from "node:fs";
import utils from "./utils";
import { LoadBalancingMap, TestingType } from "./types";

const shrinkToFit = (arr: number[]): number[] => {
  if (arr.length > utils.MAX_DURATIONS_ALLOWED) {
    arr.splice(0, arr.length - utils.MAX_DURATIONS_ALLOWED);
  }
  return arr;
};

//TODO: consider making the user specify the TestingType
export default function addCypressLoadBalancerPlugin(on: NodeEventEmitter["on"]) {
  on("after:run", (results) => {
    //Prep load balancing file if not existing and read it
    utils.initializeLoadBalancingFiles();
    const loadBalancingMap = JSON.parse(
      fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()
    ) as LoadBalancingMap;

    for (const run of results.runs) {
      const testingType = results.config.testingType as TestingType;
      const fileName = run.spec.relative;
      utils.createNewEntry(loadBalancingMap, testingType, fileName);

      loadBalancingMap[testingType][fileName].stats.durations.push(run.stats.duration);
      shrinkToFit(loadBalancingMap[testingType][fileName].stats.durations);

      loadBalancingMap[testingType][fileName].stats.average = utils.calculateAverageDuration(
        loadBalancingMap[testingType][fileName].stats.durations
      );
    }

    //Overwrite original load balancing file
    fs.writeFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH, JSON.stringify(loadBalancingMap));
    utils.DEBUG("Updated load balancing map with new file averages");
  });
}
