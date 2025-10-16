import fs from "node:fs";
import utils from "./utils";
import { FilePath, Runners, TestingType, LoadBalancingMap } from "./types";

const sum = (arr: number[]) => arr.filter((n) => !Number.isNaN(n) || n != null).reduce((acc, next) => acc + next, 0);

function prepareFiles(loadBalancingMap: LoadBalancingMap, testingType: TestingType, filePaths: Array<FilePath> = []) {
  if (filePaths.length > 0) {
    filePaths.map((fp) => utils.createNewEntry(loadBalancingMap, testingType, fp));
    utils.saveMapFile(loadBalancingMap);
  }
}

/**
 *  - Get the average time of the total array of inputted times.
 *  - Sort the times highest to lowest in a new array.
 *  - If max runners is provided, set that as the maximum amount of runners/runners allowed to be utilized.
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
  algorithm: "total-average" | "modulo" = "total-average"
): Runners {
  utils.initializeLoadBalancingFiles();
  const loadBalancingMap = JSON.parse(fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString());
  prepareFiles(loadBalancingMap, testingType, filePaths);

  if (algorithm === "total-average") {
    return balanceByAverageTime(loadBalancingMap, testingType, filePaths, runnerCount);
  } else if (algorithm === "modulo") {
    return balanceByMatchingArrayIndices(loadBalancingMap, testingType, runnerCount, filePaths);
  } else {
    throw Error("Algorithm not known for " + algorithm);
  }
}
