import fs from "node:fs";
import path from "path";
import { debug, warn } from "./helpers";
import { FilePath, FileStats, LoadBalancingMapJSONFile, TestingType } from "./types";
import utils from "./utils";

function getRelativePath(filePath: string) {
  return path.relative(process.cwd(), filePath);
}

export class TestFile {
  public relativePath: string;
  private average: number;
  private median: number;
  protected durations: number[];

  constructor(filePath: string, durations: number[] = []) {
    //TODO: make cross Linux/MacOS to Windows compatible
    //convert windows to linux paths
    this.relativePath = getRelativePath(filePath);
    this.durations = [];
    this.average = 0;
    this.median = 0;
    this.addDurations(...durations);
    this.calculateStatistics();
  }

  public addDurations(...durations: number[]) {
    this.durations.push(...durations);
    this.calculateStatistics();
  }

  public getStatistics(): FileStats {
    return { stats: { durations: this.durations, average: this.average, median: this.median } };
  }

  //@ts-expect-error Ignore -- might use later
  private resetDurations() {
    this.durations = [];
  }

  private calculateAverage() {
    const total = this.durations.length || 1;
    this.average = Math.ceil(this.durations.reduce((acc, t) => acc + Math.abs(t), 0) / total);
  }

  private calculateMedian() {
    const middleIndex = Math.ceil(this.durations.length / 2) - 1;
    this.median = this.durations.toSorted((a, b) => a - b)[middleIndex || 0];
  }

  private shrinkDurationsToMaximumSize(): void {
    const max = LoadBalancingMap.MAX_DURATIONS_ALLOWED;

    debug("MAXIMUM_DURATIONS_ALLOWED: %d", max);

    if (this.durations.length > max) {
      const length = this.durations.length - max;

      debug("Must shrink durations array to new length of %d", length);

      this.durations.splice(0, length);
    }
  }

  private calculateStatistics() {
    //Ensure loaded durations are pre-shrunk before calculating
    this.shrinkDurationsToMaximumSize();
    this.calculateAverage();
    this.calculateMedian();
  }
}

export class LoadBalancingMap {
  //Path to INDIVIDUAL map file: either a parallelized map, or the main map file itself
  public path: string;
  public map: Map<TestingType, Map<string, TestFile>>;

  constructor(specMapFileName?: string) {
    //To get this to stop complaining
    this.path = this.MAIN_MAP_PATH;
    if (specMapFileName) this.customFileName = specMapFileName;

    this.map = new Map();
    for (const testingType of LoadBalancingMap.TESTING_TYPES) this.map.set(testingType, new Map());

    this.loadJSON();
  }

  public prepareForLoadBalancing(testingType: TestingType, filePaths: string[] = []) {
    if (filePaths.length > 0) {
      filePaths.map((fp) => this.addTestFileEntry(testingType, fp));

      //TODO: do we need to do this, or can it wait until the process ends? I assume it is better to save on first step
      //If there are new files to be run, save them to the map file
      this.saveMapFile();
    }
  }

  public static get MAX_DURATIONS_ALLOWED() {
    return Number(Number(process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED || 10));
  }

  //TODO: I am not sure if I want to keep this as it is
  public initializeMainSpecMapFile(
    opts: {
      forceCreateMainDirectory?: boolean;
      forceCreateMainLoadBalancingMap?: boolean;
    } = {}
  ): [boolean, boolean] {
    let [isDirectoryCreated, isFileCreated] = [false, false];
    const dir = LoadBalancingMap.BASE_DIRECTORY;
    if (opts.forceCreateMainDirectory === true || !fs.existsSync(dir)) {
      fs.mkdirSync(dir);
      isDirectoryCreated = true;

      debug("Created directory for `/.cypress_load_balancer", `Force initialization?`, opts.forceCreateMainDirectory);
    }

    if (opts.forceCreateMainLoadBalancingMap === true || !fs.existsSync(this.MAIN_MAP_PATH)) {
      this.saveMapFile(this.MAIN_MAP_PATH);
      debug("Load balancing map file initialized", `Forced initialization?`, opts.forceCreateMainLoadBalancingMap);
      isFileCreated = true;
    }
    debug([isDirectoryCreated, isFileCreated]);

    return [isDirectoryCreated, isFileCreated];
  }

  public getTestFiles(testingType: TestingType, filePaths: string[]): TestFile[] {
    return filePaths.map((fp) => this.getTestFileEntry(testingType, fp)).filter((fp) => fp != null);
  }

  private loadJSON(): boolean {
    const jsonFile = JSON.parse(fs.readFileSync(this.path).toString());
    if (!jsonFile) {
      debug("JSON file not found at path %s", this.path);
      return false;
    }

    //TODO: add this.validateJSONFile(jsonFile)
    // if (!this.validateJSONFile(jsonFile)) {
    //   warn("JSON file is invalid at path: ", this.path);
    //   return false;
    // }

    for (const testingType of LoadBalancingMap.TESTING_TYPES) {
      for (const [fileName, value] of Object.entries(jsonFile[testingType])) {
        this.addTestFileEntry(testingType, fileName);
        this.updateTestFileEntry(testingType, fileName, (value as FileStats).stats?.durations ?? []);
      }
    }

    return true;
  }

