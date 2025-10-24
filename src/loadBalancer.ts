import fs from "node:fs";
import utils from "./utils";
import { FilePath, Runners, TestingType, LoadBalancingMap, Algorithms, PerformLoadBalancingOptions } from "./types";
import { debug } from "./helpers";

const sum = (arr: number[]) => arr.filter((n) => !Number.isNaN(n) || n != null).reduce((acc, next) => acc + next, 0);
const filterOutEmpties = (arr: unknown[]) => arr.filter((v) => v != null);

function prepareFiles(loadBalancingMap: LoadBalancingMap, testingType: TestingType, filePaths: Array<FilePath> = []) {
  if (filePaths.length > 0) {
    filePaths.map((fp) => utils.createNewEntry(loadBalancingMap, testingType, fp));
    utils.saveMapFile(loadBalancingMap);
  }
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
 * @param loadBalancingMap {LoadBalancingMap}
 * @param testingType {TestingType}
 * @param runnerCount {number}
 * @param filePaths {FilePath[]}
 */
function balanceByWeightedLargestJob(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  runnerCount: number,
  filePaths: FilePath[]
): Runners {
  if (runnerCount === 1) return [filePaths];

  const getFile = (fp: FilePath) => loadBalancingMap[testingType][fp];
  const getTotalTime = (fps: FilePath[]) => sum(fps.map((f) => getFile(f).stats.median));
  const sortByLargestMedianTime = (fps: FilePath[]) =>
    fps.sort((a, b) => getTotalTime([a]) - getTotalTime([b])).reverse();

  const getLargestMedianTime = (runners: Runners): number =>
    runners.map((r) => getTotalTime(r)).sort((a, b) => b - a)[0];

  //Sort highest to lowest by median, then by file name
  const sortedFilePaths = [...sortByLargestMedianTime(filePaths)];
  const popHighestFile = () => sortedFilePaths.shift();
  const popLowestFile = () => sortedFilePaths.pop();

  //Initialize each runner
  let runners: Runners = Array.from({ length: runnerCount }, () => filterOutEmpties([popHighestFile()])) as Runners;
  let highestRunTime = getLargestMedianTime(runners);

  //DEBUGGING PURPOSES ONLY
  let currentIteration = 0;

  //This could be done more efficiently by using array indices alongside an array of every runners' total time,
  // instead of resorting each iteration.
  sortRunners: do {
    debug(`%s Current Iteration: %d`, `weighted-largest`, ++currentIteration);

    if (sortedFilePaths.length === 0) break;
    runners = runners.sort((a, b) => getTotalTime(a) - getTotalTime(b));

    debug(`%s Sorted runner configurations for the current iteration: %o`, `weighted-largest`, runners);

    //Prevents infinite looping when all runners are of equal size
    if (runners.every((r) => getTotalTime(r) === getTotalTime(runners[0]))) {
      runners[runners.length - 1].push(popLowestFile() as string);
    }

    //Get the highest runtime to compare for later
    highestRunTime = getTotalTime(runners[runners.length - 1]);

    for (let i = 0; i <= runners.length - 2; i++) {
      if (sortedFilePaths.length === 0) break sortRunners;
      const currentRunner = runners[i];
      const currentRunnerRunTime = getTotalTime(currentRunner);

      if (currentRunnerRunTime >= highestRunTime) continue;
      currentRunner.push(popHighestFile() as string);
    }
  } while (sortedFilePaths.length > 0);

  debug(`%s Total iterations: %d`, `weighted-largest`, currentIteration);
  debug(
    `%s Total run time of each runner: %o`,
    `weighted-largest`,
    runners.map((r, i) => `Runner ${i}: ${getTotalTime(r)}`)
  );
  debug(`%s Completed load balancing algorithm`, `weighted-largest`);

  //Remove empty values just in case
  return runners.map((r) => filterOutEmpties(r)) as Runners;
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
 * @param loadBalancingMap {LoadBalancingMap}
 * @param testingType {TestingType}
 * @param runnerCount {number}
 * @param filePaths {FilePath[]}
 */
const balanceByMatchingArrayIndices = (
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  runnerCount: number,
  filePaths: FilePath[]
): FilePath[][] => {
  const fillByMatchingIndex = (runners: FilePath[][], filePath: FilePath, filePathIndex: number) => {
    const i = filePathIndex % runners.length;
    runners[i].push(filePath);
  };

  const runners: Runners = Array.from({ length: runnerCount }, () => []);
  filePaths
    .sort((a, b) => loadBalancingMap[testingType][a].stats.median - loadBalancingMap[testingType][b].stats.median)
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
  opts: PerformLoadBalancingOptions = { removeEmptyRunners: true }
): Runners {
  if (runnerCount < 1) throw Error("Runner count cannot be less than 1");
  debug(`Using algorithm for load balancing: %s`, algorithm);
  debug(`Runner count: %d`, runnerCount);
  debug(`File paths provided: %o`, filePaths);

  utils.initializeLoadBalancingFiles();
  const loadBalancingMap = JSON.parse(fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString());
  prepareFiles(loadBalancingMap, testingType, filePaths);

  const getRunners = () => {
    switch (algorithm) {
      case "weighted-largest":
        return balanceByWeightedLargestJob(loadBalancingMap, testingType, runnerCount, filePaths);
      case "round-robin":
        return balanceByMatchingArrayIndices(loadBalancingMap, testingType, runnerCount, filePaths);
      default:
        throw Error("Algorithm not known for " + algorithm);
    }
  };

  let runners = getRunners();
  if (opts.removeEmptyRunners === true) {
    runners = runners.filter((r) => r.length > 0);
    if (runners.length === 0) {
      debug("No files found and removeEmptyRunners=%s, so there are no runners!", opts.removeEmptyRunners);
      //Return at least 1 empty runner
      runners = [];
    }
  }
  debug("Runners: %O", runners);
  return runners;
}
