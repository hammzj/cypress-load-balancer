import fs from "node:fs";
import merge from "deepmerge";
import utils from "./utils.js";
import { LoadBalancingMap } from "./types";

export function mergeLoadBalancingFiles(orig: LoadBalancingMap, ...extraMaps: LoadBalancingMap[]) {
  const mergedFile = merge.all([orig, ...extraMaps]);
  fs.writeFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH, JSON.stringify(mergedFile));
}
