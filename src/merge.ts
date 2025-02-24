import merge from "deepmerge";
import utils from "./utils";
import { LoadBalancingMap, TestingType } from "./types";

export function mergeLoadBalancingFiles(orig: LoadBalancingMap, ...extraMaps: LoadBalancingMap[]) {
  const mergedMap = merge.all([orig, ...extraMaps]) as LoadBalancingMap;
  (["e2e", "component"] as TestingType[]).map((type) => {
    Object.keys(mergedMap[type]).map(file => {
      utils.shrinkToFit(mergedMap[type][file].stats.durations);
      mergedMap[type][file].stats.average = utils.calculateAverageDuration(mergedMap[type][file].stats.durations);
    });
  });

  //TODO: need to update all calculations before writing file
  utils.saveMapFile(mergedMap as LoadBalancingMap);
}
