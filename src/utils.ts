import path from "path";
import fs from "node:fs";
import { FilePath, LoadBalancingMap, TestingType } from "./types";

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DEBUG(...args: any[]) {
  if (process.env.CYPRESS_LOAD_BALANCER_DEBUG) {
    console.debug("cypress-load-balancer", ...args);
  }
}

function getPath(...pathNames: string[]) {
  return path.join(process.cwd(), ".cypress_load_balancing", ...pathNames);
}

export const CLB_DIRECTORY = getPath();
export const MAIN_LOAD_BALANCING_MAP_FILE_PATH = getPath("main.json");
export const MAX_DURATIONS_ALLOWED = Number(process.env.CYPRESS_LOAD_BALANCING_MAX_DURATIONS_ALLOWED || 10);

/**
 * Adds a new filepath entry to the load balancing map
 * @param loadBalancingMap {LoadBalancingMap}
 * @param testingType {TestingType}
 * @param filePath {FilePath}
 * @param [opts={}]
 * @param [opts.force=] {boolean} If true, will re-create the entry even if one already exists
 */
function createNewEntry(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  filePath: FilePath,
  opts: {
    force?: boolean;
  } = {}
) {
  if (loadBalancingMap[testingType][filePath] == null || opts.force === true) {
    loadBalancingMap[testingType][filePath] = { stats: { durations: [], average: 0 } };
    DEBUG(`Added new entry for file in load balancer object for "${testingType}" type tests:`, filePath);
  } else {
    DEBUG(`File already exists in load balancer for "${testingType}" type tests:`, filePath);
  }
}

function calculateAverageDuration(durations: number[]): number {
  return Math.ceil(durations.reduce((acc, t) => acc + Math.abs(t), 0) / (durations.length || 1));
}

function initializeLoadBalancingFiles(
  opts: {
    forceCreateMainDirectory?: boolean;
    forceCreateMainLoadBalancingMap?: boolean;
  } = {}
) {
  function createMainDirectory(opts: { force?: boolean } = {}) {
    const dir = CLB_DIRECTORY;
    if (!fs.existsSync(dir) || opts.force === true) {
      fs.mkdirSync(dir);
      DEBUG("Created directory for `/.cypress_load_balancing", `Force initialization?`, opts.force);
    }
  }

  function createMainLoadBalancingMap(opts: { force?: boolean } = {}) {
    const fileName = MAIN_LOAD_BALANCING_MAP_FILE_PATH;
    if (!fs.existsSync(fileName) || opts.force === true) {
      fs.writeFileSync(fileName, JSON.stringify({ e2e: {}, component: {} }));
      DEBUG("Cypress load balancing file initialized", `Force initialization?`, opts.force);
    }
  }

  createMainDirectory({ force: opts.forceCreateMainDirectory });
  createMainLoadBalancingMap({ force: opts.forceCreateMainLoadBalancingMap });
}

export { createNewEntry, calculateAverageDuration, initializeLoadBalancingFiles };
