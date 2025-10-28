/* eslint-disable @typescript-eslint/no-explicit-any */
//TODO: has a lot of issues on GHA. Using husky to run tests on pre-commit now

//Before you run this file, run an `npm run build` or `yarn build`
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "path";
import { expect } from "chai";
import sinon from "sinon";
import { stubReadLoadBalancerFile, runArgvCmd } from "./support/utils";
import cli from "../src/cli";
import utils from "../src/utils";

const IS_ON_GHA = process.env.GITHUB_ACTIONS == "true";

const sandbox = sinon.createSandbox();

describe("Executables", function () {
  this.timeout(5000);
  before(function () {
    if (IS_ON_GHA) this.skip();
  });

  describe("cypress-load-balancer", function () {
    afterEach(function () {
      sandbox.restore();
    });

    context("client", function () {
      context("commands", function () {
        describe("initialize", function () {
          it("can initialize the main file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([false, false]);
            await runArgvCmd(cli, `initialize`);
            expect(stub).to.have.been.called;
          });

          it("can force re-create the directory", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([true, false]);
            await runArgvCmd(cli, `initialize --force-dir`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: true,
              forceCreateMainLoadBalancingMap: false
            });
          });

          it("can force re-create the file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles").returns([false, true]);
            await runArgvCmd(cli, `initialize --force`);
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
            const { error } = await runArgvCmd(cli, `merge`);
            expect(error?.message).to.contain("At least one file path or a glob pattern must be provided.");
          });

          it(`defaults the original to the "./cypress_load_balancer/spec-map.json"`, async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const { argv } = await runArgvCmd(cli, `merge -G **/files/*.json`);
            expect(argv.original).to.eq(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
          });

          it("can have a different original file specified", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const { argv } = await runArgvCmd(cli, `merge -F fake1.json --og foo.json`);
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
            const { argv } = await runArgvCmd(cli, `merge -F fake1.json -F /files/fake2.json`);
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
            await runArgvCmd(cli, `merge -F fake1.json`);
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(
              utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH,
              sinon.match.any
            );
          });

          it("can have a different output file specified for saving", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
            await runArgvCmd(cli, `merge -F fake1.json -o /files/alternate.json`);
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
            await runArgvCmd(cli, `merge -F fake1.json -F /files/fake2.json`);
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("fake1.json"))).to.be.true;
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("/files/fake2.json"))).to.be.true;
            expect(saveMapFileStub).to.have.been.calledOnce;
          });

          it("can use a glob pattern to find input files", async function () {
            const stub = sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            await runArgvCmd(cli, `merge -G tests/fixtures/spec-map/**.json`);
            expect(stub.args.some((a: any[]) => a[0].includes("/tests/fixtures/spec-map/generic.json"))).to.be.true;
            expect(stub.args.some((a: any[]) => a[0].includes("/tests/fixtures/spec-map/all-equal-time.json"))).to.be
              .true;
          });

          it(`The glob pattern for merging runners works with \".cypress_load_balancer/spec-map-*-*.json\"`, async function () {
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
            const tempGlob = path.join(process.cwd(), "/.cypress_load_balancer/spec-map-*-*.json");

            await runArgvCmd(cli, `merge -G "${tempGlob}"`);

            tempFileNames.map((f) => {
              expect(stub.args.some((a: any[]) => a[0].includes(f))).to.be.true;
            });
          });

          it("skips merging if no files are found", async function () {
            const stub = sandbox.stub(utils, "saveMapFile");
            await runArgvCmd(cli, `merge -G fakeDir/**.json`);
            expect(stub).to.not.have.been.called;
          });

          it("can delete temp files", async function () {
            const stub = sandbox.stub(fs, "unlinkSync");
            await runArgvCmd(cli, `merge -G tests/fixtures/spec-map/**.json --rm`);
            expect(stub).to.have.been.called;
          });
        });

        describe("generate-runners", function () {
          let output: string, write;
          //eslint-disable-next-line prefer-const
          write = process.stdout.write;

          beforeEach(function () {
            output = "";
            //@ts-expect-error Ignore
            process.stdout.write = function (str) {
              output += str;
            };
          });

          afterEach(function () {
            process.stdout.write = write;
          });

          it("can generate an array of runner values to pass to CYPRESS_runner or --env runner", async function () {
            await runArgvCmd(cli, `generate-runners 4`);
            expect(output).to.contain("[ '1/4', '2/4', '3/4', '4/4' ]");
          });

          it("requires a count of runners", async function () {
            const { error } = await runArgvCmd(cli, `generate-runners`);
            expect(error?.message).to.contain("Not enough non-option arguments: got 0, need at least 1");
          });

          it("cannot have the count as 0", async function () {
            const { error } = await runArgvCmd(cli, `generate-runners 0`);
            expect(error?.message).to.contain("The runner count must be greater than 0");
          });

          it("cannot have the count less than 0", async function () {
            const { error } = await runArgvCmd(cli, `generate-runners -1`);
            expect(error?.message).to.contain("The runner count must be greater than 0");
          });

          it("can set the Github Actions output to `runner-variables`", async function () {
            const cmdOutput = await new Promise((resolve) => {
              cli.parse(`generate-runners 4 --gha`, () => {
                resolve(output);
              });
            });
            expect(output).to.eq(cmdOutput);
            expect(output).to.contain("name=runner-variables");
          });
        });
      });
    });

    it(`can be executed with "npx"`, function (done) {
      if (IS_ON_GHA) this.skip();
      exec("npx cypress-load-balancer", (err) => {
        expect((err as Error).message).to.contain(`cypress-load-balancer`);
        done();
      });
    });
  });
});
