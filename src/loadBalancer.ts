import fs from "node:fs";
import utils from "./utils";
import { Algorithms, FileEntry, FilePath, LoadBalancingMap, Runners, TestingType } from "./types";
import { debug } from "./helpers";

const sum = (arr: number[]) => arr.filter((n) => !Number.isNaN(n) || n != null).reduce((acc, next) => acc + next, 0);
const filterOutEmpties = (arr: unknown[]) => arr.filter((v) => v != null);

//TODO: use stream instead. This is HIGHLY inefficient
const readInLoadBalancingMap = (): LoadBalancingMap => {
  return JSON.parse(fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString());
};

function prepareFiles(loadBalancingMap: LoadBalancingMap, testingType: TestingType, filePaths: Array<FilePath> = []) {
  if (filePaths.length > 0) {
    filePaths.map((fp) => utils.createNewEntry(loadBalancingMap, testingType, utils.getRelativeFilePath(fp)));
    utils.saveMapFile(loadBalancingMap);
  }
}

function filterLoadBalancingMap(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  relativeFilePaths: FilePath[]
): FileEntry {
  return Object.keys(loadBalancingMap[testingType])
    .filter((key) => relativeFilePaths.includes(key))
    .reduce((obj: FileEntry, rfp) => {
      obj[rfp] = loadBalancingMap[testingType][rfp];
      return obj;
    }, {});
}

/**
 * This runs a generic sorting method to get file paths listed alphabetically by file name, and then divided amongst
 * each runner. File names are treated case-insensitively. The load balancing file is not used here.
 * Instead, this algorithm is for setting a consistent experience with the same test files,
 * when automatic balancing is not preferred.
 *
 * @see Thanks to JohannaFalkowska for the StackOverflow answer on how to "splitToNChunks": https://stackoverflow.com/a/51514813.
 * It's late, and I got tired of trying to split arrays.
 * @param runnerCount {number}
 * @param filePaths {FilePath[]}
 * @returns {Runners}
 */
function balanceByFileName(runnerCount: number, filePaths: FilePath[]): Runners {
  debug("filePaths unsorted: %s", filePaths);
  const sortedFiles = filePaths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  debug("filePaths sorted ascending: %s", sortedFiles);

  const runners: Runners = [];
  for (let i = runnerCount; i > 0; i--) {
    const spliceCount = Math.ceil(sortedFiles.length / i);
    runners.push(sortedFiles.splice(0, spliceCount));
  }
  return runners;
}

/**
 * Attempts to get a uniform total run time between all runners by separating the longest-running tests
 * into their own runners first, and attempting to keep all other runners equal to or lower than its time.
 * If there are more tests than runners, then it will continually keep a check of the total run time of
 * the runner with the longest runtime, and compare other runners to stay under or near that limit.
 *
 * Cypress is dependent on waiting for the slowest runner to finish; there is no need to care about the fastest runner in this case.
 * This algorithm involves making the slowest runners as fast as possible, or other runners equal to it
 *
 * Approach:
 * - Initialize an array of X runners.
 * - Sort the filePaths by their stats, from longest to shortest median time.
 * - Record the highest median time as a temporary value of "highestRunnerTime".
 * - This section is repeated:
 * - RoundRobin: Pop out the top "X" times and put it into each runner as its starting value.
 * - Balance By Highest RunTime: Take the next runner that has a total time lower than the "highestRunnerTime" and fill it with the smallest
 * time values until it is greater than the "highestRunnerTime".
 * - Re-record the highest time: Set the new "highestRunnerTime" if that runner has a larger time.
 * - Move on to the next runner.
 * - If there are more files left, then repeat against all runners, until there are no more times left to place into the runners.
 *
 *
 * **Use cases**: This should be the default approach, since most test executions
 * will need to wait for the longest test to complete in order to continue post-execution operations.
 * If all parallelized jobs are within the same time frame as the single longest test, then it should
 * still make the Cypress execution faster than the other algorithms.
 * **Tradeoffs**: Runner times are more uniform, but there could be a larger set of slow runners overall. Could be a slow O-time and memory heavy; has not been calculated.
 *
 * @param runnerCount {number}
 * @param fileEntries {FileEntry} file paths from load balancer map based on the relative file paths supplied
 */
