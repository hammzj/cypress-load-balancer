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
  const tempFileNameToUse = path.join(os.tmpdir(), `clb-empty-${runnerIndex}-${runnerCount}.cy.js`);
  fs.copyFileSync(emptyFilename, tempFileNameToUse);

  debug("Empty file created for runner %d/%d: %s", runnerIndex, runnerCount, tempFileNameToUse);
  return tempFileNameToUse;
};

const getRunnerEnv = (envRunner: string): [number, number] => {
  const [runnerIndex, runnerCount] = envRunner.split("/").map(Number);
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
    throw Error(
      `env.runner is incorrect! The runner index cannot be greater than the total runner count: ${envRunner}`
    );
  }

  //Runner index must begin at "1" when declared by a user, but we need to subtract 1 from it for the actual method.
  //The method requires 0-based indexing.
  //User declares runnerIndex 1, but it needs to be returned as 0. This is expected.
  //User declares runnerIndex as 2, then it is returned as 1.
  return [runnerIndex - 1, runnerCount];
};

/**
 * In regular Cypress space, `--spec` overrides the config's `specPattern`.
 * However, plugins cannot access `--spec`, but they can access `SPEC` or `env.spec`.
 * If a plugin performs filtering against the `specPattern`, then passing in `--spec` may result
 * in an error if `--spec` does not match the filtered `specPattern`.
 *
 * This function will get the appropriate spec pattern to use in the `getSpecs` method
 *
 * Prefer `env.spec` when defining individual spec patterns to perform additional filtering.
 * @param config { Cypress.PluginConfigOptions,}
 * @returns {string[]}
 */
const getSpecPatternOverride = (config: Cypress.PluginConfigOptions): string[] => {
  return [process.env.SPEC || process.env.spec || config.env?.SPEC || config.env?.spec || config.specPattern].flat();
};

export default function addCypressLoadBalancerPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  testingType: TestingType
) {
  //TODO: allow skipping results collection
  on("after:run", (results: CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult) => {
    if ((results as CypressCommandLine.CypressFailedRunResult).status === "failed") {
      console.error("cypress-load-balancer", "Cypress failed to execute, so load balancing is skipped");
    } else {
      if (config.env?.runner != null) {
        const { runner, skipCypressLoadBalancingResults } = config.env;
        const cypressRunResult = results as CypressCommandLine.CypressRunResult;

        if (skipCypressLoadBalancingResults === true) {
          debug("Skipping updating all file statistics, %o", { skipCypressLoadBalancingResults });
          return;
        }

        //Prep load balancing file if not existing and read it
        utils.initializeLoadBalancingFiles();
        const loadBalancingMap = JSON.parse(
          fs.readFileSync(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).toString()
        ) as LoadBalancingMap;

        for (const run of cypressRunResult.runs) {
          const fileName = run.spec.relative;

          //TODO: skip based on env var and handle better for empty file
          const isEmptyFile = fileName.match(EMPTY_FILE_NAME_REGEXP);
          if (isEmptyFile) {
            debug("%s Skipping file updates due to empty file on runner %s: %s", "Plugin", runner, fileName);
            continue;
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
    }
  });

  if (config.env?.runner != null) {
    const { runner, cypressLoadBalancerAlgorithm } = config.env;
    debug("Starting up load balancing process as \"env.runner\" has been declared: %o", {
      runner,
      cypressLoadBalancerAlgorithm
    });
    const [runnerIndex, runnerCount] = getRunnerEnv(runner);

    //This will appropriately update the `specPattern` if an override is declared
    const specPatternOverride = getSpecPatternOverride(config);
    debug("specPatternOverride: %s", specPatternOverride);
    const getSpecsOptions = {
      ...config,
      specPattern: specPatternOverride.length > 0 ? specPatternOverride : config.specPattern
    };
    const filePaths = getSpecs(getSpecsOptions, testingType);

    const runners = performLoadBalancing(
      runnerCount,
      testingType,
      filePaths,
      cypressLoadBalancerAlgorithm || "weighted-largest"
    );

    const currentRunner = runners[runnerIndex];
    const isCurrentRunnerFilePatternEmpty = currentRunner == null || currentRunner.length === 0;
    config.specPattern = isCurrentRunnerFilePatternEmpty
      ? createEmptyFileForEmptyRunner(runnerIndex, runnerCount)
      : currentRunner;
    //Debugging adds 1 to the runnerIndex so it's easier for a user to read.
    debug(`config.specPattern updated for runner ${runnerIndex + 1}/${runnerCount}: %s`, currentRunner);
  }

  return config;
}
