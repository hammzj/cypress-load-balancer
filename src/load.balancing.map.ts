import fs from "node:fs";
import path from "path";
import { debug, warn } from "./helpers";
import { FileStats, LoadBalancingMapJSONFile, TestingType } from "./types";
import deepmerge from "deepmerge";

const MAX_DURATIONS_ALLOWED = () => Number(Number(process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED || 10));

export class TestFile {
  private readonly path: string;
  private average: number;
  private median: number;
  protected durations: number[];

  constructor(filePath: string, durations: number[] = []) {
    this.path = TestFile.convertToInternalPath(filePath);
    this.durations = [];
    this.average = 0;
    this.median = 0;
    this.addDurations(...durations);
  }

  public addDurations(...durations: number[]) {
    if (durations?.length === 0) return;
    this.durations.push(...durations);
    this.calculateStatistics();
  }

  //TODO: should this be private?
  public get stats() {
    return { durations: this.durations, average: this.average, median: this.median };
  }

  public isNewFile(): boolean {
    return this.durations.length === 0;
  }

  public getMedian(): number {
    return this.stats.median;
  }

  public getAverage(): number {
    return this.stats.average;
  }

  /**
   * External path used for Cypress input; system dependent.
   * Paths are stored for TestFile in POSIX format.
   * To ensure stability on Windows devices, the `systemPath` will be changed to reflect how the path appears on Windows systems.
   */
  public get systemPath() {
    return process.platform === "win32" ? this.path.replaceAll(path.posix.sep, path.win32.sep) : this.path;
  }

  public get internalPath() {
    return this.path;
  }

  /**
   * Returns a file path converted to the internal path format used for the TestFile.
   * All internal paths are represented as relative POSIX system paths.
   * @param filePath {string}
   */
  public static convertToInternalPath(filePath: string): string {
    return process.platform === "win32"
      ? path.win32.relative(process.cwd(), filePath).replaceAll(path.win32.sep, path.posix.sep)
      : path.posix.relative(process.cwd(), filePath);
  }

  //@ts-expect-error Ignore -- might use later
  private resetDurations() {
    this.durations = [];
  }

  private calculateAverage() {
    const total = this.durations.length || 1;
    this.average = Math.ceil(this.durations.reduce((acc: number, d: number) => acc + Math.abs(d), 0) / total);
  }

  private calculateMedian() {
    if (this.durations.length === 0) {
      this.median = 0;
    } else {
      const middleIndex = Math.ceil(this.durations.length / 2) - 1;
      this.median = this.durations.toSorted((a: number, b: number) => a - b)[middleIndex || 0];
    }
  }

