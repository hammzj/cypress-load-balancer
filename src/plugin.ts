import fs from "node:fs";
import utils from "./utils";
// @ts-ignore
import findCypressSpecs, { getSpecs } from "find-cypress-specs";
import { debug } from "./helpers";
import { LoadBalancingMap, TestingType } from "./types";
import { performLoadBalancing } from "./";
import path from "path";
import * as os from "node:os";

//Thanks to Gleb Bahmutov with cypress-split -- this works very well
//@see https://github.com/bahmutov/cypress-split for inspiration
const createEmptyFileForEmptyRunner = (runnerIndex: number, runnerCount: number) => {
  //TODO: don't just copy this code
  // copy the empty spec file from our source folder into temp folder
  const emptyFilename = path.resolve(__dirname, "empty.cy.js");

  const tempFileNameToUse = path.join(os.tmpdir(), `clb-empty-${runnerIndex}-${runnerCount}.cy.js`);
  fs.copyFileSync(emptyFilename, tempFileNameToUse);
  return tempFileNameToUse;
};

const getRunnerVarsFromEnv = (envRunner: string): [number, number] => {
  const [runnerIndex, runnerCount] = envRunner.split("/").map(Number);
  if ([runnerIndex, runnerCount].some((v) => Number.isNaN(v) || v == null)) {
    throw Error(
      "env.runner must be provided in X/Y format, where X is the runner index, and Y is the total runner count to use."
    );
  }
  if (runnerIndex === 0) {
    throw Error("env.runner cannot be 0! Runner indices must begin at 1");
  }
  return [runnerIndex, runnerCount];
};

export default function addCypressLoadBalancerPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  testingType: TestingType
) {
  const { runner, cypressLoadBalancerAlgorithm } = config.env;

  if (runner != null) {
    //TODO: Error handling for shard
    const [runnerIndex, runnerCount] = getRunnerVarsFromEnv(runner);
    if ([runnerIndex, runnerCount].some((v) => Number.isNaN(v) || v == null)) {
      throw Error(
        "env.runner must be provided in X/Y format, where X is the runner index, and Y is the total runner count to use."
      );
    }
    if (runnerIndex === 0) {
      throw Error("env.runner cannot be 0! Runner indices must begin at 1");
    }

    const filePaths = getSpecs(undefined, testingType);
    const runners = performLoadBalancing(
      runnerCount,
      testingType,
      filePaths,
      cypressLoadBalancerAlgorithm || "weighted-largest"
    );
    const currentRunner = runners[runnerIndex];

    const isCurrentRunnerEmpty = currentRunner == null || currentRunner.length === 0;

    config.specPattern = isCurrentRunnerEmpty ? createEmptyFileForEmptyRunner(runnerIndex, runnerCount) : currentRunner;
    debug(`config.specPattern updated to use runner ${runnerIndex} of ${runnerCount}: %s`, currentRunner);
  }

  on("after:run", (results: CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult) => {
    if ((results as CypressCommandLine.CypressFailedRunResult).status === "failed") {
      console.error("cypress-load-balancer", "Cypress failed to execute, so load balancing is skipped");
    } else {
      const { runner } = config.env;
      const cypressRunResult = results as CypressCommandLine.CypressRunResult;

      //Prep load balancing file if not existing and read it
      utils.initializeLoadBalancingFiles();
      const loadBalancingMap = JSON.parse(
        fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()
      ) as LoadBalancingMap;

      for (const run of cypressRunResult.runs) {
        const fileName = run.spec.relative;

        //TODO: skip based on env var
        const isEmptyFile = fileName.match(/clb-empty-\d+-\d+.cy.js/);
        if (isEmptyFile) {
          debug("%s Skipping file updates due to empty file on runner %s: %s", "Plugin", runner, fileName);
          continue;
        }

        utils.createNewEntry(loadBalancingMap, testingType, fileName);
        utils.updateFileStats(loadBalancingMap, testingType, fileName, run.stats.duration);
      }

      //Overwrite original load balancing file
      const fileNameForRunner = `spec-map-${config.env.runner.replace("/", "-")}.json`;
      utils.saveMapFile(loadBalancingMap, fileNameForRunner);
      debug("%s Saved load balancing map with new file stats for runner %s", "Plugin", runner);
    }
  });

  return config;
}
