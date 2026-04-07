import { LoadBalancingMap, TestFile } from "./load.balancing.map";
import { LoadBalancingAlgorithm, Runners, TestingType } from "./types";
import { debug } from "./helpers";

const sum = (arr: number[]) => arr.filter((n) => !Number.isNaN(n) || n != null).reduce((acc, next) => acc + next, 0);

function filterOutEmptyArrays<T>(arr: T[]): T[] {
  return arr.filter((v) => v != null);
}

export class LoadBalancer {
  private mainLoadBalancingMap: LoadBalancingMap;

  constructor(private algorithm: LoadBalancingAlgorithm = "weighted-largest") {
    this.mainLoadBalancingMap = new LoadBalancingMap();
  }

  public performLoadBalancing(runnerCount: number, testingType: TestingType, filePaths: string[]) {
    if (runnerCount < 1) throw Error("Runner count cannot be less than 1");

    debug(`Using algorithm for load balancing: %s`, this.algorithm);
    debug(`Runner count: %d`, runnerCount);
    debug(`Testing Type: %s`, testingType);
    debug("Absolute file paths provided: %o", filePaths);

    this.mainLoadBalancingMap.prepareForLoadBalancing(testingType, filePaths);
    const filteredTestFiles = this.mainLoadBalancingMap.getTestFiles(testingType, filePaths);
    let runners: string[][] = [];

    debug(
      "Relative files found: %o",
      filteredTestFiles.map((tf) => tf.relativePath)
    );

    switch (this.algorithm) {
      case "weighted-largest":
        runners = this.balanceByWeightedLargestRunner(runnerCount, filteredTestFiles);
        break;
      case "round-robin":
        //runners = this.balanceByMatchingArrayIndices(runnerCount, filteredTestFiles);
        break;
      case "file-name":
        runners = this.balanceByFileName(runnerCount, filteredTestFiles);
        break;
      default:
        throw Error("Algorithm not known for " + this.algorithm);
    }

    debug("Runners: %O", runners);
    return runners;
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
   * @param testFiles {TestFile[]}
   * @returns {Runners}
   */
  private balanceByFileName(runnerCount: number, testFiles: TestFile[]): Runners {
    const runners: Runners = [];
    const relativeFilePaths = testFiles.map((tf) => tf.relativePath);

    debug("filePaths unsorted: %s", relativeFilePaths);
    const sortedFiles = relativeFilePaths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    debug("filePaths sorted ascending: %s", sortedFiles);

    for (let i = runnerCount; i > 0; i--) {
      const spliceCount = Math.ceil(sortedFiles.length / i);
      runners.push(sortedFiles.splice(0, spliceCount));
    }
    return runners;
  }

  /**
   * @TODO: use a priority queue instead of constantly sorting
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
   * @param testFilesToRun {TestFile[]}
   */
  private balanceByWeightedLargestRunner(runnerCount: number, testFilesToRun: TestFile[]): Runners {
    //const relativeFilePaths = Object.keys(fileEntries);
    const getRelativePaths = (testFiles: TestFile[]) => testFiles.map((tf) => tf.relativePath);

    //Sort files from highest to lowest "expected run time" (median runtime)
    const sortedFilePaths = testFilesToRun.toSorted((a, b) => getTotalTime([a]) - getTotalTime([b])).reverse();
    if (runnerCount === 1) return [getRelativePaths(sortedFilePaths)];

    const getTotalTime = (testFiles: TestFile[]) => sum(testFiles.map((tf) => tf.stats.median));

    const addHighestFileToRunner = (runner: TestFile[]) => {
      const testFile = sortedFilePaths.shift();
      if (testFile == null) {
        debug("No more files in sortedFilePaths to remove, %o", sortedFilePaths);
        return;
      }
      runner.push(testFile);
    };

    //Initialize each runner empty
    let runners: TestFile[][] = Array.from({ length: runnerCount }, () => []) as TestFile[][];

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
     * Remove empty values just in case
     * sort runners by highest time
     * then get only the file names.
     * This is to make sure if there is additional filtering that means less files than runners,
     * then the earlier runners will have files and the later runners are empty.
     */
    return runners
      .map(filterOutEmptyArrays<TestFile>)
      .toSorted((a, b) => getTotalTime(b) - getTotalTime(a))
      .map(getRelativePaths);
  }
}
