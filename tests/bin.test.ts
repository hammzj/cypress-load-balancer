import { expect } from "chai";
import { execSync, exec } from "node:child_process";

const BASE_COMMAND = "npx cypress-load-balancer";
describe("Executables", function () {
  this.timeout(5000);
  describe("cypress-load-balancer", function () {
    it(`is executed with "${BASE_COMMAND}"`, async function () {
      try {
        execSync(BASE_COMMAND);
      } catch (error) {
        expect(error).to.exist;
      }
    });

    const requiredArgs = ["runners", "testingType"];
    requiredArgs.map((a) => {
      it(`requires ${a} as an argument`, function (done) {
        exec(BASE_COMMAND, (_err, _stdout, stderr) => {
          const required = stderr.split("\n").find((e) => e.match(/^Missing required arguments/));
          expect(required).to.include(a);
          done();
        });
      });
    });

    it("runs load balancing", function (done) {
      exec(`${BASE_COMMAND} -r 3 -t component -F "foo.test.ts"`, (_err, stdout) => {
        expect(JSON.parse(stdout)).to.deep.eq([["foo.test.ts"], [], []]);
        done();
      });
    });
  });
});
