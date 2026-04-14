/* eslint-disable @typescript-eslint/no-explicit-any */
//TODO: use mock-fs to mock out the file system for calls
//TODO: has a lot of issues on GHA. Using husky to run tests on pre-commit now

//Before you run this file, run an `npm run build` or `yarn build`
import fs from "node:fs";
import child_process from "node:child_process";
import path from "path";
import { expect } from "chai";
import sinon from "sinon";
import { runArgvCmdInCurrentProcess, decodeStdout, stubSpecMapReads } from "./support/utils";
import cli from "../src/cli";
import { LoadBalancingMap } from "../src";

const IS_ON_GHA = process.env.GITHUB_ACTIONS == "true";
//const SHOULD_RUN = !process.env.SKIP_LONG_TESTS || IS_ON_GHA;
const SHOULD_RUN = !process.env.SKIP_LONG_TESTS;
const RETRIES = process.platform === "win32" ? 0 : 1;

const sandbox = sinon.createSandbox();

describe("Executables", function () {
  this.retries(RETRIES);
  this.timeout(10000);

  before(function () {
    if (!SHOULD_RUN) this.skip();
  });

  beforeEach(function () {
    fs.rmSync(".cypress_load_balancer", { recursive: true });
    fs.mkdirSync(".cypress_load_balancer");

    this.processPlatformStub = sandbox.stub(process, "platform").value("linux");
    this.processCwdStub = sandbox.stub(process, "cwd").returns(`/usr/docs/test-repo/`);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("cypress-load-balancer", function () {
    it(`can be executed with "npx"`, function () {
      const { stderr } = child_process.spawnSync("npx", ["cypress-load-balancer"]);
      const output = decodeStdout(stderr);
      expect(output).to.contain("cypress-load-balancer <command>");
    });

    context("client", function () {
      context("commands", function () {
        describe("initialize", function () {
          it("can initialize the main file", async function () {
            const stub = sandbox.stub(LoadBalancingMap.prototype, "initializeSpecMapFile").returns([false, false]);
            await runArgvCmdInCurrentProcess(cli, `initialize`);
            expect(stub).to.have.been.called;
          });

          it("can force re-create the directory", async function () {
            const stub = sandbox.stub(LoadBalancingMap.prototype, "initializeSpecMapFile").returns([true, false]);
            await runArgvCmdInCurrentProcess(cli, `initialize --force-dir`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: true,
              forceCreateFile: false
            });
          });

          it("can force re-create the file", async function () {
            const stub = sandbox.stub(LoadBalancingMap.prototype, "initializeSpecMapFile").returns([false, true]);
            await runArgvCmdInCurrentProcess(cli, `initialize --force`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: false,
              forceCreateFile: true
            });
          });
        });

        describe("merge", function () {
          beforeEach(function () {
            this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
          });

          it("requires either a glob pattern or a list of files", async function () {
            stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
            const { error } = await runArgvCmdInCurrentProcess(cli, `merge`);
            expect(error?.message).to.contain("At least one file path or a glob pattern must be provided.");
          });

          it(`defaults the original to the "./cypress_load_balancer/spec-map.json"`, async function () {
            stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
            const { argv } = await runArgvCmdInCurrentProcess(cli, `merge -G **/files/*.json`);
            expect(argv.original).to.eq(LoadBalancingMap.MAIN_MAP_PATH);
          });

          it("can have a different original file specified", async function () {
            stubSpecMapReads(sandbox, { "foo.json": { e2e: {}, component: {} } });
            const { argv } = await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json --og foo.json`);
            expect(argv.original).to.eq("foo.json");
          });

          it("can merge load balancing maps back to the original", async function () {
            stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "fake1.json": {
                e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } } },
                component: {}
              },
              "/files/fake2.json": {
                e2e: { "bar.test.ts": { stats: { durations: [100], average: 100, median: 100 } } },
                component: {}
              }
            });
            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");
            const saveMapFileSpy = sandbox.spy(LoadBalancingMap.prototype, "saveMapFile");

            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -F /files/fake2.json`);

            expect(mergeMapsSpy).to.have.been.calledOnce;
            expect(saveMapFileSpy).to.have.been.calledOnce;
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(
              LoadBalancingMap.MAIN_MAP_PATH,
              JSON.stringify({
                e2e: {
                  "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } },
                  "bar.test.ts": { stats: { durations: [100], average: 100, median: 100 } }
                },
                component: {}
              })
            );
          });

          it("defaults to overwrite the original file", async function () {
            stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "fake1.json": {
                e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } } },
                component: {}
              }
            });
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json`);
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(
              LoadBalancingMap.MAIN_MAP_PATH,
              sinon.match("foo.test.ts")
            );
          });

          it("can have a different output file specified for saving", async function () {
            stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "fake1.json": {
                e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } } },
                component: {}
              }
            });
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -o /files/alternate.json`);
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(`/files/alternate.json`, sinon.match.string);
          });

          it("can have input files specified for merging", async function () {
            const { readFileSyncStub } = stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "fake1.json": {
                e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } } },
                component: {}
              },
              "/files/fake2.json": {
                e2e: { "bar.test.ts": { stats: { durations: [100], average: 100, median: 100 } } },
                component: {}
              }
            });
            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");

            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -F /files/fake2.json`);
            expect(mergeMapsSpy).to.have.been.calledOnce;
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("fake1.json"))).to.be.true;
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("/files/fake2.json"))).to.be.true;
          });

          it("can use a glob pattern to find input files", async function () {
            //Need to use real file system for this test
            this.processCwdStub.restore();
            const readFileSyncStub = sandbox
              .stub(fs, "readFileSync")
              .returns(JSON.stringify({ e2e: {}, component: {} }));
            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");

            await runArgvCmdInCurrentProcess(cli, `merge -G tests/fixtures/spec-map/**.json`);

            expect(mergeMapsSpy).to.have.been.called;
            //Test against two known files that will appear
            ["/tests/fixtures/spec-map/generic.json", "/tests/fixtures/spec-map/all-equal-time.json"].map(
              (fileName) => {
                expect(readFileSyncStub.args.some((a: any[]) => a[0].includes(fileName))).to.be.true;
              }
            );
          });

          it(`The glob pattern for merging runners works with \"./.cypress_load_balancer/**/spec-map-*.json\"`, async function () {
            //Need to use real file system for this test

            //if (IS_ON_GHA) this.skip();
            const tempFiles = [
              "/.cypress_load_balancer/spec-map-1-4.json",
              "/.cypress_load_balancer/spec-map-2-4.json",
              "/.cypress_load_balancer/spec-map-3-4.json",
              "/.cypress_load_balancer/spec-map-4-4.json"
            ];

            this.processCwdStub.restore();

            //Temporary to create files for glob to find
            this.writeFileSyncStub.restore();
            tempFiles.map((fn) => {
              fs.writeFileSync(path.join(process.cwd(), fn), JSON.stringify({ e2e: {}, component: {} }));
            });
            this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");

            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");
            const { readFileSyncStub } = stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "spec-map-1-4.json": { e2e: {}, component: {} },
              "spec-map-2-4.json": { e2e: {}, component: {} },
              "spec-map-3-4.json": { e2e: {}, component: {} },
              "spec-map-4-4.json": { e2e: {}, component: {} }
            });

            //Because this is being executed in a sub-directory,
            // we need to treat the glob with the path from the base directory
            const tempGlob = path.join(process.cwd(), "./.cypress_load_balancer/**/spec-map-*.json");
            await runArgvCmdInCurrentProcess(cli, `merge -G "${tempGlob}"`);

            expect(mergeMapsSpy).to.have.been.calledOnce;
            tempFiles.map((f) => {
              expect(readFileSyncStub.args.some((a: any[]) => a[0].includes(f))).to.be.true;
            });
          });

          it("skips merging if no files are found via File input", async function () {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");
            await runArgvCmdInCurrentProcess(cli, `merge -F fakeDir/fake1.json`);
            expect(mergeMapsSpy).to.not.have.been.called;
          });

          it("skips merging if no files are found via Glob input", async function () {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const mergeMapsSpy = sandbox.stub(LoadBalancingMap.prototype, "mergeMaps");
            await runArgvCmdInCurrentProcess(cli, `merge -G fakeDir/**.json`);
            expect(mergeMapsSpy).to.not.have.been.called;
          });

          it("can delete temp files after merging", async function () {
            stubSpecMapReads(sandbox, {
              "spec-map.json": { e2e: {}, component: {} },
              "fake1.json": {
                e2e: { "foo.test.ts": { stats: { durations: [100, 200], average: 150, median: 100 } } },
                component: {}
              },
              "/files/fake2.json": {
                e2e: { "bar.test.ts": { stats: { durations: [100], average: 100, median: 100 } } },
                component: {}
              }
            });

            const mergeMapsSpy = sandbox.spy(LoadBalancingMap.prototype, "mergeMaps");
            const unlinkSyncStub = sandbox.stub(fs, "unlinkSync");

            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);
            await runArgvCmdInCurrentProcess(cli, `merge -F fake1.json -F /files/fake2.json --rm`);

            expect(mergeMapsSpy).to.have.been.calledOnce;
            expect(unlinkSyncStub).to.have.been.calledTwice;
            expect(unlinkSyncStub).to.have.been.calledWith(sandbox.match("fake1.json"));
            expect(unlinkSyncStub).to.have.been.calledWith(sandbox.match("/files/fake2.json"));
          });

          it("can be set to throw an error if no files are found", async function (done) {
            child_process.spawnSync("npx", [`cypress-load-balancer`, "initialize"]);

            const { stderr } = child_process.spawnSync("npx", [
              "cypress-load-balancer",
              `merge`,
              `-G "fakeDir/**.json"`,
              `--HE=error`
            ]);
            const output = decodeStdout(stderr);
            expect(output).to.contain("No input files provided or found for the merge command to use!");
            done();
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

          context("Setting GitHub Actions output", function () {
            beforeEach(function () {
              if (IS_ON_GHA) {
                console.warn("This test cannot run on GitHub Actions");
                this.skip();
              }
            });

            it("can set the Github Actions output to `runner-variables`", function () {
              const { stdout } = child_process.spawnSync("npx", [
                "cypress-load-balancer",
                "generate-runners",
                "4",
                "--gha"
              ]);
              const output = decodeStdout(stdout);
              expect(output).to.contain(`::set-output name=runner-variables::["1/4","2/4","3/4","4/4"]`);
            });
          });
        });
      });
    });
  });
});
