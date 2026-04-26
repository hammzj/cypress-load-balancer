import { LoadBalancingMap, TestFile } from "./load.balancing.map";
import { LoadBalancingAlgorithm, Runners, TestingType } from "./types";
import { debug } from "./helpers";

type TestSets = TestFile[][];

export class LoadBalancer {
  private loadBalancingMap: LoadBalancingMap;

  constructor(private algorithm: LoadBalancingAlgorithm = "weighted-largest") {
    this.loadBalancingMap = new LoadBalancingMap();
  }

  public performLoadBalancing(runnerCount: number, testingType: TestingType, inputFilePaths: string[]): Runners {
    if (runnerCount < 1) throw Error("Runner count cannot be less than 1");

    debug(`Using algorithm for load balancing: %s`, this.algorithm);
    debug(`Runner count: %d`, runnerCount);
    debug(`Testing Type: %s`, testingType);
    debug("Absolute file paths provided: %o", inputFilePaths);

    this.loadBalancingMap.prepareForLoadBalancing(testingType, inputFilePaths);

    const filteredTestFiles = this.loadBalancingMap.getTestFiles(testingType, inputFilePaths);

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

    const runners = testSets.map((ts) => ts.map((f) => f.systemPath));
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
  private balanceByFileName(runnerCount: number, testFiles: TestFile[]): TestSets {
    const testSets: TestSets = [];
    testFiles.sort((a, b) => a.systemPath.localeCompare(b.systemPath, undefined, { sensitivity: "base" }));
    for (let i = runnerCount; i > 0; i--) {
      const spliceCount = Math.ceil(testFiles.length / i);
      testSets.push(testFiles.splice(0, spliceCount));
    }
    return testSets;
  }

  /**
   * Attempts to get a uniform total run time between all runners by separating the longest-running tests
   * into their own runners first, and attempting to keep all other runners equal to or lower than its time.
   * If there are more tests than runners, then it will continually keep a check of the total run time of
   * the runner with the longest runtime, and compare other runners to stay under or near that limit.
   *
   * Please note that any new files not in the mapfile are balanced using the round robin approach, `LoadBalancer.balanceByMatchingArrayIndices`,
   * and then placed into each existing runner with existing test files, to ensure an even spread of new files amongst balanced runners.
   *
   * Cypress is dependent on waiting for the slowest runner to finish; there is no need to care about the fastest runner in this case.
   * This algorithm involves making the slowest runners as fast as possible, or other runners equal to it
   *
   * Approach:
   * - Initialize X number of tuples, containing a list of files and their aggregate total timings, for each runner.
   * - This section is repeated:
   * - RoundRobin: Pop out the top "X" files and put it into each tuple as its starting value. Add each timing to their aggregates as well.
   * - Record the index of the tuple with the highest time as "hi".
   * - Balance By Highest RunTime: For each tuples starting with the smallest, check if its timing is smaller than the largest, and if so, add a file to its array of test files.
   * - Re-record the highest time: Set the new "hi" if the current tuple has a larger time.
   * - Move to next runner.
   * - If there are more files left, then repeat against all tuples, until there are no more left to place into the tuples.
   * - Finally, return only the test file arrays, sorted from largest to smallest, with empties filtered out.
   *
   * **Use cases**: This should be the default approach, since most test executions
   * will need to wait for the longest test to complete in order to continue post-execution operations.
   * If all parallelized jobs are within the same time frame as the single longest test, then it should
   * still make the Cypress execution faster than the other algorithms.
   * **Tradeoffs**: Runner times are more uniform, but there could be a larger set of slow runners overall.
   *
   * @param runnerCount {number}
   * @param testFiles {TestFile[]}
   */
  private balanceByWeightedLargestRunner(runnerCount: number, testFiles: TestFile[]): TestSets {
    const addHighestFileToTestSet = (i: number) => {
      const testFile = sortedTestFiles.shift();
      if (testFile == null) {
        debug("No more files");
        return;
      }
      tuples[i][0].push(testFile);
      tuples[i][1] += testFile.getMedian();
    };

    //Sort descending order by median runtime
    const sortedTestFiles: TestFile[] = testFiles.toSorted((a: TestFile, b: TestFile) => b.getMedian() - a.getMedian());

    if (runnerCount === 1) return [sortedTestFiles];

    //Splice array from files without durations to be handled later
    const indexOfNewFile = sortedTestFiles.findIndex((tf) => tf.isNewFile());
    const brandNewFiles = indexOfNewFile > -1 ? sortedTestFiles.splice(indexOfNewFile) : [];

    //Tuples of test Files and their total aggregated file timings
    const tuples = Array.from<number, [TestFile[], number]>({ length: runnerCount }, () => [[], 0]);
    const getRunners = () => tuples.map(([tfs]) => tfs);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getTimings = () => tuples.map(([_, timing]) => timing);

    //Index of runner with highest timing ("highest index")
    let hi = 0;

    //Debugging purposes only
    let currentIteration = 0;

    do {
      debug(`%s Current Iteration: %d`, `weighted-largest`, ++currentIteration);
      if (sortedTestFiles.length === 0) break;

      //When all runners are equal in time, pop out the file with the next highest runtime for each runner
      //This will prevent a deadlock state while also keeping files evenly spread amongst runners while still balanced

      const allEqualTimings = getTimings().every((t) => t === tuples[0][1]);
      if (allEqualTimings) tuples.map((_, i) => addHighestFileToTestSet(i));

      hi = getTimings().indexOf(Math.max(...getTimings()));

      debug(`%s Sorted runner configurations for the current iteration: %o`, `weighted-largest`, getRunners());
      debug("Current highest runtime: %d", tuples[hi][1]);

      /*
      For each test set besides the largest,
      Put a file into each one, starting from the smallest.
      Repeat until there are no more files, or if rebalancing needs to occur.
       */
      for (let i = tuples.length - 1; i >= 0 && sortedTestFiles.length > 0; i--) {
        if (i !== hi && getTimings()[i] < getTimings()[hi]) {
          addHighestFileToTestSet(i);
          if (getTimings()[i] > getTimings()[hi]) hi = i;
        }
      }
    } while (sortedTestFiles.length > 0);

    if (brandNewFiles.length > 0) {
      debug("Handling for %d new files", brandNewFiles.length);
      this.balanceByMatchingArrayIndices(runnerCount, brandNewFiles).map((tfs, i) => getRunners()[i].push(...tfs));
    }

    debug(`%s Total iterations: %d`, `weighted-largest`, currentIteration);
    debug(
      `%s Total run time of each runner: %o`,
      `weighted-largest`,
      getTimings().map((timing, i) => `Runner ${i}: ${timing}`)
    );
    debug(`%s Completed load balancing algorithm`, `weighted-largest`);

    /*
     * Remove empty values just in case
     * sort runners by highest time
     * then get only the file names.
     * This is to make sure if there is additional filtering that means less files than runners,
     * then the earlier runners will have files and the later runners are empty.
     */
    return tuples
      .filter(([tfs]) => tfs.map((v) => v != null))
      .toSorted((a, b) => b[1] - a[1])
      .map(([tfs]) => tfs);
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
   * @param runnerCount {number}
   * @param testFiles {TestFile[]}
   */
  balanceByMatchingArrayIndices(runnerCount: number, testFiles: TestFile[]): TestSets {
    const testSets: TestSets = Array.from({ length: runnerCount }, () => []);
    testFiles.toSorted((a, b) => b.getMedian() - a.getMedian()).map((tf, i) => testSets[i % testSets.length].push(tf));

    debug("%s Completed load balancing algorithm", "round-robin");
    return testSets;
  }
}
