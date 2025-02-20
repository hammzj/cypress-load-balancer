import { LoadBalancingMap } from "./types";
import fs from "node:fs";
import utils from "./utils";
import merge from "deepmerge";

export function mergeLoadBalancingFiles(orig: LoadBalancingMap, ...extraMaps: LoadBalancingMap[]) {
  const mergedFile = merge.all([orig, ...extraMaps]);
  fs.writeFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH, JSON.stringify(mergedFile));
}
