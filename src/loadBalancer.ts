import fs from "node:fs";
import utils from "./utils";
import { FilePath, Runners, TestingType, LoadBalancingMap, Algorithms } from "./types";

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
 * @param loadBalancingMap
 * @param testingType
 * @param runnerCount
 * @param filePaths
 */
function balanceByWeightedLargestJob(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  runnerCount: number,
  filePaths: FilePath[]
): Runners {
  const getFile = (fp: FilePath) => loadBalancingMap[testingType][fp];
  const getTotalMedianTime = (fps: FilePath[]) => sum(fps.map((f) => getFile(f).stats.median));
  const sortByLargestMedianTime = (fps: FilePath[]) =>
    fps.sort((a, b) => getTotalMedianTime([a]) - getTotalMedianTime([b])).reverse();

  const getLargestMedianTime = (runners: Runners): number =>
    runners.map((r) => getTotalMedianTime(r)).sort((a, b) => b - a)[0];

  //Sort highest to lowest by median, then by file name
  const sortedFilePaths = [...sortByLargestMedianTime(filePaths)];
  const popHighestFile = () => sortedFilePaths.shift();
  const popLowestFile = () => sortedFilePaths.pop();

  //Initialize each runner
  const runners: Runners = Array.from({ length: runnerCount }, () => []);
  let highestTotalRunnerTime: number;
  //DEBUGGING PURPOSES ONLY
  let currentIteration = 0;

  do {
    utils.DEBUG(`Current Iteration: ${++currentIteration};`, "Runners: ", runners);

    //Round-robin: pop out the highest time and put into each runner
    //This is assuming that all runners are nearly equal in total time on each pass
    const temp = Array.from({ length: runners.length }, () => filterOutEmpties([popHighestFile()])) as Runners;

    //eslint-disable-next-line prefer-spread
    runners.map((r) => r.push.apply(r, temp.shift() || []));

    //Get the highest total runner time to compare for later
    highestTotalRunnerTime = getLargestMedianTime(runners);

    for (let i = 0; i <= runners.length - 1; i++) {
      const currentRunner = runners[i];
      let currentRunTime = getTotalMedianTime(currentRunner);

      //TODO: convert to recursive function as do/while is ugly
      //Add the smallest values to the runner until the current runner's total would be higher than the highest run time
      do {
        if (sortedFilePaths.length === 0 || currentRunTime >= highestTotalRunnerTime) break;
        currentRunner.push(popLowestFile() as string);
        currentRunTime = getTotalMedianTime(currentRunner);
      } while (currentRunTime < highestTotalRunnerTime);

      //Recalculate the largest time again for the next runners (just to be safe)
      highestTotalRunnerTime = getLargestMedianTime(runners);
    }
  } while (sortedFilePaths.length > 0);

  utils.DEBUG(
    "Completed balancing for ",
    "weighted-total",
    `\nTotal Iterations: ${currentIteration}`,
    "\nTotal Run Time of each runner:",
    runners.map((r, i) => `Runner ${i}: ${getTotalMedianTime(r)}`)
  );
  return runners.map((r) => filterOutEmpties(r)) as Runners;
}

/**
 *  Approach:
 *  - Get the average time of the total array of inputted times.
 *  - Sort the times highest to lowest in a new array.
 *  - If max runners is provided, set that as the maximum amount of runners allowed to be utilized.
 *  - Next, balance each runner:
 *    -- Get the time in the middle of the sorted array, then remove it from the sorted array.
 *    -- If the total time of the runner is higher than the average, then move on to a new runner.
 *  - If there are no more times, then return the runner.
 *  - If neither, then repeat.
 *  - If there are any more times, spread them out amongst the remainder of the runners.
 *  - Return the runners as a two-dimensional array.
 * @param loadBalancingMap {LoadBalancingMap}
 * @param testingType {TestingType}
 * @param filePaths {FilePath[]}
 * @param [maxRunners=] {number}
 */
function balanceByAverageTime(
  loadBalancingMap: LoadBalancingMap,
  testingType: TestingType,
  filePaths: FilePath[],
  maxRunners?: number
): FilePath[][] {
  const hasMaxRunners = Number.isInteger(maxRunners);
  const getFile = (fp: FilePath) => loadBalancingMap[testingType][fp];

  const sumOfRunner = (runner: FilePath[]) => sum(runner.map((fp) => getFile(fp).stats.median));

  //Sort highest to lowest by median
  const sortedFilePaths = [...filePaths.sort((a, b) => getFile(a).stats.median - getFile(b).stats.median).reverse()];
  const totalMedianTime = sum(sortedFilePaths.map((fp) => getFile(fp).stats.median));
  //Technically this is the average "median" time
  const avgTime = totalMedianTime / sortedFilePaths.length;

  const balanceRunner = (runner: FilePath[] = []) => {
    if (sumOfRunner(runner) >= avgTime || sortedFilePaths.length === 0) {
      return runner;
    } else {
      const middleIndex = Math.ceil((sortedFilePaths.length - 1) / 2);
      const filePath = sortedFilePaths.splice(middleIndex, 1)[0];
      runner.push(filePath);
      return balanceRunner(runner);
    }
  };

  const fillRemainderOfRunners = (runners: FilePath[][]) => {
    if (sortedFilePaths.length === 0) {
      return runners;
    } else {
      const i = sortedFilePaths.length % runners.length;
      const filePath = sortedFilePaths.pop();
      runners[i].push(filePath as FilePath);
      return fillRemainderOfRunners(runners);
    }
  };

  const addRunner = (runners: FilePath[][] = []) => {
    // @ts-expect-error Ignore
    const hasReachedRunnerLimit = runners.length <= maxRunners && hasMaxRunners;
    if (sortedFilePaths.length === 0 || hasReachedRunnerLimit) {
      return runners;
    } else {
      const b = balanceRunner();
      runners.push(b);
      return addRunner(runners);
    }
  };

  const runners = Array.from({ length: maxRunners || 0 }, () => []);

  addRunner(runners);

  //@ts-expect-error Ignore
  if (Number.isInteger(maxRunners) && runners.length <= maxRunners) fillRemainderOfRunners(runners);
  return runners;
}

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
    .sort((a, b) => loadBalancingMap[testingType][a].stats.average - loadBalancingMap[testingType][b].stats.average)
    .reverse() //Sort highest to lowest by average
    .map((filePath, filePathIndex) => fillByMatchingIndex(runners, filePath, filePathIndex));

  return runners;
};

export default function performLoadBalancing(
  runnerCount: number,
  testingType: TestingType,
  filePaths: FilePath[],
  algorithm: Algorithms = "weighted-largest"
): Runners {
  utils.DEBUG(`Using algorithm for load balancing: ${algorithm}`, algorithm);
  utils.initializeLoadBalancingFiles();
  const loadBalancingMap = JSON.parse(fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString());
  prepareFiles(loadBalancingMap, testingType, filePaths);

  switch (algorithm) {
    case "weighted-largest":
      return balanceByWeightedLargestJob(loadBalancingMap, testingType, runnerCount, filePaths);
    case "round-robin":
      return balanceByMatchingArrayIndices(loadBalancingMap, testingType, runnerCount, filePaths);
    case "average-time":
      return balanceByAverageTime(loadBalancingMap, testingType, filePaths, runnerCount);
    default:
      throw Error("Algorithm not known for " + algorithm);
  }
}