  private shrinkDurationsToMaximumSize(): void {
    const max = MAX_DURATIONS_ALLOWED();

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
//TODO: this should only reference the main map that exists. It should be allowed to save under a different name, but never change the name of the base map.
export class LoadBalancingMap {
  //TODO: this makes more sense as private readonly
  public path: string;
  private internalMap: Map<TestingType, Map<string, TestFile>>;

  constructor(specMapFileName?: string) {
    //To get this to stop complaining
    this.path = LoadBalancingMap.MAIN_MAP_PATH;
    if (specMapFileName) this.customFileName = specMapFileName;

    this.internalMap = new Map();
    this.resetInternalMap();
    this.importFromOriginalFile();
  }

  public prepareForLoadBalancing(testingType: TestingType, filePaths: string[] = []) {
    if (filePaths.length > 0) {
      //Only attempt to create the spec-map file if there are test files to run
      this.initializeSpecMapFile();
      this.importFromOriginalFile();

      filePaths.map((fp) => this.addTestFileEntry(testingType, fp));

      //TODO: do we need to do this, or can it wait until the process ends? I assume it is better to save on first step
      //If there are new files to be run, save them to the map file
      this.saveMapFile();
    }
  }

  public getTestFiles(testingType: TestingType, filePaths: string[]): TestFile[] {
    return filePaths.map((fp) => this.getTestFileEntry(testingType, fp)).filter((fp) => fp != null);
  }

  private resetInternalMap() {
    LoadBalancingMap.TESTING_TYPES.map((t) => this.internalMap.set(t, new Map()));
  }

  /**
   * Import a JSON object with its test files and entries.
   * @param json
   * @private
   */
  private importJSONObject(json: LoadBalancingMapJSONFile): boolean {
    //TODO: add this.validateJSONFile(jsonFile)
    // if (!this.validateJSONFile(json)) {
    //   warn("JSON file is invalid at path: ", this.path);
    //   return false;
    // }
    for (const testingType of LoadBalancingMap.TESTING_TYPES) {
      //Safety check
      if (json[testingType] != null) {
        for (const [fileName, value] of Object.entries(json[testingType])) {
          this.addTestFileEntry(testingType, fileName);
          this.updateTestFileEntry(testingType, fileName, (value as FileStats).stats?.durations ?? []);
        }
      }
    }
    return true;
  }

  /**
   * Imports from the base JSON map file specified based on its path.
   * @note Please understand that this will overwrite any previous data saved in the map. It should be used for re-initialization from the base file to prevent corruption.
   * To import new data, first save the new data to the file with `this.saveMapFile()`, then attempt to use this method to reload it.
   * @private
   */
  private importFromOriginalFile(): boolean {
    if (!fs.existsSync(this.path)) {
      debug(`JSON file not found at path "%s"; does it need initialized?`, this.path);
      return false;
    }
    const file = fs.readFileSync(this.path).toString();
    const json = JSON.parse(file);

    //Reset if importing from the original file to prevent corruption
    this.resetInternalMap();

    return this.importJSONObject(json);
  }

  public toJSON(): LoadBalancingMapJSONFile {
    return Array.from(this.internalMap.keys()).reduce((jsonMap: LoadBalancingMapJSONFile, testingType: TestingType) => {
      jsonMap[testingType] = Array.from(this.internalMap.get(testingType)!.entries()).reduce(
        (acc: Record<string, FileStats>, [relativePath, testFile]: [string, TestFile]) => {
          acc[relativePath] = { stats: testFile.stats };
          return acc;
        },
        {} as Record<string, FileStats>
      );
      return jsonMap;
    }, {} as LoadBalancingMapJSONFile);
  }

  public addTestFileEntry(testingType: TestingType, filePath: string, opts: { force?: boolean } = {}): boolean {
    const testFile = new TestFile(filePath);
    const internalPath = testFile.internalPath;

    //Create if forced or if not found
    if (opts.force === true || this.getTestFileEntry(testingType, internalPath) == null) {
      this.setTestFileEntry(testingType, testFile);

      debug(`Added new entry for file in load balancer object for "%s" type tests: "%s"`, testingType, internalPath);
      debug("Forced creation? %s", opts.force);
      return true;
    } else {
      debug(`File already exists in load balancer for "%s" type tests: "%s"`, testingType, internalPath);
      return false;
    }
  }

  public updateTestFileEntry(testingType: TestingType, filePath: string, durations: number[] = []): boolean {
    //Gracefully skip if no durations are provided
    if (durations.length === 0) return false;

    const testFile = this.getTestFileEntry(testingType, filePath);

    if (!testFile) {
      warn(`[%s]: Relative file path does not exist for %s`, testingType, filePath);
      return false;
    }

    testFile.addDurations(...durations);
    this.setTestFileEntry(testingType, testFile);

    debug(`[%s] file "%s" stats updated to: %O`, testingType, testFile.internalPath, testFile.stats);

    return true;
  }

  /**
   * Warning: The map file can only be saved under the top-level directory named `".cypress_load_balancer"`
   * @param outputFileName {string} Pass this in to save the file under a different name. Useful for making copies of the file without overwriting the original
   */
  public saveMapFile(outputFileName?: string) {
    const fileName = outputFileName ? LoadBalancingMap.getPath(outputFileName) : this.path;

    //TODO: this would be much better with a stream
    fs.writeFileSync(fileName, JSON.stringify(this.toJSON()));
    debug("Saved load balancing map file");
  }

  //TODO: I am not sure if I want to keep this as it is
  public initializeSpecMapFile(
    opts: {
      forceCreateMainDirectory?: boolean;
      forceCreateFile?: boolean;
    } = {}
  ): [boolean, boolean] {
    let [isDirectoryCreated, isFileCreated] = [false, false];
    const dir = LoadBalancingMap.BASE_DIRECTORY;
    if (opts.forceCreateMainDirectory === true || !fs.existsSync(dir)) {
      fs.mkdirSync(dir);
      isDirectoryCreated = true;

      debug("Created directory for `/.cypress_load_balancer", `Force initialization?`, opts.forceCreateMainDirectory);
    }

    if (opts.forceCreateFile === true || !fs.existsSync(this.path)) {
      this.saveMapFile();
      debug("Load balancing map file initialized", `Forced initialization?`, opts.forceCreateFile);
      isFileCreated = true;
    }

    debug([isDirectoryCreated, isFileCreated]);

    return [isDirectoryCreated, isFileCreated];
  }

  public mergeMaps(otherMaps: LoadBalancingMap[]) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const combineMerge = (target: any[], source: any[], options?: deepmerge.ArrayMergeOptions): any[] => {
      const destination = target.slice();

      source.forEach((item, index) => {
        if (typeof destination[index] === "undefined") {
          destination[index] = options?.cloneUnlessOtherwiseSpecified(item, options);
        } else if (options?.isMergeableObject(item)) {
          destination[index] = deepmerge(target[index], item, options);
        } else if (target.indexOf(item) === -1) {
          destination.push(item);
        }
      });
      return destination;
    };

    const original = this.toJSON();
    const otherJsons = otherMaps.map((lbm) => lbm.toJSON());
    const mergedFile = deepmerge.all([original, ...otherJsons], {
      arrayMerge: combineMerge
    }) as LoadBalancingMapJSONFile;

    this.resetInternalMap();
    //TODO: do we need to reset the internalMap first???????
    this.importJSONObject(mergedFile);
  }

  public static get MAIN_MAP_FILE_NAME() {
    return "spec-map.json";
  }

  //Map to MAIN container map, to which parallelized files are merged
  public static get MAIN_MAP_PATH(): string {
    return LoadBalancingMap.getPath(LoadBalancingMap.MAIN_MAP_FILE_NAME);
  }

  public static get TESTING_TYPES(): TestingType[] {
    return ["e2e", "component"];
  }

  public static get EMPTY_FILE_NAME_REGEXP(): RegExp {
    return /clb-empty-\d+-\d+.cy.js/;
  }

  public static get EMPTY_FILE_NAME(): string {
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
    this.path = formatted;
  }

  private setTestFileEntry(testingType: TestingType, testFile: TestFile) {
    const filesPerTestingType = this.internalMap.get(testingType) as Map<string, TestFile>;
    filesPerTestingType.set(testFile.internalPath, testFile);
    this.internalMap.set(testingType, filesPerTestingType);
  }

  private getTestFileEntry(testingType: TestingType, filePath: string): TestFile | undefined {
    //TODO: is there a better way to DRY this up and not make it dependent on the TestFile class?
    const internalPath = TestFile.convertToInternalPath(filePath);
    return this.internalMap.get(testingType)!.get(internalPath);
  }

  /*
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
  */
}
