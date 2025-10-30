import * as child_process from "node:child_process";
import { expect } from "chai";
import { debug as debugInitializer } from "debug";
import Utils from "../src/utils";
import fs from "node:fs";

const decodeStdout = (stdout: Buffer) => Buffer.from(stdout).toString();

const IS_ON_GHA = process.env.GITHUB_ACTIONS == "true";
const SHOULD_RUN = process.env.RUN_LONG_TESTS || IS_ON_GHA;

describe("Actual Cypress examples with load balancing enabled", function () {
  this.retries(1);
  this.timeout(15000);

  before(function () {
    if (!SHOULD_RUN) this.skip();
    this.NO_COLOR = process.env.NO_COLOR;
    this.FORCE_COLORS = process.env.FORCE_COLORS;
    process.env.NO_COLOR = "1";
    process.env.FORCE_COLORS = "0";
  });

  beforeEach(function () {
    debugInitializer.enable("cypress-load-balancer");
  });

  afterEach(function () {
    process.env.CYPRESS_CONFIG_FILE = undefined;
    debugInitializer.disable();
    try {
      //DELETES THE LOAD BALANCER MAP TO PREVENT STATE LEAKAGE
      fs.unlinkSync(".cypress_load_balancer/spec-map.json");
      //eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_err) {
      //eslint-disable-line no-empty
    }
  });

  after(function () {
    process.env.NO_COLOR = this.NO_COLOR;
    process.env.FORCE_COLORS = this.FORCE_COLORS;
  });

  context("mocha e2e", function () {
    it("parallelization disabled", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config",
        `specPattern="cypress/e2e/**/1.cy.js"`
      ]);
      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(output).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("balancing with only 1 runner", function () {
      const specPattern = '{"specPattern":["cypress/e2e/**/1.cy.js","cypress/e2e/**/2.cy.js"]}';
      const { stdout, stderr } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--env",
        "runner=1/1",
        `--config`,
        specPattern
      ]);

      const output = decodeStdout(stdout);
      const stderrOutput = decodeStdout(stderr);

      expect(output).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
      expect(stderrOutput).to.contain("Saved load balancing map with new file stats for runner 1/1");
    });

    const test_balancingWith2Runners = ["1/2", "2/2"];
    test_balancingWith2Runners.map((runner) => {
      it(`balancing with 2 runners: ${runner}`, function () {
        const specPattern = `specPattern="cypress/e2e/example-blank-files/**/*.cy.js"`;
        const { stdout, stderr } = child_process.spawnSync("npx", [
          "cypress",
          "run",
          "--env",
          `runner=${runner}`,
          `--config`,
          specPattern
        ]);

        const output = decodeStdout(stdout);
        const stderrOutput = decodeStdout(stderr);

        expect(output).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
        expect(stderrOutput).to.contain(`Saved load balancing map with new file stats for runner ${runner}`);
      });
    });

    it("empty runner due to more runners than files", function () {
      //There are only 4 files.
      const specPattern = `specPattern="cypress/e2e/example-blank-files/**.cy.js"`;
      const { stdout, stderr } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--env",
        `runner=5/5`,
        `--config`,
        specPattern
      ]);

      const output = decodeStdout(stdout);
      const stderrOutput = decodeStdout(stderr);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`).and.match(Utils.EMPTY_FILE_NAME_REGEXP);
      expect(stderrOutput).to.contain(`Skipping updating all file statistics on runner`);
    });

    it("empty runner with updated specPattern", function () {
      //There are only 4 files.
      const specPattern = `specPattern="cypress/e2e/FAKE/FAKE.cy.js"`;
      const { stdout, stderr } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--env",
        `runner=1/1`,
        `--config`,
        specPattern
      ]);

      const output = decodeStdout(stdout);
      const stderrOutput = decodeStdout(stderr);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`).and.match(Utils.EMPTY_FILE_NAME_REGEXP);
      expect(stderrOutput).to.contain(`Skipping updating all file statistics on runner`);
    });
  });

  context("Cucumber e2e", function () {
    beforeEach(function () {
      this.cypressConfigFile = "cypress.config.cucumber.ts";
    });

    const test_allFeatureFilesOn2Runners = ["1/2", "2/2"];
    test_allFeatureFilesOn2Runners.map((runner) => {
      it(`all feature files on 2 runners: ${runner}`, function () {
        const { stdout, stderr } = child_process.spawnSync("npx", [
          "cypress",
          "run",
          "--config-file",
          this.cypressConfigFile,
          "--env",
          `runner=${runner}`
        ]);

        const output = decodeStdout(stdout);
        const stderrOutput = decodeStdout(stderr);

        expect(output).to.contain(`(2 of 2)`).and.contain(`All specs passed!`);
        expect(stderrOutput).to.contain(`Saved load balancing map with new file stats for runner ${runner}`);
      });
    });

    it("filtered feature files by tag pattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@tag"`
      ]);

      const output = decodeStdout(stdout);
      expect(output).to.contain(`(3 of 3)`).and.contain(`All specs passed!`);
    });

    it("filtered feature files by updated specPattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1`,
        `--config`,
        `specPattern="**/features/a.feature"`
      ]);

      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(output).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("filtered feature files by tag pattern and updated specPattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@tag"`,
        `--config`,
        `specPattern="**/features/a.feature"`
      ]);

      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(output).to.not.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner with --config specPattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        `--config`,
        `specPattern="e2e/**/features/a.feature"`,
        `--env`,
        `runner="2/2"`
      ]);

      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`).and.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner due to tag pattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@FAKE"`
      ]);

      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(output).to.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });

    it("empty runner with tag pattern AND updated specPattern", function () {
      const { stdout } = child_process.spawnSync("npx", [
        "cypress",
        "run",
        "--config-file",
        this.cypressConfigFile,
        "--env",
        `runner=1/1,tags="@FAKE"`,
        `--config`,
        `specPattern="**/features/no-tags.feature"`
      ]);

      const output = decodeStdout(stdout);

      expect(output).to.contain(`(1 of 1)`).and.contain(`All specs passed!`);
      expect(output).to.match(Utils.EMPTY_FILE_NAME_REGEXP);
    });
  });
});
