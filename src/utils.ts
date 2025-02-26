import path from "path";
import fs from "node:fs";
import { FilePath, LoadBalancingMap, TestingType } from "./types";

class Utils {
  private getPath(...pathNames: string[]) {
    return path.join(process.cwd(), ".cypress_load_balancer", ...pathNames);
  }

  //eslint-disable-next-line @typescript-eslint/no-explicit-any
  DEBUG(...args: any[]) {
    if (process.env.CYPRESS_LOAD_BALANCER_DEBUG == "true") {
      console.debug("cypress-load-balancer", ...args);
    }
  }

  get CLB_DIRECTORY() {
    return this.getPath();
  }

  get MAIN_LOAD_BALANCING_MAP_FILE_PATH() {
    return this.getPath("main.json");
  }

  get MAX_DURATIONS_ALLOWED() {
    return Number(Number(process.env.CYPRESS_LOAD_BALANCING_MAX_DURATIONS_ALLOWED || 10));
  }

  get TESTING_TYPES(): TestingType[] {
    return ["e2e", "component"];
  }

  /**
   * Adds a new filepath entry to the load balancing map
   * @param loadBalancingMap {LoadBalancingMap}
   * @param testingType {TestingType}
   * @param filePath {FilePath}
   * @param [opts={}]
   * @param [opts.force=] {boolean} If true, will re-create the entry even if one already exists
   */
  createNewEntry(
    loadBalancingMap: LoadBalancingMap,
    testingType: TestingType,
    filePath: FilePath,
    opts: {
      force?: boolean;
    } = {}
  ) {
    if (loadBalancingMap[testingType][filePath] == null || opts.force === true) {
      loadBalancingMap[testingType][filePath] = { stats: { durations: [], average: 0 } };
      this.DEBUG(`Added new entry for file in load balancer object for "${testingType}" type tests:`, filePath);
    } else {
      this.DEBUG(`File already exists in load balancer for "${testingType}" type tests:`, filePath);
    }
  }

  calculateAverageDuration(durations: number[]): number {
    return Math.ceil(durations.reduce((acc, t) => acc + Math.abs(t), 0) / (durations.length || 1));
  }

  saveMapFile(loadBalancingMap: LoadBalancingMap, fileName?: string) {
    const file =
      fileName != null
        ? this.getPath(fileName.replace(/.json/g, ``) + ".json")
        : this.MAIN_LOAD_BALANCING_MAP_FILE_PATH;
    fs.writeFileSync(file, JSON.stringify(loadBalancingMap));
    this.DEBUG("Saved load balancing map file");
  }

  shrinkToFit(arr: number[]): number[] {
    if (arr.length > this.MAX_DURATIONS_ALLOWED) {
      arr.splice(0, arr.length - this.MAX_DURATIONS_ALLOWED);
    }
    return arr;
  }

  initializeLoadBalancingFiles(
    opts: {
      forceCreateMainDirectory?: boolean;
      forceCreateMainLoadBalancingMap?: boolean;
    } = {}
  ) {
    const dir = this.CLB_DIRECTORY;
    if (!fs.existsSync(dir) || opts.forceCreateMainDirectory === true) {
      fs.mkdirSync(dir);
      this.DEBUG(
        "Created directory for `/.cypress_load_balancer",
        `Force initialization?`,
        opts.forceCreateMainDirectory
      );
    }

    if (!fs.existsSync(this.MAIN_LOAD_BALANCING_MAP_FILE_PATH) || opts.forceCreateMainLoadBalancingMap === true) {
      this.saveMapFile({ e2e: {}, component: {} });
      this.DEBUG(
        "Cypress load balancing file initialized",
        `Force initialization?`,
        opts.forceCreateMainLoadBalancingMap
      );
    }
  }

  /**
   * Updates file status:
   * Optional:
   * adds a new duration;
   * Always:
   *  Removes oldest durations if maximum length has been reached;
   *  Calculates the average duration.
   * @param loadBalancingMap {LoadBalancingMap}
   * @param testingType {TestingType}
   * @param fileName {string}
   * @param [duration=] {number} Only adds new duration if provided
   */
  updateFileStats(loadBalancingMap: LoadBalancingMap, testingType: TestingType, fileName: string, duration?: number) {
    if (duration != null) loadBalancingMap[testingType][fileName].stats.durations.push(duration);
    this.shrinkToFit(loadBalancingMap[testingType][fileName].stats.durations);
    loadBalancingMap[testingType][fileName].stats.average = this.calculateAverageDuration(
      loadBalancingMap[testingType][fileName].stats.durations
    );
  }

  // isValidLoadBalancerMap(obj: any): boolean {
  //   // let isValid = true;
  //    if (typeof obj !== "object") return false;
  //
  //   //Validate top-level keys are only TESTING_TYPES
  //   if ((Object.keys(obj).length !== this.TESTING_TYPES.length)) {
  //     return false;
  //   }
  //   for (const type of this.TESTING_TYPES) {
  //     if (!Object.keys(obj).includes(type)) return false;
  //     //Validate file contents
  //     for (const [fileName, v] of Object.entries(obj[type])) {
  //       if (typeof fileName !== "string") return false;
  //       const fileNameKeys = Object.keys(v);
  //       //Check interior keys
  //       if (fileNameKeys.length !== 1) return false;
  //       if (!Object.keys(v).includes("stats")) {
  //         return false;
  //       }
  //     }
  //   }
  //   return true;
  // }
}

export default new Utils();
