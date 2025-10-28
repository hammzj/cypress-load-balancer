import * as child_process from "node:child_process";
import { expect } from "chai";
import { debug as debugInitializer } from "debug";
import Utils from "../src/utils";

const decodeStdout = (stdout: Buffer) => Buffer.from(stdout).toString();

const IS_ON_GHA = process.env.GITHUB_ACTIONS == "true";
const SHOULD_RUN = process.env.RUN_CYPRESS_EXAMPLES || IS_ON_GHA;

describe("Actual Cypress examples with load balancing enabled", function () {
  this.retries(1);
  this.timeout(15000);

  before(function () {
    if (!SHOULD_RUN) this.skip();
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLOR = "0";
  });

  beforeEach(function () {
    debugInitializer.enable("cypress-load-balancer");
  });

  afterEach(function () {
    process.env.CYPRESS_CONFIG_FILE = undefined;
    debugInitializer.disable();
  });

  after(function () {
    process.env.NO_COLOR = undefined;
    process.env.FORCE_COLOR = undefined;
  });

  context("mocha e2e", function () {
    it("parallelization disabled", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config",
        `specPattern="cypress/e2e/**/1.cy.js"`
      ]);
      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("balancing with only 1 runner", function () {
      const specPattern = '{"specPattern":["cypress/e2e/**/1.cy.js","cypress/e2e/**/2.cy.js"]}';
      const exit = child_process.spawnSync("npx", ["cypress", "run", "--env", "runner=1/1", `--config`, specPattern]);

      const stdout = decodeStdout(exit.stdout);
      const stderr = decodeStdout(exit.stderr);

      expect(stdout).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
      expect(stderr).to.contain("Saved load balancing map with new file stats for runner 1/1");
    });

    const test_balancingWith2Runners = ["1/2", "2/2"];
    test_balancingWith2Runners.map((runner) => {
      it(`balancing with 2 runners: ${runner}`, function () {
        const specPattern = `specPattern="cypress/e2e/example-blank-files/**.cy.js"`;
        const exit = child_process.spawnSync("npx", [
          "cypress",
          "run",
          "--env",
          `runner=${runner}`,
          `--config`,
          specPattern
        ]);

        const stdout = decodeStdout(exit.stdout);
        const stderr = decodeStdout(exit.stderr);

        expect(stdout).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
        expect(stderr).to.contain(`Saved load balancing map with new file stats for runner ${runner}`);
      });
    });

    it("empty runner due to more runners than files", function () {
      //There are only 4 files.
      const specPattern = `specPattern="cypress/e2e/example-blank-files/**.cy.js"`;
      const exit = child_process.spawnSync("npx", ["cypress", "run", "--env", `runner=5/5`, `--config`, specPattern]);

      const stdout = decodeStdout(exit.stdout);
      const stderr = decodeStdout(exit.stderr);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`).and.match(Utils.EMPTY_FILE_NAME_REGEXP);
      expect(stderr).to.contain(`Skipping updating all file statistics on runner`);
    });

    it("empty runner with updated specPattern", function () {
      //There are only 4 files.
      const specPattern = `specPattern="cypress/e2e/FAKE/FAKE.cy.js"`;
      const exit = child_process.spawnSync("npx", ["cypress", "run", "--env", `runner=1/1`, `--config`, specPattern]);

      const stdout = decodeStdout(exit.stdout);
      const stderr = decodeStdout(exit.stderr);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`).and.match(Utils.EMPTY_FILE_NAME_REGEXP);
      expect(stderr).to.contain(`Skipping updating all file statistics on runner`);
    });
  });

  context("Cucumber e2e", function () {
    beforeEach(function () {
      this.cypressConfigFile = "cypress.config.cucumber.ts";
    });

    const test_allFeatureFilesOn2Runners = ["1/2", "2/2"];
    test_allFeatureFilesOn2Runners.map((runner) => {
      it(`all feature files on 2 runners: ${runner}`, function () {
        const exit = child_process.spawnSync("npx", [
          "cypress",
          "run",
          "--config-file",
          this.cypressConfigFile,
          "--env",
          `runner=${runner}`
        ]);

        const stdout = decodeStdout(exit.stdout);
        const stderr = decodeStdout(exit.stderr);

        expect(stdout).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
        expect(stderr).to.contain(`Saved load balancing map with new file stats for runner ${runner}`);
      });
    });

    it("filtered feature files by tag pattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@tag"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(3 of 3)`).and.contain(`All specs passed!`);
    });

    it("filtered feature files by updated specPattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1`,
        `--config`,
        `specPattern="**/features/a.feature"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("filtered feature files by tag pattern and updated specPattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@tag"`,
        `--config`,
        `specPattern="**/features/a.feature"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner with --config specPattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=2/2`,
        `--config`,
        `specPattern="**/features/a.feature"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner due to tag pattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@FAKE"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner with tag pattern AND updated specPattern", function () {
      const exit = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@FAKE"`,
        `--config`,
        `specPattern="**/features/no-tags.feature"`
      ]);

      const stdout = decodeStdout(exit.stdout);

      expect(stdout).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(stdout).to.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });
  });
});