function balanceByWeightedLargestRunner(runnerCount: number, fileEntries: FileEntry): Runners {
  const relativeFilePaths = Object.keys(fileEntries);
  if (runnerCount === 1) return [relativeFilePaths];

  const getTotalTime = (fps: FilePath[]) => sum(fps.map((f) => fileEntries[f].stats.median));
  const sortByLargestMedianTime = (fps: FilePath[]) =>
    fps.sort((a, b) => getTotalTime([a]) - getTotalTime([b])).reverse();

  //TODO: move to top
  //Sort files from highest to lowest "expected run time" (median runtime)
  const sortedFilePaths = [...sortByLargestMedianTime(relativeFilePaths)];
  const addHighestFileToRunner = (runner: FilePath[]) => {
    const file = sortedFilePaths.shift();
    if (file == null) {
      debug("No more files in sortedFilePaths to remove, %o", sortedFilePaths);
      return;
    }
    runner.push(file as string);
  };

  //Initialize each runner empty
  let runners: Runners = Array.from({ length: runnerCount }, () => []) as Runners;

  //Debugging purposes only
  let currentIteration = 0;

  //This could be done more efficiently by using array indices alongside an array of every runners' total time,
  // instead of resorting each iteration.
  sortRunners: do {
    debug(`%s Current Iteration: %d`, `weighted-largest`, ++currentIteration);
    if (sortedFilePaths.length === 0) break;

    //Sort runners from smallest to highest runtime
    const areAllRunnersEqualInRunTime = runners.every((r) => getTotalTime(r) === getTotalTime(runners[0]));
    if (areAllRunnersEqualInRunTime) {
      //When all runners are equal in time, pop out the file with the next highest runtime for each runner
      //This will prevent a deadlock state while also keeping files evenly spread amongst runners while still balanced
      runners.map(addHighestFileToRunner);
    }

    //Sort runners highest to lowest runtime
    runners = runners.sort((a, b) => getTotalTime(a) - getTotalTime(b));

    //Get the highest runner runtime of this iteration to compare against the other smaller runners
    const highestRunTime = getTotalTime(runners[runners.length - 1]);

    debug(`%s Sorted runner configurations for the current iteration: %o`, `weighted-largest`, runners);
    debug("Current highest runtime: %d", highestRunTime);

    for (let i = 0; i <= runners.length - 2; i++) {
      if (sortedFilePaths.length === 0) break sortRunners;
      const currentRunner = runners[i];
      const currentRunnerRunTime = getTotalTime(currentRunner);

      if (currentRunnerRunTime >= highestRunTime) continue;
      addHighestFileToRunner(currentRunner);
    }
  } while (sortedFilePaths.length > 0);

  debug(`%s Total iterations: %d`, `weighted-largest`, currentIteration);
  debug(
    `%s Total run time of each runner: %o`,
    `weighted-largest`,
    runners.map((r, i) => `Runner ${i}: ${getTotalTime(r)}`)
  );
  debug(`%s Completed load balancing algorithm`, `weighted-largest`);

  /*
  Remove empty values just in case
  Then, sort runners by highest time
   This is to make sure if there is additional filtering that means less files than runners,
   then the earlier runners will have files and the later runners are empty.
   */
  return runners
    .map((r) => filterOutEmpties(r))
    .sort((a, b) => getTotalTime(b as FilePath[]) - getTotalTime(a as FilePath[])) as Runners;
}

//TODO: this is not very efficient but can be improved.
/**
 * Basic "round-robin" approach:
 * - Create X buckets based on the `runnerCount`.
 * - Sort the filePaths by their stats, from longest to shortest median time.
 * - Iterate over each filePath by its index, and place it in the i-indexed runner,
 * after performing a modulo operation.
 * - Continue iterating over each file until all have been placed in a bucket.
 *
 * **Use cases**: Getting a uniform amount of files per runner
 *
 * **Tradeoffs**: There will be outliers between the longest running job and the slowest.
 *
 * @param runnerCount {number}
 * @param fileEntries
 */
const balanceByMatchingArrayIndices = (runnerCount: number, fileEntries: FileEntry): FilePath[][] => {
  const fillByMatchingIndex = (runners: FilePath[][], filePath: FilePath, filePathIndex: number) => {
    const i = filePathIndex % runners.length;
    runners[i].push(filePath);
  };

  const relativeFilePaths = Object.keys(fileEntries);

  const runners: Runners = Array.from({ length: runnerCount }, () => []);
  relativeFilePaths
    .sort((a, b) => fileEntries[a].stats.median - fileEntries[b].stats.median)
    .reverse() //Sort highest to lowest by median
    .map((filePath, filePathIndex) => fillByMatchingIndex(runners, filePath, filePathIndex));

  debug("%s Completed load balancing algorithm", "round-robin");
  return runners;
};

export default function performLoadBalancing(
  runnerCount: number,
  testingType: TestingType,
  filePaths: FilePath[],
  algorithm: Algorithms = "weighted-largest",
  // @ts-expect-error Needed for backwards compatibility
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts = {}
): Runners {
  if (runnerCount < 1) throw Error("Runner count cannot be less than 1");
  debug(`Using algorithm for load balancing: %s`, algorithm);
  debug(`Runner count: %d`, runnerCount);

  //File paths must be converted from full paths to relative paths to work across machines!!!
  const relativeFilePaths = filePaths.map(utils.getRelativeFilePath);
  debug(`Relative file paths provided: %o`, relativeFilePaths);

  utils.initializeLoadBalancingFiles();

  const loadBalancingMap = readInLoadBalancingMap();
  prepareFiles(loadBalancingMap, testingType, relativeFilePaths);

  const getRunners = () => {
    const filteredFileEntries = filterLoadBalancingMap(loadBalancingMap, testingType, relativeFilePaths);
    switch (algorithm) {
      case "weighted-largest":
        return balanceByWeightedLargestRunner(runnerCount, filteredFileEntries);
      case "round-robin":
        return balanceByMatchingArrayIndices(runnerCount, filteredFileEntries);
      case "file-name":
        return balanceByFileName(runnerCount, relativeFilePaths);
      default:
        throw Error("Algorithm not known for " + algorithm);
    }
  };

  const runners = getRunners();
  debug("Runners: %O", runners);
  return runners;
}
