/* eslint-disable @typescript-eslint/no-unused-vars,@typescript-eslint/no-explicit-any */
//TODO: this file is choppy. It needs to run the actual script file instead of executing npx.

//Before you run this file, run an `npm run build` or `yarn build`
import { execSync } from "node:child_process";
import fs from "node:fs";
import { expect } from "chai";
import sinon from "sinon";
//@ts-expect-error No types exist
import findCypressSpecs from "find-cypress-specs";
import { stubReadLoadBalancerFile, runCmd } from "./support/utils";
import cli from "../src/cli";
import utils from "../src/utils";

const sandbox = sinon.createSandbox();

describe("Executables", function () {
  this.timeout(5000);
  describe("cypress-load-balancer", function () {
    afterEach(function () {
      sandbox.restore();
    });

    context("client", function () {
      context("commands", function () {
        describe("balance", function () {
          beforeEach(function () {
            sandbox.stub(fs, "writeFileSync");
          });

          const requiredArgs = ["runners", "testing-type"];
          requiredArgs.map((a) => {
            it(`requires ${a} as an argument`, async function () {
              const [_err, _argv, output] = await runCmd(cli, ``);
              const required = output.split("\n").find((e) => e.match(/^Missing required arguments/));
              expect(required).to.include(a);
            });
          });

          it("runs load balancing", async function () {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: { ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } } }
            });
            const [_err, argv] = await runCmd(cli, `-r 3 -t component -F "foo.test.ts"`);
            expect(JSON.parse(argv.output)).to.deep.eq([["foo.test.ts"], [], []]);
          });

          it("can format the output as a comma-delimited string", async function () {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: {
                ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
              }
            });
            const [_err, argv] = await runCmd(
              cli,
              `-r 2 -t component --format string -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`
            );
            expect(JSON.parse(argv.output)).to.deep.eq(["foo.test.ts,baz.test.ts", "bar.test.ts"]);
          });

          it("can format the output in spec format", async function () {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: {
                ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
              }
            });
            const [_err, argv, _output] = await runCmd(
              cli,
              `-r 2 -t component --fm spec -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`
            );
            expect(JSON.parse(argv.output)).to.deep.eq(["--spec foo.test.ts,baz.test.ts", "--spec bar.test.ts"]);
          });

          it("can format the output as a newline-delimited string", async function () {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: {
                ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
              }
            });
            const [_err, argv, _output] = await runCmd(
              cli,
              `-r 2 -t component --fm newline -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`
            );
            expect(JSON.parse(argv.output)).to.deep.eq(["foo.test.ts\nbaz.test.ts", "bar.test.ts"]);
          });

          it("uses getSpecs if no files are provided", async function () {
            const stub = sandbox.stub(findCypressSpecs, "getSpecs").returns(["foo.test.ts"]);
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            //Call stub when not files are not provided
            await runCmd(cli, `-r 2 -t component`);
            //Should not be called when files are provided
            await runCmd(cli, `-r 2 -t component --format string -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`);
            expect(stub).to.have.been.calledOnce;
          });

          context("setting GitHub Actions outputs", function () {
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

            it("can set the Github Actions output", async function () {
              stubReadLoadBalancerFile(sandbox, {
                e2e: {},
                component: {
                  ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                  ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                  ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
                }
              });
              //Can't use helper function here for this
              const cmdOutput = await new Promise((resolve) => {
                cli.parse(
                  `-r 2 -t component --format string --gha -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`,
                  //@ts-expect-error ignore
                  (_err, _argv, _output) => {
                    resolve(output);
                  }
                );
              });
              expect(output).to.eq(cmdOutput);
            });
          });
        });

        describe("merge", function () {
          beforeEach(function () {
            this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
          });

          it("requires either a glob pattern or a list of files", async function () {
            const [err] = await runCmd(cli, `merge`);
            expect(err.message).to.contain("At least one file path or a glob pattern must be provided.");
          });

          it(`defaults the original to the "./cypress_load_balancer/main.json"`, async function () {
            const [_err, argv] = await runCmd(cli, `merge -G **/files/*.json`);
            expect(argv.original).to.eq(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
          });

          it("can have a different original file specified", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const [_err, argv] = await runCmd(cli, `merge -F fake1.json --og foo.json`);
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
            const [_err, argv] = await runCmd(cli, `merge -F fake1.json -F /files/fake2.json`);
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
            await runCmd(cli, `merge -F fake1.json`);
            expect(this.writeFileSyncStub).to.have.been.calledWithMatch(
              utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH,
              sinon.match.any
            );
          });

          it("can have a different output file specified for saving", async function () {
            sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
            await runCmd(cli, `merge -F fake1.json -o /files/alternate.json`);
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
            await runCmd(cli, `merge -F fake1.json -F /files/fake2.json`);
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("fake1.json"))).to.be.true;
            expect(readFileSyncStub.args.some((a: any[]) => a[0].includes("/files/fake2.json"))).to.be.true;
            expect(saveMapFileStub).to.have.been.calledOnce;
          });

          it("can use a glob pattern to find input files", async function () {
            const stub = sandbox.stub(fs, "readFileSync").returns(JSON.stringify({ e2e: {}, component: {} }));
            await runCmd(cli, `merge -G tests/fixtures/*.json`);
            expect(stub.args.some((a: any[]) => a[0].includes("/tests/fixtures/load-balancing-map.json"))).to.be.true;
          });

          it("skips merging if no files are found", async function () {
            const stub = sandbox.stub(utils, "saveMapFile");
            await runCmd(cli, `merge -G fakeDir/**.json`);
            expect(stub).to.not.have.been.called;
          });
        });

        describe("initialize", function () {
          it("can initialize the file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles");
            await runCmd(cli, `initialize`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: false,
              forceCreateMainLoadBalancingMap: false
            });
          });

          it("can force re-create the directory", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles");
            await runCmd(cli, `initialize --force-dir`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: true,
              forceCreateMainLoadBalancingMap: false
            });
          });

          it("can force re-create the file", async function () {
            const stub = sandbox.stub(utils, "initializeLoadBalancingFiles");
            await runCmd(cli, `initialize --force`);
            expect(stub).to.have.been.calledWith({
              forceCreateMainDirectory: false,
              forceCreateMainLoadBalancingMap: true
            });
          });
        });
      });
    });

    it(`can be executed with "npx"`, function () {
      try {
        execSync("npx cypress-load-balancer");
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});
