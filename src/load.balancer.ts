import { LoadBalancingMap, TestFile } from "./load.balancing.map";
import { LoadBalancingAlgorithm, Runners, TestingType } from "./types";
import { debug } from "./helpers";

class LoadBalancer {
  constructor(private algorithm: LoadBalancingAlgorithm = "weighted-largest") {}

  public performLoadBalancing(runnerCount: number, testingType: TestingType, filePaths: string[]) {
    if (runnerCount < 1) throw Error("Runner count cannot be less than 1");

    debug(`Using algorithm for load balancing: %s`, this.algorithm);
    debug(`Runner count: %d`, runnerCount);
    debug(`Testing Type: %s`, testingType);
    debug("Absolute file paths provided: %o", filePaths);

    const getRunners = () => {
      const mainLoadBalancingMap = new LoadBalancingMap();
      mainLoadBalancingMap.prepareForLoadBalancing(testingType, filePaths);

      const filteredTestFiles = mainLoadBalancingMap.getTestFiles(testingType, filePaths);

      debug(
        "Relative files found: %o",
        filteredTestFiles.map((tf) => tf.relativePath)
      );

      switch (this.algorithm) {
        case "weighted-largest":
          return balanceByWeightedLargestRunner(runnerCount, filteredTestFiles);
        case "round-robin":
          return balanceByMatchingArrayIndices(runnerCount, filteredTestFiles);
        case "file-name":
          return this.balanceByFileName(runnerCount, filteredTestFiles);
        default:
          throw Error("Algorithm not known for " + this.algorithm);
      }
    };

    const runners = getRunners();
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
}