  public addTestFileEntry(testingType: TestingType, filePath: string, opts: { force?: boolean } = {}) {
    const testFile = new TestFile(filePath);
    const relativePath = testFile.relativePath;
    const filesPerTestingType = this.map.get(testingType) as Map<string, TestFile>;

    //Create if not found, or if forced
    if (!filesPerTestingType.has(relativePath) || opts.force === true) {
      this.setTestFileEntry(testingType, testFile);

      debug(`Added new entry for file in load balancer object for "%s" type tests: "%s"`, testingType, relativePath);
      debug("Forced creation? %s", opts.force);
    } else {
      debug(`File already exists in load balancer for "%s" type tests: "%s"`, testingType, relativePath);
    }
  }

  public updateTestFileEntry(testingType: TestingType, filePath: string, durations: number[] = []): boolean {
    //Gracefully skip if no durations are provided
    if (durations.length === 0) return false;

    const testFile = this.getTestFileEntry(testingType, filePath);

    if (!testFile) {
      warn(`[%s]: Relative file path does not exist for %s`, testingType, getRelativePath(filePath));
      return false;
    }

    testFile.addDurations(...durations);
    this.setTestFileEntry(testingType, testFile);

    debug(`[%s] file "%s" stats updated to: %O`, testingType, testFile.relativePath, testFile.getStatistics());

    return true;
  }

  static get TESTING_TYPES(): TestingType[] {
    return ["e2e", "component"];
  }

  static get EMPTY_FILE_NAME_REGEXP(): RegExp {
    return /clb-empty-\d+-\d+.cy.js/;
  }

  static get EMPTY_FILE_NAME(): string {
    return "empty.cy.js";
  }

  private static get BASE_DIRECTORY() {
    return LoadBalancingMap.getPath();
  }

  private static getPath(...pathNames: string[]): string {
    return path.join(process.cwd(), ".cypress_load_balancer", ...pathNames);
  }

  private set customFileName(fileName: string) {
    const formatted = fileName.replace(/.json/g, ``) + ".json";
    this.path = LoadBalancingMap.getPath(formatted);
  }

  private getMapAsJSON(): LoadBalancingMapJSONFile {
    return this.map.keys().reduce((jsonMap, testingType) => {
      jsonMap[testingType] = this.map
        .get(testingType)!
        .entries()
        .reduce(
          (acc, [relativePath, testFile]) => {
            acc[relativePath] = testFile.getStatistics();
            return acc;
          },
          {} as Record<string, FileStats>
        );
      return jsonMap;
    }, {} as LoadBalancingMapJSONFile);
  }

  private setTestFileEntry(testingType: TestingType, testFile: TestFile) {
    const filesPerTestingType = this.map.get(testingType) as Map<string, TestFile>;
    filesPerTestingType.set(testFile.relativePath, testFile);
    this.map.set(testingType, filesPerTestingType);
  }

  private getTestFileEntry(testingType: TestingType, filePath: string): TestFile | undefined {
    const relativePath = getRelativePath(filePath);
    return this.map.get(testingType)!.get(relativePath);
  }

  /**
   * Warning: The map file can only be saved under the top-level directory named `".cypress_load_balancer"`
   * @param outputFileName {string} Pass this in to save the file under a different name
   */
  public saveMapFile(outputFileName?: string) {
    const fileName = LoadBalancingMap.getPath(outputFileName || this.path);

    //TODO: this would be much better with a stream
    fs.writeFileSync(fileName, JSON.stringify(this.getMapAsJSON()));
    debug("Saved load balancing map file");
  }

  //Map to MAIN container map, to which parallelized files are merged
  private get MAIN_MAP_PATH() {
    return LoadBalancingMap.getPath("spec-map.json");
  }

  private validateJSONFile(jsonFile: never | LoadBalancingMapJSONFile): boolean {
    //Check for top level keys first
    if (Object.keys(jsonFile).length === 0) return false;
    const hasCorrectTestingTypes = Object.keys(jsonFile).every((testingTypeKey) =>
      // @ts-expect-error Ignore
      LoadBalancingMap.TESTING_TYPES.includes(testingTypeKey)
    );

    if (!hasCorrectTestingTypes) return false;
    for (const [fileName, value] of Object.entries(Object.values(jsonFile))) {
      if (typeof fileName !== "string") return false;
      const hasAllStatsKeys = ["duration", "average", "median"].every((k) => Object.keys(value?.stats).includes(k));
      const hasDurationsAsArray = Array.isArray(value.stats?.durations);
      if (!hasAllStatsKeys || !hasDurationsAsArray) return false;
    }
    return true;
  }
}
