import merge from "deepmerge";
import utils from "./utils.js";
import { LoadBalancingMap } from "./types";
import deepmerge from "deepmerge";

//eslint-disable-next-line @typescript-eslint/no-explicit-any
const combineMerge = (target: any[], source: any[], options?: deepmerge.ArrayMergeOptions): any[] => {
  const destination = target.slice();

  source.forEach((item, index) => {
    if (typeof destination[index] === "undefined") {
      destination[index] = options?.cloneUnlessOtherwiseSpecified(item, options);
    } else if (options?.isMergeableObject(item)) {
      destination[index] = merge(target[index], item, options);
    } else if (target.indexOf(item) === -1) {
      destination.push(item);
    }
  });
  return destination;
};

export default function mergeLoadBalancingMapFiles(
  orig: LoadBalancingMap,
  extraMaps: LoadBalancingMap[]
): LoadBalancingMap {
  const mergedFile = merge.all([orig, ...extraMaps], { arrayMerge: combineMerge }) as LoadBalancingMap;
  //TODO: Optimization
  // It would be more efficient to calculate only files with new values.
  // Need to figure out how to determine which files are "new".
  utils.TESTING_TYPES.map((t) => {
    Object.keys(mergedFile[t]).map((f) => utils.updateFileStats(mergedFile, t, f));
  });
  return mergedFile;
  // utils.saveMapFile(mergedFile as LoadBalancingMap, outputFile);
}
