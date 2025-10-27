import merge from "deepmerge";
import utils from "./utils.js";
import { LoadBalancingMap } from "./types";
import deepmerge from "deepmerge";
import { debug } from "./helpers";

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

/**
 * Merges load balancing maps back to an original object.
 * This should be executed after parallel jobs finish
 * to collect their results and merge them to the original master file
 * Does not save the original file, so that will need to be done separately.
 * @param orig {LoadBalancingMap}
 * @param extraMaps {LoadBalancingMap[]}
 */
export default function mergeLoadBalancingMapFiles(
  orig: LoadBalancingMap,
  extraMaps: LoadBalancingMap[]
): LoadBalancingMap {
  debug("Beginning map merge process");
  debug("Original load balancing map file: %o", orig);
  debug("Files being merged to original: %O", extraMaps);

  const mergedFile = merge.all([orig, ...extraMaps], { arrayMerge: combineMerge }) as LoadBalancingMap;
  //TODO: Optimization
  // It would be more efficient to calculate only files with new values.
  // Need to figure out how to determine which files are "new".
  utils.TESTING_TYPES.map((t) => {
    Object.keys(mergedFile[t]).map((f) => utils.updateFileStats(mergedFile, t, f));
  });

  debug("Completed merging load balancing map: %O", mergedFile);
  return mergedFile;
}
