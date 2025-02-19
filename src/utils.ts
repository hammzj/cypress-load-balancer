import path from "path";
import fs from "node:fs";
import { FilePath, LoadBalancingMap, TestingType } from "./types";

function getPath(...pathNames: string[]) {
  return path.join(process.cwd(), ".cypress_load_balancing", ...pathNames);
}

export const CLB_DIRECTORY = getPath();
export const MAIN_LOAD_BALANCING_MAP_FILE_PATH = getPath("main.json");
export const MAX_DURATIONS_ALLOWED = Number(process.env.CYPRESS_LOAD_BALANCING_MAX_DURATIONS_ALLOWED || 10);

function createMainDirectory() {
  const dir = CLB_DIRECTORY;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    console.debug("Created directory for `/.cypress_load_balancing");
  }
}

function createMainLoadBalancingMap(opts: { force?: boolean } = {}) {
  const fileName = MAIN_LOAD_BALANCING_MAP_FILE_PATH;
  if (!fs.existsSync(fileName) || opts.force == true) {
    fs.writeFileSync(fileName, JSON.stringify({ e2e: {}, component: {} }));
    console.debug("Cypress load balancing file initialized", `Force initialization?`, opts.force);
  }
}

/**
 * Adds a new filepath entry to the load balancing map
 * @param loadBalancingMap {LoadBalancingMap}
 * @param testingType {TestingType}
 * @param filePath {FilePath}
 * @param [opts={}]
 * @param [opts.force=] {boolean} If true, will re-create the entry even if one already exists
 */
export function createNewEntry(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  filePath: FilePath,
  opts: {
    force?: boolean;
  } = {}
) {
  if (loadBalancingMap[testingType][filePath] == null || opts.force === true) {
    loadBalancingMap[testingType][filePath] = { stats: { durations: [], average: 0 } };
    console.debug(`Added new entry for file in load balancer object for "${testingType}" type tests:`, filePath);
  } else {
    console.debug(`File already exists in load balancer for "${testingType}" type tests:`, filePath);
  }
}

export function calculateAverageDuration(durations: number[]): number {
  return Math.ceil(durations.reduce((acc, t) => acc + Math.abs(t), 0) / (durations.length || 1));
}

export function initializeLoadBalancingFiles() {
  createMainDirectory();
  createMainLoadBalancingMap();
}
