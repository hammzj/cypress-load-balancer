/* eslint-disable @typescript-eslint/no-explicit-any */
//TODO: has a lot of issues on GHA. Using husky to run tests on pre-commit now

//Before you run this file, run an `npm run build` or `yarn build`
import fs from "node:fs";
import child_process from "node:child_process";
import path from "path";
import { expect } from "chai";
import sinon from "sinon";
import { stubReadLoadBalancerFile, runArgvCmdInCurrentProcess, decodeStdout } from "./support/utils";
import cli from "../src/cli";
import utils from "../src/utils";

const IS_ON_GHA = process.env.GITHUB_ACTIONS == "true";
const SHOULD_RUN = process.env.RUN_LONG_TESTS || IS_ON_GHA;

const sandbox = sinon.createSandbox();

describe("Executables", function () {
  this.timeout(5000);

  before(function () {
    if (!SHOULD_RUN) this.skip();
  });

  describe("cypress-load-balancer", function () {
    afterEach(function () {
      sandbox.restore();
    });

    it(`can be executed with "npx"`, function () {
      const { stderr } = child_process.spawnSync("npx", ["cypress-load-balancer"]);
      const output = decodeStdout(stderr);
      expect(output).to.contain("cypress-load-balancer <command>");
    });

    context("client", function () {
      context("commands", function () {
        describe("initialize", function () {
          it("can initialize the main file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([false, false]);
            await runArgvCmdInCurrentProcess(cli, `initialize`);
            expect(stub).to.have.been.called;
          });

          it("can force re-create the directory", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([true, false]);
            await runArgvCmdInCurrentProcess(cli, `initialize --force-dir`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: true,
              forceCreateMainLoadBalancingMap: false
            });
          });

          it("can force re-create the file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([false, true]);
            await runArgvCmdInCurrentProcess(cli, `initialize --force`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: false,
              forceCreateMainLoadBalancingMap: true
            });
          });
        });

        describe("merge", function () {
          beforeEach(function () {
            this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
          });

          it("requires either a glob pattern or a list of files", async function () {
            stubReadLoadBalancerFile(sandbox);
            const { error } = await runArgvCmdInCurrentProcess(cli, `merge`);
            expect(error?.message).to.contain("At least one file path or a glob pattern must be provided.");
          });

          it(`defaults the original to the "./cypress_load_balancer/spec-map.json"`, async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const { argv } = await runArgvCmdInCurrentProcess(cli, `merge -G **/files/*.json`);
            expect(argv.original).to.eq(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
          });

          it("can have a different original file specified", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const { argv } = await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json --og foo.json`);
            expect(argv.original).to.eq("foo.json");
          });

          it("can merge load balancing maps back to the original", async function () {
            sandbox
              .stub(fs, "readFileSync")
              .returns(JSON.stringify({ e2e: {}, component: {} }))
              .withArgs("fake1.json")
              .returns(JSON.stringify({ e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150 } } } }))
              .withArgs("/files/fake2.json")
              .returns(JSON.stringify({ e2e: { "bar.test.ts": { stats: { durations: [100], average: 100 } } } }));
            const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
            const { argv } = await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -F /files/fake2.json`);
            expect(saveMapFileStub).to.have.been.calledOnce.and.calledWithMatch(
              {
                e2e: {
                  "foo.test.ts": { stats: { durations: [100, 200], average: 150 } },
                  "bar.test.ts": { stats: { durations: [100], average: 100 } }
                }
              },
              argv.output
            );
          });

          it("defaults to overwrite the original file", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json`);
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(
              utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH,
              sinon.match.any
            );
          });

          it("can have a different output file specified for saving", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -o /files/alternate.json`);
            expect(saveMapFileStub).to.have.been.calledWithMatch(sandbox.match.any, `/files/alternate.json`);
          });

          it("can have input files specified for merging", async function () {
            const readFileSyncStub = sandbox.stub(fs, "readFileSync").returns(
              JSON.stringify({
                e2e: {},
                component: {}
              })
            );
            const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -F /files/fake2.json`);
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("fake1.json"))).to.be.true;
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("/files/fake2.json"))).to.be.true;
            expect(saveMapFileStub).to.have.been.calledOnce;
          });

          it("can use a glob pattern to find input files", async function () {
            const stub = sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            await runArgvCmdInCurrentProcess(cli, `merge -G tests/fixtures/spec-map/**.json`);
            expect(stub.args.some((a: any[]) => a[0].includes("/tests/fixtures/spec-map/generic.json"))).to.be.true;
            expect(stub.args.some((a: any[]) => a[0].includes("/tests/fixtures/spec-map/all-equal-time.json"))).to.be
              .true;
          });

          it(`The glob pattern for merging runners works with \"./.cypress_load_balancer/**/spec-map-*.json\"`, async function () {
            const tempFileNames = [
              "/.cypress_load_balancer/spec-map-1-4.json",
              "/.cypress_load_balancer/spec-map-2-4.json",
              "/.cypress_load_balancer/spec-map-3-4.json",
              "/.cypress_load_balancer/spec-map-4-4.json"
            ];
            this.writeFileSyncStub.restore();
            tempFileNames.map((f) => {
              fs.writeFileSync(
                path.join(process.cwd(), f),
                JSON.stringify({
                  e2e: {},
                  component: {}
                })
              );
            });

            this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
            sandbox.stub(utils, "saveMapFile");
            const stub = sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));

            //Because this is being executed in a sub-directory,
            // we need to treat the glob with the path from the base directory
            const tempGlob = path.join(process.cwd(), "./.cypress_load_balancer/**/spec-map-*.json");

            await runArgvCmdInCurrentProcess(cli, `merge -G "${tempGlob}"`);

            tempFileNames.map((f) => {
              expect(stub.args.some((a: any[]) => a[0].includes(f))).to.be.true;
            });
          });

          it("skips merging if no files are found", async function () {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const stub = sandbox.stub(utils, "saveMapFile");
            await runArgvCmdInCurrentProcess(cli, `merge -G fakeDir/**.json`);
            expect(stub).to.not.have.been.called;
          });

          it("can delete temp files", async function () {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const stub = sandbox.stub(fs, "unlinkSync");
            await runArgvCmdInCurrentProcess(cli, `merge -G tests/fixtures/spec-map/**.json --rm`);
            expect(stub).to.have.been.called;
          });

          it("can be set to throw an error if no files are found", async function () {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const { stderr } = child_process.spawnSync("npx", [
              "cypress-load-balancer",
              `merge`,
              `-G "fakeDir/**.json"`,
              `--HE=error`
            ]);
            const output = decodeStdout(stderr);
            expect(output).to.contain("No input files provided or found for the merge command to use!");
          });
        });

        describe("generate-runners", function () {
          it("can generate an array of runner values to pass to CYPRESS_runner or --env runner", function () {
            const { stdout } = child_process.spawnSync("npx", ["cypress-load-balancer", "generate-runners", "4"]);
            const output = decodeStdout(stdout);
            expect(output).to.contain("[ '1/4', '2/4', '3/4', '4/4' ]");
          });

          it("requires a count of runners", async function () {
            const { stderr } = child_process.spawnSync("npx", ["cypress-load-balancer", "generate-runners"]);
            const output = decodeStdout(stderr);
            expect(output).to.contain("Not enough non-option arguments: got 0, need at least 1");
          });

          it("cannot have the count as 0", async function () {
            const { stderr } = child_process.spawnSync("npx", ["cypress-load-balancer", "generate-runners", "0"]);
            const output = decodeStdout(stderr);
            expect(output).to.contain("The runner count must be greater than 0");
          });

          it("cannot have the count less than 0", async function () {
            const { stderr } = child_process.spawnSync("npx", ["cypress-load-balancer", "generate-runners", "-1"]);
            const output = decodeStdout(stderr);
            expect(output).to.contain("The runner count must be greater than 0");
          });

          it("can set the Github Actions output to `runner-variables`", async function () {
            const { stdout } = child_process.spawnSync("npx", [
              "cypress-load-balancer",
              "generate-runners",
              "4",
              "--gha"
            ]);
            const output = decodeStdout(stdout);
            expect(output).to.contain(`name=runner-variables`);
          });
        });
      });
    });
  });
});
