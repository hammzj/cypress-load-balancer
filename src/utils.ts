import path, { relative } from "path";
import fs from "node:fs";
import { FilePath, LoadBalancingMap, TestingType } from "./types";
import { debug } from "./helpers";

class Utils {
  private getPath(...pathNames: string[]) {
    return path.join(process.cwd(), ".cypress_load_balancer", ...pathNames);
  }

  get CLB_DIRECTORY() {
    return this.getPath();
  }

  get MAIN_LOAD_BALANCING_MAP_FILE_PATH() {
    return this.getPath("spec-map.json");
  }

  get MAX_DURATIONS_ALLOWED() {
    return Number(Number(process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED || 10));
  }

  get TESTING_TYPES(): TestingType[] {
    return ["e2e", "component"];
  }

  get EMPTY_FILE_NAME_REGEXP(): RegExp {
    return /clb-empty-\d+-\d+.cy.js/;
  }

  get EMPTY_FILE_NAME(): string {
    return "empty.cy.js";
  }

  /**
   *  File paths must be converted from full paths to relative paths to work across machines!!!
   * @param filePath {FilePath}
   * @returns relativeFilePath {FilePath}
   */
  getRelativeFilePath(filePath: FilePath) {
    return relative(process.cwd(), filePath);
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
    const relativeFp = this.getRelativeFilePath(filePath);
    if (loadBalancingMap[testingType][relativeFp] == null || opts.force === true) {
      loadBalancingMap[testingType][relativeFp] = { stats: { durations: [], average: 0, median: 0 } };
      debug(`Added new entry for file in load balancer object for "%s" type tests: "%s"`, testingType, relativeFp);
    } else {
      debug(`File already exists in load balancer for "%s" type tests: "%s"`, testingType, relativeFp);
    }
  }

  calculateAverageDuration(durations: number[]): number {
    return Math.ceil(durations.reduce((acc, t) => acc + Math.abs(t), 0) / (durations.length || 1));
  }

  calculateMedianDuration(durations: number[]): number {
    const middleIndex = Math.ceil(durations.length / 2) - 1 || 0;
    return durations.sort((a, b) => a - b)[middleIndex];
  }

  saveMapFile(loadBalancingMap: LoadBalancingMap, fileName?: string) {
    const file =
      fileName != null
        ? this.getPath(fileName.replace(/.json/g, ``) + ".json")
        : this.MAIN_LOAD_BALANCING_MAP_FILE_PATH;
    fs.writeFileSync(file, JSON.stringify(loadBalancingMap));
    debug("Saved load balancing map file");
  }

  shrinkToFit(arr: number[]): number[] {
    if (arr.length > this.MAX_DURATIONS_ALLOWED) {
      const length = arr.length - this.MAX_DURATIONS_ALLOWED;
      debug("Must shrink durations array to new length of %d", length);
      arr.splice(0, length);
    }
    return arr;
  }

  initializeLoadBalancingFiles(
    opts: {
      forceCreateMainDirectory?: boolean;
      forceCreateMainLoadBalancingMap?: boolean;
    } = {}
  ): [boolean, boolean] {
    let [isDirectoryCreated, isFileCreated] = [false, false];
    const dir = this.CLB_DIRECTORY;
    if (!fs.existsSync(dir) || opts.forceCreateMainDirectory === true) {
      fs.mkdirSync(dir);
      debug("Created directory for `/.cypress_load_balancer", `Force initialization?`, opts.forceCreateMainDirectory);
      isDirectoryCreated = true;
    }

    //This is for the MAIN map! Not the current runner map!
    if (!fs.existsSync(this.MAIN_LOAD_BALANCING_MAP_FILE_PATH) || opts.forceCreateMainLoadBalancingMap === true) {
      this.saveMapFile({ e2e: {}, component: {} });
      debug("Load balancing map file initialized", `Forced initialization?`, opts.forceCreateMainLoadBalancingMap);
      isFileCreated = true;
    }
    return [isDirectoryCreated, isFileCreated];
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
   * @param filePath {string}
   * @param [duration=] {number} Only adds new duration if provided
   */
  updateFileStats(loadBalancingMap: LoadBalancingMap, testingType: TestingType, filePath: FilePath, duration?: number) {
    //File paths must be converted from full paths to relative paths to work across machines!!!
    const relativeFp = this.getRelativeFilePath(filePath);
    if (duration != null) loadBalancingMap[testingType][relativeFp].stats.durations.push(duration);
    this.shrinkToFit(loadBalancingMap[testingType][relativeFp].stats.durations);

    loadBalancingMap[testingType][relativeFp].stats.average = this.calculateAverageDuration(
      loadBalancingMap[testingType][relativeFp].stats.durations
    );

    loadBalancingMap[testingType][relativeFp].stats.median = this.calculateMedianDuration(
      loadBalancingMap[testingType][relativeFp].stats.durations
    );

    debug("MAXIMUM_DURATIONS_ALLOWED: %d", this.MAX_DURATIONS_ALLOWED);

    debug(
      `%s test file stats updated for "%s": %O`,
      testingType,
      relativeFp,
      loadBalancingMap[testingType][relativeFp].stats
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
