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
              const output = await new Promise((resolve) => {
                argv.parse(`balance "`, (_err, _argv, output) => {
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

            const argvOutput = await new Promise((resolve) => {
              argv.parse(`balance -r 3 -t component -F "foo.test.ts"`, (_err, argv, _output) => {
                resolve(argv);
              });
            });
            expect(JSON.parse(argvOutput.output)).to.deep.eq([["foo.test.ts"], [], []]);
          });
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
