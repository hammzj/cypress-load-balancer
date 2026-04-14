import { LoadBalancingMap, TestFile } from "./load.balancing.map";
import { LoadBalancingAlgorithm, Runners, TestingType } from "./types";
import { debug } from "./helpers";

type TestSets = TestFile[][];

function filterOutEmptyArrays<T>(arr: T[]): T[] {
  return arr.filter((v) => v != null);
}

export class LoadBalancer {
  private mainLoadBalancingMap: LoadBalancingMap;

  constructor(private algorithm: LoadBalancingAlgorithm = "weighted-largest") {
    this.mainLoadBalancingMap = new LoadBalancingMap();
  }

  public performLoadBalancing(runnerCount: number, testingType: TestingType, inputFilePaths: string[]): Runners {
    if (runnerCount < 1) throw Error("Runner count cannot be less than 1");

    debug(`Using algorithm for load balancing: %s`, this.algorithm);
    debug(`Runner count: %d`, runnerCount);
    debug(`Testing Type: %s`, testingType);
    debug("Absolute file paths provided: %o", inputFilePaths);

    this.mainLoadBalancingMap.prepareForLoadBalancing(testingType, inputFilePaths);

    const filteredTestFiles = this.mainLoadBalancingMap.getTestFiles(testingType, inputFilePaths);

    let testSets: TestSets = [];

    debug(
      "Relative files found: %o",
      filteredTestFiles.map((tf) => tf.systemPath)
    );

    switch (this.algorithm) {
      case "weighted-largest":
        testSets = this.balanceByWeightedLargestRunner(runnerCount, filteredTestFiles);
        break;
      case "round-robin":
        testSets = this.balanceByMatchingArrayIndices(runnerCount, filteredTestFiles);
        break;
      case "file-name":
        testSets = this.balanceByFileName(runnerCount, filteredTestFiles);
        break;
      default:
        throw Error("Algorithm not known for " + this.algorithm);
    }

    const runners = this.convertTestSetsToRunners(testSets);
    debug("Runners: %O", runners);
    return runners;
  }

  private convertTestSetsToRunners(testSets: TestSets): Runners {
    return testSets.map((ts) => ts.map((f) => f.systemPath));
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
  private balanceByFileName(runnerCount: number, testFiles: TestFile[]): TestSets {
    const testSets: TestSets = [];
    const systemPaths = testFiles.map((tf) => tf.systemPath);

    debug("filePaths unsorted: %s", systemPaths);
    const sortedTestFiles = testFiles.sort((a, b) =>
      a.systemPath.localeCompare(b.systemPath, undefined, { sensitivity: "base" })
    );
    debug(
      "filePaths sorted ascending: %s",
      sortedTestFiles.map((stf) => stf.systemPath)
    );

    for (let i = runnerCount; i > 0; i--) {
      const spliceCount = Math.ceil(sortedTestFiles.length / i);
      testSets.push(sortedTestFiles.splice(0, spliceCount));
    }
    return testSets;
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
  private balanceByWeightedLargestRunner(runnerCount: number, testFilesToRun: TestFile[]): TestSets {
    const sum = (arr: number[]): number => {
      return arr.filter((n) => !Number.isNaN(n) || n != null).reduce((acc, next) => acc + next, 0);
    };
    const getTotalTime = (testFiles: TestFile[]) => sum(testFiles.map((tf) => tf.getMedian()));
    const addHighestFileToTestSet = (testSet: TestFile[]) => {
      const testFile = sortedTestFiles.shift();
      if (testFile == null) {
        debug("No more files in sortedFilePaths to remove, %o", sortedTestFiles);
        return;
      }
      testSet.push(testFile);
    };

    //TODO: change to priority queue based on median time descending
    //Sort descending order by median runtime
    const sortedTestFiles: TestFile[] = testFilesToRun.toSorted(
      (a: TestFile, b: TestFile) => getTotalTime([b]) - getTotalTime([a])
    );

    if (runnerCount === 1) return [sortedTestFiles];

    const firstNewFileIndex = sortedTestFiles.findIndex((tf) => tf.isNewFile());
    const brandNewFiles = sortedTestFiles.splice(firstNewFileIndex);

    // Initialize each runner empty
    let testSets: TestSets = Array.from({ length: runnerCount }, () => []);

    //Debugging purposes only
    let currentIteration = 0;

    //This could be done more efficiently by using array indices alongside an array of every test sets' total time,
    // instead of resorting each iteration.
    sortTestSets: do {
      debug(`%s Current Iteration: %d`, `weighted-largest`, ++currentIteration);
      if (sortedTestFiles.length === 0) break;

      //Sort runners from smallest to highest runtime
      const areAllTestSetsEqualInRunTime = testSets.every((ts) => getTotalTime(ts) === getTotalTime(testSets[0]));
      if (areAllTestSetsEqualInRunTime) {
        //When all runners are equal in time, pop out the file with the next highest runtime for each runner
        //This will prevent a deadlock state while also keeping files evenly spread amongst runners while still balanced
        testSets.map(addHighestFileToTestSet);
      }

      //Sort runners highest to lowest runtime
      testSets = testSets.sort((a, b) => getTotalTime(a) - getTotalTime(b));

      //Get the highest runner runtime of this iteration to compare against the other smaller runners
      const highestRunTime = getTotalTime(testSets[testSets.length - 1]);

      debug(`%s Sorted runner configurations for the current iteration: %o`, `weighted-largest`, testSets);
      debug("Current highest runtime: %d", highestRunTime);

      for (let i = 0; i <= testSets.length - 2; i++) {
        if (sortedTestFiles.length === 0) break sortTestSets;
        const currentTestSet = testSets[i];
        const currentTestSetRunTime = getTotalTime(currentTestSet);

        if (currentTestSetRunTime >= highestRunTime) continue;
        addHighestFileToTestSet(currentTestSet);
      }
    } while (sortedTestFiles.length > 0);

    if (brandNewFiles.length > 0) {
      debug("Handling for %d new files added", brandNewFiles.length);
      const testSetsForNewFiles = this.balanceByMatchingArrayIndices(runnerCount, brandNewFiles);
      for (let i = 0; i <= testSetsForNewFiles.length - 1; i++) {
        testSets[i] = [...testSets[i], ...testSetsForNewFiles[i]];
      }
    }

    debug(`%s Total iterations: %d`, `weighted-largest`, currentIteration);
    debug(
      `%s Total run time of each runner: %o`,
      `weighted-largest`,
      testSets.map((r, i) => `Runner ${i}: ${getTotalTime(r)}`)
    );
    debug(`%s Completed load balancing algorithm`, `weighted-largest`);

    /*
     * Remove empty values just in case
     * sort runners by highest time
     * then get only the file names.
     * This is to make sure if there is additional filtering that means less files than runners,
     * then the earlier runners will have files and the later runners are empty.
     */
    return testSets
      .map(filterOutEmptyArrays<TestFile>)
      .toSorted((a: TestFile[], b: TestFile[]) => getTotalTime(b) - getTotalTime(a));
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
   * @param testFilesToRun {TestFile[]}
   */
  balanceByMatchingArrayIndices(runnerCount: number, testFilesToRun: TestFile[]): TestSets {
    const testSets: TestSets = Array.from({ length: runnerCount }, () => []);
    testFilesToRun
      //Sort descending by median runtime
      .toSorted((a, b) => b.getMedian() - a.getMedian())
      .map((tf, i) => testSets[i % testSets.length].push(tf));

    debug("%s Completed load balancing algorithm", "round-robin");
    return testSets;
  }
}
