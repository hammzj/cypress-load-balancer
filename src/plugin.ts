import fs from "node:fs";
import utils from "./utils";
// @ts-ignore
import findCypressSpecs, { getSpecs, getConfig as getConfigFindCypressSpecs } from "find-cypress-specs";
import { debug } from "./helpers";
import { LoadBalancingMap, TestingType } from "./types";
import { performLoadBalancing } from "./";
import path from "path";
import * as os from "node:os";

const EMPTY_FILE_NAME_REGEXP = /clb-empty-\d+-\d+.cy.js/;
const EMPTY_FILE_NAME = "empty.cy.js";

//Thanks to Gleb Bahmutov with cypress-split -- this works very well
//@see https://github.com/bahmutov/cypress-split for inspiration
const createEmptyFileForEmptyRunner = (runnerIndex: number, runnerCount: number) => {
  //TODO: don't just copy this code
  // copy the empty spec file from our source folder into temp folder
  const emptyFilename = path.resolve(__dirname, EMPTY_FILE_NAME);

  //Make the runnerIndex match the user input
  const userInputtedRunnerIndex = runnerIndex + 1;
  const tempFileNameToUse = path.join(os.tmpdir(), `clb-empty-${userInputtedRunnerIndex}-${runnerCount}.cy.js`);
  fs.copyFileSync(emptyFilename, tempFileNameToUse);

  console.warn(
    "Runner %d/%d is empty! Running an empty spec instead to prevent Cypress producing an error.",
    userInputtedRunnerIndex,
    runnerCount
  );
  debug("Empty file created for runner %d/%d: %s", userInputtedRunnerIndex, runnerCount, tempFileNameToUse);
  return tempFileNameToUse;
};

const getRunnerArgs = (runner: string): [number, number] => {
  const [runnerIndex, runnerCount] = runner.split("/").map(Number);
  const hasIncorrectFormat = [runnerIndex, runnerCount].some((v) => Number.isNaN(v) || v == null);

  //Error handling
  if (hasIncorrectFormat) {
    throw Error(
      "env.runner must be provided in X/Y format, where X is the runner index, and Y is the total runner count to use."
    );
  } else if (runnerIndex <= 0) {
    throw Error("env.runner index cannot be 0! Runner indices must begin at 1");
  } else if (runnerCount <= 0) {
    throw Error("env.runner count cannot be 0! Runner count must begin at 1");
  } else if (runnerIndex > runnerCount) {
    throw Error(`env.runner is incorrect! The runner index cannot be greater than the total runner count: ${runner}`);
  }

  //Runner index must begin at "1" when declared by a user, but we need to subtract 1 from it for the actual method.
  //The method requires 0-based indexing.
  //User declares runnerIndex 1, but it needs to be returned as 0. This is expected.
  //User declares runnerIndex as 2, then it is returned as 1.
  return [runnerIndex - 1, runnerCount];
};

//This assumes that `config.env` exists!
const getAllEnvVariables = (config: Cypress.PluginConfigOptions) => {
  return {
    //config.env is required!
    runner: config.env.runner,
    cypressLoadBalancerSkipResults: config.env.cypressLoadBalancerSkipResults,
    cypressLoadBalancerAlgorithm: config.env.cypressLoadBalancerAlgorithm,
    cypressLoadBalancerDisableWarnings: config.env.cypressLoadBalancerDisableWarnings,

    //process.env vars
    CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED: process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED
  };
};

export default function addCypressLoadBalancerPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  testingType: TestingType
) {
  const hasRunner = () => config.env?.runner != null;

  //TODO: allow skipping results collection
  on("after:run", (results: CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult) => {
    if (hasRunner()) {
      if ((results as CypressCommandLine.CypressFailedRunResult).status === "failed") {
        console.error("cypress-load-balancer", "Cypress failed to execute, so load balancing updates will be skipped");
        return;
      }

      const { runner, cypressLoadBalancerSkipResults } = getAllEnvVariables(config);
      const cypressRunResult = results as CypressCommandLine.CypressRunResult;

      const hasOnlyEmptyFile =
        cypressRunResult.runs.length === 1 &&
        cypressRunResult.runs.some((r) => {
          return r.spec.relative.match(EMPTY_FILE_NAME_REGEXP);
        });

      if (cypressLoadBalancerSkipResults || hasOnlyEmptyFile) {
        debug("Skipping updating all file statistics on runner %s, %o", runner, {
          cypressLoadBalancerSkipResults,
          hasOnlyEmptyFile
        });
        return;
      }

      //Prep load balancing file if not existing and read it
      utils.initializeLoadBalancingFiles();
      const loadBalancingMap = JSON.parse(
        fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()
      ) as LoadBalancingMap;

      for (const run of cypressRunResult.runs) {
        const fileName = run.spec.relative;

        //This line should never be true, but is here just-in-case
        //We should never save the results of empty files generated from this process
        if (fileName.match(EMPTY_FILE_NAME_REGEXP)) {
          return;
        }

        utils.createNewEntry(loadBalancingMap, testingType, fileName);
        utils.updateFileStats(loadBalancingMap, testingType, fileName, run.stats.duration);
      }

      //Overwrite load balancing file for runner
      const fileNameForRunner = `spec-map-${config.env.runner.replace("/", "-")}.json`;
      utils.saveMapFile(loadBalancingMap, fileNameForRunner);
      debug("%s Saved load balancing map with new file stats for runner %s", "Plugin", runner);
      debug("Load balancing map name: %s", fileNameForRunner);
    }
  });

  if (hasRunner()) {
    const {
      runner,
      cypressLoadBalancerAlgorithm,
      CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED,
      cypressLoadBalancerDisableWarnings
    } = getAllEnvVariables(config);
    debug("Starting up load balancing process as \"env.runner\" has been declared: %o", {
      runner,
      cypressLoadBalancerAlgorithm
    });

    if (CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED == null && !cypressLoadBalancerDisableWarnings) {
      console.warn(
        "It is advised to set process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED, unless 10 durations are enough per test file."
      );
    }

    const [runnerIndex, runnerCount] = getRunnerArgs(runner);

    const filePaths = getSpecs({ ...config }, testingType);
    const runners = performLoadBalancing(
      runnerCount,
      testingType,
      filePaths,
      cypressLoadBalancerAlgorithm || "weighted-largest"
    );

    const currentRunner = runners[runnerIndex];
    const isCurrentRunnerFilePatternEmpty = currentRunner == null || currentRunner.length === 0;
    config.specPattern = isCurrentRunnerFilePatternEmpty
      ? [createEmptyFileForEmptyRunner(runnerIndex, runnerCount)]
      : currentRunner;

    //Add 1 to match user input for runner index
    debug(`config.specPattern updated for runner ${runnerIndex + 1}/${runnerCount}: %s`, currentRunner);
  }

  return config;
}
