import fs from "node:fs";
import * as os from "node:os";
import path from "path";
// @ts-expect-error Does not have typings
import { getSpecs } from "find-cypress-specs";
import { LoadBalancer } from "./load.balancer";
import { LoadBalancingMap } from "./load.balancing.map";
import { debug, warn } from "./helpers";
import { TestingType } from "./types";

//Thanks to Gleb Bahmutov with cypress-split -- this works very well
//@see https://github.com/bahmutov/cypress-split for inspiration
const createEmptyFileForEmptyRunner = (runnerIndex: number, runnerCount: number) => {
  //Make the runnerIndex match the user input
  const userInputtedRunnerIndex = runnerIndex + 1;

  const emptyFilename = path.resolve(__dirname, LoadBalancingMap.EMPTY_FILE_NAME);
  const tempFileNameToUse = path.join(os.tmpdir(), `clb-empty-${userInputtedRunnerIndex}-${runnerCount}.cy.js`);

  fs.copyFileSync(emptyFilename, tempFileNameToUse);
  debug("Empty file created for runner %d/%d: %s", userInputtedRunnerIndex, runnerCount, tempFileNameToUse);

  warn(
    "Runner %d/%d is empty! Running an empty spec instead to prevent Cypress producing an error.",
    userInputtedRunnerIndex,
    runnerCount
  );

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
  return [Number(runnerIndex - 1), Number(runnerCount)];
};

//This assumes that `config.env` exists!
const getAllEnvVariables = (config: Cypress.PluginConfigOptions) => {
  return {
    //config.env is required!
    runner: config.env.runner,
    cypressLoadBalancerSkipResults: config.env.cypressLoadBalancerSkipResults,
    cypressLoadBalancerAlgorithm: config.env.cypressLoadBalancerAlgorithm,
    CYPRESS_LOAD_BALANCER_DISABLE_WARNINGS: config.env.CYPRESS_LOAD_BALANCER_DISABLE_WARNINGS,

    //process.env vars
    CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED: process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED
  };
};

export default function addCypressLoadBalancerPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  testingType: TestingType
) {
  const hasRunner = config.env?.runner != null;
  //Only register the plugin and hooks if it has a runner declared
  if (hasRunner) {
    debug("Runner declared so registering plugin: %s", config.env.runner);

    const {
      runner,
      cypressLoadBalancerSkipResults,
      cypressLoadBalancerAlgorithm,
      CYPRESS_LOAD_BALANCER_DISABLE_WARNINGS,
      CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED
    } = getAllEnvVariables(config);

    const [runnerIndex, runnerCount] = getRunnerArgs(config.env.runner);

    on("after:run", (results: CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult) => {
      debug("Cypress Load Balancer after:run event started");
      if ((results as CypressCommandLine.CypressFailedRunResult).status === "failed") {
        console.error("cypress-load-balancer", "Cypress failed to execute, so load balancing updates will be skipped");
        return;
      }

      const cypressRunResult = results as CypressCommandLine.CypressRunResult;
      const hasOnlyEmptyFile =
        cypressRunResult.runs.length === 1 &&
        cypressRunResult.runs.some((r) => r.spec.relative.match(LoadBalancingMap.EMPTY_FILE_NAME_REGEXP));

      //The Cucumber preprocessor MUST be registered BEFORE this plugin in the config file
      //Don't run when if it is a Cucumber dry run
      const isCucumberDryRun =
        //AWFUL but only way to detect cross-plugin behavior, since "cypress_cucumber_preprocessor" injects keys into the env
        config.env?.dryRun == true &&
        Object.keys(config.env || {}).some((k) => k.includes("cypress_cucumber_preprocessor")) != null;

      //Skip updating results for any of these reasons
      if (cypressLoadBalancerSkipResults || hasOnlyEmptyFile || isCucumberDryRun) {
        debug("Skipping updating all file statistics on runner %s due to one of these reasons: %o", runner, {
          cypressLoadBalancerSkipResults,
          hasOnlyEmptyFile,
          isCucumberDryRun
        });

        return;
      }

      debug("Updating file statistics for runner %s", runner);

      //If there is only 1 runner, then set as undefined so it saves to `spec-map.json` instead
      const specMapFileName = runnerCount === 1 ? undefined : `spec-map-${config.env.runner.replace("/", "-")}.json`;

      //copy base spec-map to use for updates from parallelized runner
      const loadBalancingMapForRunner = new LoadBalancingMap();
      //Safety check -- should do nothing
      loadBalancingMapForRunner.initializeSpecMapFile();

      for (const run of cypressRunResult.runs) {
        const fileName = run.spec.relative;

        //This line should never be true, but is here just-in-case
        //We should never save the results of empty files generated from this process
        if (fileName.match(LoadBalancingMap.EMPTY_FILE_NAME_REGEXP)) return;
        loadBalancingMapForRunner.addTestFileEntry(testingType, fileName);
        loadBalancingMapForRunner.updateTestFileEntry(testingType, fileName, [run.stats.duration as number]);
      }

      //Save with newly added data
      loadBalancingMapForRunner.saveMapFile(specMapFileName);

      debug("%s Saved load balancing map with new file stats for runner %s", "Plugin", runner);
      debug("Load balancing map file name: %s", specMapFileName);
      debug("Cypress Load Balancer after:run event finished");
    });

    debug('Starting up load balancing process as "env.runner" has been declared: %o', {
      runner,
      cypressLoadBalancerAlgorithm
    });

    if (CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED == null && !CYPRESS_LOAD_BALANCER_DISABLE_WARNINGS) {
      console.warn(
        "It is advised to set process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED, unless 10 durations are enough per test file."
      );
    }

    const filePaths = getSpecs({ ...config }, testingType);
    const loadBalancer = new LoadBalancer(cypressLoadBalancerAlgorithm);

    const runners = loadBalancer.performLoadBalancing(runnerCount, testingType, filePaths);

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
