//TODO: this file is choppy. It needs to run the actual script file instead of executing npx.

//Before you run this file, run an `npm run build` or `yarn build`
import { execSync } from "node:child_process";
import { expect } from "chai";
import sinon from "sinon";
import argv from "../src/cli";
import { stubReadLoadBalancerFile } from "./support/utils";
import fs from "node:fs";

const sandbox = sinon.createSandbox();

describe("Executables", function() {
  this.timeout(5000);
  describe("cypress-load-balancer", function() {
    afterEach(function() {
      sandbox.restore();
    });

    context("client", function() {

      context("commands", function() {
        describe("balance", function() {
          const requiredArgs = ["runners", "testingType"];
          requiredArgs.map((a) => {
            it(`requires ${a} as an argument`, async function() {
              const output: string = await new Promise((resolve) => {
                //@ts-expect-error ignore
                argv.parse(``, (_err, _argv, output) => {
                  resolve(output);
                });
              });
              const required = output.split("\n").find((e) => e.match(/^Missing required arguments/));
              expect(required).to.include(a);
            });
          });

          it("runs load balancing", async function() {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: { ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } } }
            });
            sandbox.stub(fs, "writeFileSync");

            const argvOutput: string = await new Promise((resolve) => {
              //@ts-expect-error ignore
              argv.parse(`-r 3 -t component -F "foo.test.ts"`, (_err, argv, _output) => {
                resolve(argv.output);
              });
            });
            expect(JSON.parse(argvOutput)).to.deep.eq([["foo.test.ts"], [], []]);
          });

          it("can format the output as a comma-delimited string", async function() {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: {
                ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
              }
            });
            sandbox.stub(fs, "writeFileSync");

            const argvOutput: string = await new Promise((resolve) => {
              //@ts-expect-error ignore
              argv.parse(`-r 2 -t component --format string -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`, (_err, argv, _output) => {
                resolve(argv.output);
              });
            });
            expect(JSON.parse(argvOutput)).to.deep.eq(["foo.test.ts,baz.test.ts", "bar.test.ts"]);
          });

          it("can format the output in spec format", async function() {
            stubReadLoadBalancerFile(sandbox, {
              e2e: {},
              component: {
                ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
                ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
                ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
              }
            });
            sandbox.stub(fs, "writeFileSync");

            const argvOutput: string = await new Promise((resolve) => {
              //@ts-expect-error ignore
              argv.parse(`-r 2 -t component --fm spec -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`, (_err, argv, _output) => {
                resolve(argv.output);
              });
            });
            expect(JSON.parse(argvOutput)).to.deep.eq(["--spec foo.test.ts,baz.test.ts", "--spec bar.test.ts"]);
          });
        });

        it("can format the output as a newline-delimited string", async function() {
          stubReadLoadBalancerFile(sandbox, {
            e2e: {},
            component: {
              ["foo.test.ts"]: { stats: { durations: [3000], average: 3000 } },
              ["bar.test.ts"]: { stats: { durations: [2000], average: 2000 } },
              ["baz.test.ts"]: { stats: { durations: [100], average: 100 } }
            }
          });
          sandbox.stub(fs, "writeFileSync");

          const argvOutput: string = await new Promise((resolve) => {
            //@ts-expect-error ignore
            argv.parse(`-r 2 -t component --fm newline -F "foo.test.ts" -F "bar.test.ts" -F "baz.test.ts"`, (_err, argv, _output) => {
              resolve(argv.output);
            });
          });
          expect(JSON.parse(argvOutput)).to.deep.eq(["foo.test.ts\nbaz.test.ts", "bar.test.ts"]);
        });

        describe("merge", function() {

        });
      });

    });

    it(`can be executed with "npx"`, function() {
      try {
        execSync("npx cypress-load-balancer");
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});
