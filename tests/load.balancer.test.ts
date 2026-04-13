//eslint-disable @typescript-eslint/no-unused-expressions
import fs from "node:fs";
import sinon from "sinon";
import path from "path";
import { expect } from "chai";
import { debug as debugInitializer } from "debug";
import { LoadBalancer } from "../src/load.balancer";
import { LoadBalancingMap } from "../src/load.balancing.map";
import { getFixture, stubSpecMapReads } from "./support/utils";
import { FilePath, LoadBalancingMapJSONFile, TestingType } from "../src/types";

//eslint-disable-next-line prefer-const
let sandbox = sinon.createSandbox();

const getTotalMedianTime = (loadBalancerFile: LoadBalancingMapJSONFile, testingType: TestingType, fps: FilePath[]) =>
  fps.map((f) => loadBalancerFile[testingType][f].stats.median).reduce((acc, next) => acc + next, 0);
const assertTotalRunnerTime = (
  loadBalancerFile: LoadBalancingMapJSONFile,
  testingType: TestingType,
  runner: FilePath[],
  expectedTime: number
) => {
  expect(getTotalMedianTime(loadBalancerFile, testingType, runner)).to.eq(expectedTime);
};

const baseStubs = () => {
  sandbox.stub(LoadBalancingMap.prototype, "initializeSpecMapFile").callsFake(() => {
    return [false, false];
  });
  const writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
  return { writeFileSyncStub };
};

describe("LoadBalancer", function () {
  beforeEach(function () {
    const { writeFileSyncStub } = baseStubs();
    this.writeFileSyncStub = writeFileSyncStub;
  });
  afterEach(function () {
    debugInitializer.disable();
    sandbox.restore();
  });

  context("preparation", function () {
    it("cannot accept a runner count less than 1", function () {
      const loadBalancer = new LoadBalancer();

      expect(() => loadBalancer.performLoadBalancing(0, "e2e", [])).to.throw("Runner count cannot be less than 1");
      expect(() => loadBalancer.performLoadBalancing(-1, "e2e", [])).to.throw("Runner count cannot be less than 1");
    });

    it("runs file initialization", function () {
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      const loadBalancer = new LoadBalancer();

      expect(this.writeFileSyncStub).to.not.have.been.called;

      loadBalancer.performLoadBalancing(3, "e2e", ["e2e/foo.test.js"]);

      expect(this.writeFileSyncStub.lastCall).to.have.been.calledWith(
        sandbox.match("spec-map.json"),
        JSON.stringify({
          e2e: { "e2e/foo.test.js": { stats: { durations: [], average: 0, median: 0 } } },
          component: {}
        })
      );
    });

    it("only uses the relative file path", function () {
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      const fileName = "test.1.ts";

      const full = path.join(process.cwd(), fileName);

      const loadBalancer = new LoadBalancer();
      const runners = loadBalancer.performLoadBalancing(1, "e2e", [full]);

      expect(runners[0]).to.deep.eq([fileName]);
    });

    it(`outputs runners with system dependent paths: win32`, function () {
      sandbox.stub(process, "platform").value("win32");
      sandbox.stub(process, "cwd").returns("C:\\docs\\test-project\\");

      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

      const fileName = "e2e/test.1.ts";

      const loadBalancer = new LoadBalancer();
      const runners = loadBalancer.performLoadBalancing(1, "e2e", [fileName]);

      expect(runners[0]).to.deep.eq(["e2e\\test.1.ts"]);
    });

    it(`outputs runners with system dependent paths: linux`, function () {
      sandbox.stub(process, "platform").value("linux");
      sandbox.stub(process, "cwd").returns("/test-project/");
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

      const fileName = "e2e/test.1.ts";

      const loadBalancer = new LoadBalancer();
      const runners = loadBalancer.performLoadBalancing(1, "e2e", [fileName]);

      expect(runners[0]).to.deep.eq(["e2e/test.1.ts"]);
    });
  });

  it("defaults to keep empty runners (needed for consistency's sake)", function () {
    stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

    const loadBalancer = new LoadBalancer();
    const runners = loadBalancer.performLoadBalancing(3, "e2e", []);
    expect(runners).to.have.lengthOf(3);
  });

  it("can retain empty runners when there are no files", function () {
    stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

    const loadBalancer = new LoadBalancer("weighted-largest");
    const runners = loadBalancer.performLoadBalancing(3, "e2e", []);
    expect(runners).to.have.lengthOf(3);
  });

  describe("load balancing algorithms", function () {
    context("defaults", function () {
      let output: string, write;
      //eslint-disable-next-line prefer-const
      write = process.stderr.write;

      beforeEach(function () {
        output = "";
        //@ts-expect-error Ignore
        process.stderr.write = function (str) {
          output += str;
        };
      });

      afterEach(function () {
        process.stderr.write = write;
      });

      it("defaults to weighted-largest", function () {
        const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/11-elements-600-time.json", { parseJSON: true });
        stubSpecMapReads(sandbox, { "spec-map.json": fixture });
        debugInitializer.enable("cypress-load-balancer");

        const loadBalancer = new LoadBalancer();
        loadBalancer.performLoadBalancing(4, "e2e", ["file.cy.ts"]);

        expect(output).to.include("Using algorithm for load balancing: weighted-largest");
      });
    });

    it("throws an error on unknown algorithm", function () {
      // @ts-expect-error Need to input a non-allowable value
      expect(() => new LoadBalancer("FAKE").performLoadBalancing(4, "e2e", ["foo.test.js"])).to.throw(
        "Algorithm not known for FAKE"
      );
    });

    context("weighted-largest", function () {
      beforeEach(function () {
        const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/11-elements-600-time.json", { parseJSON: true });
        this.jsonFixture = fixture;
        this.filePaths = Object.keys(fixture.e2e);
      });

      context("simple balancing cases", function () {
        beforeEach(function () {
          stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        });
        it("can balance for 1 runner", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(1, "e2e", filePaths);
          expect(runners).to.deep.equal([
            [
              "150.1.test.ts",
              "100.1.test.ts",
              "75.1.test.ts",
              "75.2.test.ts",
              "75.3.test.ts",
              "50.1.test.ts",
              "25.1.test.ts",
              "25.2.test.ts",
              "10.1.test.ts",
              "10.2.test.ts",
              "5.1.test.ts"
            ]
          ]);
        });

        it("can balance for 3 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", filePaths);

          const expectedRunTime = 200;

          expect(getTotalMedianTime(this.jsonFixture, "e2e", runners[0])).to.eq(expectedRunTime);
          for (const r of runners) assertTotalRunnerTime(this.jsonFixture, "e2e", r, expectedRunTime);
          expect(runners).to.deep.equal([
            //200 median time
            ["100.1.test.ts", "75.3.test.ts", "10.1.test.ts", "10.2.test.ts", "5.1.test.ts"],
            //200 median time
            ["150.1.test.ts", "25.1.test.ts", "25.2.test.ts"],
            //200 median time
            ["75.1.test.ts", "75.2.test.ts", "50.1.test.ts"]
          ]);
        });

        it("can balance for 4 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(4, "e2e", filePaths);

          const expectedRunTime = 150;

          expect(getTotalMedianTime(this.jsonFixture, "e2e", runners[0])).to.eq(expectedRunTime);
          for (const r of runners) assertTotalRunnerTime(this.jsonFixture, "e2e", r, expectedRunTime);
          expect(runners).to.deep.equal([
            ["100.1.test.ts", "25.1.test.ts", "10.1.test.ts", "10.2.test.ts", "5.1.test.ts"],
            ["75.2.test.ts", "50.1.test.ts", "25.2.test.ts"],
            ["75.1.test.ts", "75.3.test.ts"],
            ["150.1.test.ts"]
          ]);
        });

        it("can balance for 6 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(6, "e2e", filePaths);

          expect(runners).to.deep.equal([
            //150 Total run time
            ["150.1.test.ts"],
            //105 Total run time
            ["100.1.test.ts", "5.1.test.ts"],
            //100 Total run time
            ["75.1.test.ts", "25.2.test.ts"],
            //85 Total run time
            ["75.2.test.ts", "10.1.test.ts"],
            //85 Total run time
            ["75.3.test.ts", "10.2.test.ts"],
            //75 Total run time
            ["50.1.test.ts", "25.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([
            150, 105, 100, 85, 85, 75
          ]);
        });
      });

      it("can handle more runners than files", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const filePaths = this.filePaths;
        const runners = new LoadBalancer("weighted-largest").performLoadBalancing(
          filePaths.length + 1,
          "e2e",
          filePaths
        );
        expect(runners.filter((r) => r.length === 0)).to.have.lengthOf(1);
        expect(runners.filter((r) => r.length === 1)).to.have.lengthOf(filePaths.length);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const fourFiles = this.filePaths.slice(0, 3);
        const runners = new LoadBalancer("weighted-largest").performLoadBalancing(2, "e2e", fourFiles);
        expect(runners[0]).to.deep.eq(["100.1.test.ts", "75.1.test.ts"]);
        expect(runners[1]).to.deep.eq(["150.1.test.ts"]);
      });

      it("can differentiate specs between e2e and component", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const e2eFilePaths = Object.keys(this.jsonFixture.e2e);
        const lb = new LoadBalancer("weighted-largest");

        const e2eRunners = lb.performLoadBalancing(1, "e2e", e2eFilePaths);
        expect(e2eRunners).to.deep.eq([
          [
            "150.1.test.ts",
            "100.1.test.ts",
            "75.1.test.ts",
            "75.2.test.ts",
            "75.3.test.ts",
            "50.1.test.ts",
            "25.1.test.ts",
            "25.2.test.ts",
            "10.1.test.ts",
            "10.2.test.ts",
            "5.1.test.ts"
          ]
        ]);

        const componentFilePaths = Object.keys(this.jsonFixture.component);
        const componentRunners = lb.performLoadBalancing(1, "component", componentFilePaths);
        expect(componentRunners).to.deep.eq([
          ["50.1.test.ct.ts", "10.1.test.ct.ts", "10.2.test.ct.ts", "5.1.test.ct.ts"]
        ]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const e2eFilePaths = [...Object.keys(this.jsonFixture.e2e), "newFile.test.ts"];

        const runners = new LoadBalancer("weighted-largest").performLoadBalancing(1, "e2e", e2eFilePaths);
        expect(runners).to.deep.eq([
          [
            "150.1.test.ts",
            "100.1.test.ts",
            "75.1.test.ts",
            "75.2.test.ts",
            "75.3.test.ts",
            "50.1.test.ts",
            "25.1.test.ts",
            "25.2.test.ts",
            "10.1.test.ts",
            "10.2.test.ts",
            "5.1.test.ts",
            "newFile.test.ts"
          ]
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(
          "newFile.test.ts"
        );
      });

      it("can handle a brand new map", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

        const newFiles = [
          "newFile.1.test.ts",
          "newFile.2.test.ts",
          "newFile.3.test.ts",
          "newFile.4.test.ts",
          "newFile.5.test.ts",
          "newFile.6.test.ts",
          "newFile.7.test.ts",
          "newFile.8.test.ts"
        ];

        const runners = new LoadBalancer("weighted-largest").performLoadBalancing(2, "e2e", newFiles);

        expect(runners).to.deep.equal([
          ["newFile.1.test.ts", "newFile.3.test.ts", "newFile.5.test.ts", "newFile.7.test.ts"],
          ["newFile.2.test.ts", "newFile.4.test.ts", "newFile.6.test.ts", "newFile.8.test.ts"]
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;

        const outputtedFile = this.writeFileSyncStub.firstCall.args[1] as string;
        const e2eFileKeys = Object.keys(JSON.parse(outputtedFile).e2e);
        expect(e2eFileKeys).to.deep.eq(newFiles);
        expect(e2eFileKeys.length).to.eq(newFiles.length);
      });

      context("specific cases based on time distribution", function () {
        beforeEach(function () {
          sandbox.restore();
          const { writeFileSyncStub } = baseStubs();
          this.writeFileSyncStub = writeFileSyncStub;
        });

        it("every test file has equal (median) time (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/all-equal-time.json", { parseJSON: true });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", this.filePaths);

          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([300, 300, 300]);
          expect(runners).to.deep.equal([
            ["100.1.test.ts", "100.4.test.ts", "100.7.test.ts"],
            ["100.2.test.ts", "100.5.test.ts", "100.8.test.ts"],
            ["100.3.test.ts", "100.6.test.ts", "100.9.test.ts"]
          ]);
        });

        it("bell-curve distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/bell-curve.json", { parseJSON: true });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);
          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", this.filePaths);

          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([601, 600, 600]);
          expect(runners).to.deep.equal([
            [
              "90.1.test.ts",
              "80.1.test.ts",
              "70.1.test.ts",
              "70.4.test.ts",
              "60.5.test.ts",
              "50.3.test.ts",
              "50.6.test.ts",
              "40.3.test.ts",
              "30.1.test.ts",
              "30.2.test.ts",
              "20.1.test.ts",
              "10.1.test.ts",
              "1.1.test.ts"
            ],
            [
              "90.2.test.ts",
              "80.2.test.ts",
              "70.2.test.ts",
              "60.1.test.ts",
              "60.3.test.ts",
              "50.1.test.ts",
              "50.4.test.ts",
              "40.1.test.ts",
              "40.4.test.ts",
              "30.3.test.ts",
              "20.2.test.ts",
              "10.2.test.ts"
            ],
            [
              "100.1.test.ts",
              "80.3.test.ts",
              "70.3.test.ts",
              "60.2.test.ts",
              "60.4.test.ts",
              "50.2.test.ts",
              "50.5.test.ts",
              "40.2.test.ts",
              "40.5.test.ts",
              "30.4.test.ts",
              "20.3.test.ts"
            ]
          ]);
        });

        it("extreme high values (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/extreme-highs.json", { parseJSON: true });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(2, "e2e", this.filePaths);

          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([2100, 2100]);
          expect(runners).to.deep.equal([
            ["500.1.test.ts", "500.3.test.ts", "500.5.test.ts", "500.7.test.ts", "100.1.test.ts"],
            ["500.2.test.ts", "500.4.test.ts", "500.6.test.ts", "500.8.test.ts", "100.2.test.ts"]
          ]);
        });

        it("extreme low values, example 1: sum of total low values equals highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/extreme-lows-equal-to-highest-value.json", {
            parseJSON: true
          });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(2, "e2e", this.filePaths);

          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([1000, 1000]);
          expect(runners).to.deep.equal([
            [
              "100.1.test.ts",
              "100.2.test.ts",
              "100.3.test.ts",
              "100.4.test.ts",
              "100.5.test.ts",
              "100.6.test.ts",
              "100.7.test.ts",
              "100.8.test.ts",
              "100.9.test.ts",
              "100.10.test.ts"
            ],
            ["1000.1.test.ts"]
          ]);
        });

        it("extreme low values, example 2: sum of total low values is greater than highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>(
            "spec-map/extreme-lows-greater-than-highest-value.json",
            {
              parseJSON: true
            }
          );
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(2, "e2e", this.filePaths);
          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([1100, 1000]);
          expect(runners).to.deep.equal([
            [
              "100.1.test.ts",
              "100.2.test.ts",
              "100.3.test.ts",
              "100.4.test.ts",
              "100.5.test.ts",
              "100.6.test.ts",
              "100.7.test.ts",
              "100.8.test.ts",
              "100.9.test.ts",
              "100.10.test.ts",
              "100.11.test.ts"
            ],
            ["1000.1.test.ts"]
          ]);
        });

        it("extreme center distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/extreme-center-distribution.json", {
            parseJSON: true
          });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", this.filePaths);
          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([270, 270, 260]);
          expect(runners).to.deep.equal([
            ["100.1.test.ts", "50.1.test.ts", "50.2.test.ts", "50.5.test.ts", "20.1.test.ts"],
            ["90.1.test.ts", "60.1.test.ts", "50.4.test.ts", "40.1.test.ts", "30.1.test.ts"],
            ["80.1.test.ts", "70.1.test.ts", "50.3.test.ts", "50.6.test.ts", "10.1.test.ts"]
          ]);
        });

        it("extreme end distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/extreme-ends-distribution.json", {
            parseJSON: true
          });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", this.filePaths);
          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([300, 290, 290]);
          expect(runners).to.deep.equal([
            [
              "100.2.test.ts",
              "90.1.test.ts",
              "60.1.test.ts",
              "20.1.test.ts",
              "10.1.test.ts",
              "10.3.test.ts",
              "10.4.test.ts"
            ],
            ["100.3.test.ts", "80.1.test.ts", "70.1.test.ts", "30.1.test.ts", "10.2.test.ts"],
            ["100.1.test.ts", "100.4.test.ts", "50.1.test.ts", "40.1.test.ts"]
          ]);
        });

        it("uniform distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/uniform-distribution.json", {
            parseJSON: true
          });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);

          const runners = new LoadBalancer("weighted-largest").performLoadBalancing(3, "e2e", this.filePaths);
          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([600, 600, 600]);
          expect(runners).to.deep.equal([
            ["200.1.test.ts", "200.4.test.ts", "100.1.test.ts", "100.4.test.ts"],
            ["200.2.test.ts", "200.5.test.ts", "100.2.test.ts", "100.5.test.ts"],
            ["200.3.test.ts", "200.6.test.ts", "100.3.test.ts", "100.6.test.ts"]
          ]);
        });
      });
    });

    context("round-robin", function () {
      beforeEach(function () {
        //SLOWEST TO FASTEST: "median.4000.test.ts", "median.1000.test.ts", "median.300.test.ts", "median.200.test.ts", "median.50.test.ts", "median.1.test.ts"
        this.jsonFixture = getFixture<LoadBalancingMapJSONFile>("spec-map/generic.json", { parseJSON: true });
      });

      context("simple balancing cases", function () {
        beforeEach(function () {
          sandbox.restore();
          const { writeFileSyncStub } = baseStubs();
          this.writeFileSyncStub = writeFileSyncStub;

          const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/11-elements-600-time.json", {
            parseJSON: true
          });
          stubSpecMapReads(sandbox, { "spec-map.json": fixture });
          this.jsonFixture = fixture;
          this.filePaths = Object.keys(this.jsonFixture.e2e);
        });

        it("balances for 1 runner", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("round-robin").performLoadBalancing(1, "e2e", filePaths);
          expect(runners).to.deep.equal([
            [
              "150.1.test.ts",
              "100.1.test.ts",
              "75.1.test.ts",
              "75.2.test.ts",
              "75.3.test.ts",
              "50.1.test.ts",
              "25.1.test.ts",
              "25.2.test.ts",
              "10.1.test.ts",
              "10.2.test.ts",
              "5.1.test.ts"
            ]
          ]);
        });

        it("can balance for 3 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("round-robin").performLoadBalancing(3, "e2e", filePaths);
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "75.2.test.ts", "25.1.test.ts", "10.2.test.ts"],
            ["100.1.test.ts", "75.3.test.ts", "25.2.test.ts", "5.1.test.ts"],
            ["75.1.test.ts", "50.1.test.ts", "10.1.test.ts"]
          ]);

          //Super imbalanced -- need to improve on this algorithm
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[0], 260);
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[1], 205);
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[2], 135);
        });

        it("can balance for 4 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("round-robin").performLoadBalancing(4, "e2e", filePaths);
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "75.3.test.ts", "10.1.test.ts"],
            ["100.1.test.ts", "50.1.test.ts", "10.2.test.ts"],
            ["75.1.test.ts", "25.1.test.ts", "5.1.test.ts"],
            ["75.2.test.ts", "25.2.test.ts"]
          ]);

          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[0], 235);
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[1], 160);
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[2], 105);
          assertTotalRunnerTime(this.jsonFixture, "e2e", runners[3], 100);
        });

        it("can balance for 6 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = new LoadBalancer("round-robin").performLoadBalancing(6, "e2e", filePaths);
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "25.1.test.ts"],
            ["100.1.test.ts", "25.2.test.ts"],
            ["75.1.test.ts", "10.1.test.ts"],
            ["75.2.test.ts", "10.2.test.ts"],
            ["75.3.test.ts", "5.1.test.ts"],
            ["50.1.test.ts"]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.jsonFixture, "e2e", r))).to.deep.equal([
            175, 125, 85, 85, 80, 50
          ]);
        });
      });

      it("sorts files slowest to fastest", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const filePaths = Object.keys(this.jsonFixture.e2e);
        const runners = new LoadBalancer("round-robin").performLoadBalancing(1, "e2e", filePaths);
        expect(runners[0]).to.deep.eq([
          "median.4000.test.ts",
          "median.1000.test.ts",
          "median.300.test.ts",
          "median.200.test.ts",
          "median.50.test.ts",
          "median.1.test.ts"
        ]);
      });

      it("balances files per runner equally", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const filePaths = Object.keys(this.jsonFixture.e2e);
        const runners = new LoadBalancer("round-robin").performLoadBalancing(3, "e2e", filePaths);
        expect(runners).to.have.lengthOf(3);
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.200.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.50.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts", "median.1.test.ts"]);
      });

      it("can handle balancing runners when files cannot be balanced equally across them", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const filePaths = Object.keys(this.jsonFixture.e2e);
        const runners = new LoadBalancer("round-robin").performLoadBalancing(4, "e2e", filePaths);
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.50.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.1.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts"]);
        expect(runners[3]).to.deep.eq(["median.200.test.ts"]);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const runners = new LoadBalancer("round-robin").performLoadBalancing(2, "e2e", [
          "median.4000.test.ts",
          "median.300.test.ts",
          "median.1.test.ts"
        ]);
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.1.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.300.test.ts"]);
      });

      it("can handle less files than runners", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const filePaths = Object.keys(this.jsonFixture.e2e);
        const runners = new LoadBalancer("round-robin").performLoadBalancing(filePaths.length + 1, "e2e", filePaths);
        expect(runners[0]).to.have.lengthOf(1);
        expect(runners[runners.length - 1]).to.have.lengthOf(0);
      });

      it("can differentiate specs between e2e and component", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const e2eRunners = new LoadBalancer("round-robin").performLoadBalancing(1, "e2e", [
          "median.200.test.ts",
          "median.300.test.ts"
        ]);
        const componentRunners = new LoadBalancer("round-robin").performLoadBalancing(1, "component", [
          "median.50.test.ct.ts",
          "median.100.test.ct.ts"
        ]);
        expect(e2eRunners[0]).to.deep.eq(["median.300.test.ts", "median.200.test.ts"]);
        expect(componentRunners[0]).to.deep.eq(["median.50.test.ct.ts", "median.100.test.ct.ts"]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": this.jsonFixture });
        const e2eFilePaths = [...Object.keys(this.jsonFixture.e2e), "newFile.test.ts"];

        const runners = new LoadBalancer("round-robin").performLoadBalancing(1, "e2e", e2eFilePaths);
        expect(runners).to.deep.eq([
          [
            "median.4000.test.ts",
            "median.1000.test.ts",
            "median.300.test.ts",
            "median.200.test.ts",
            "median.50.test.ts",
            "median.1.test.ts",
            "newFile.test.ts"
          ]
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(
          "newFile.test.ts"
        );
      });

      it("can handle a brand new map", function () {
        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

        const newFiles = [
          "newFile.1.test.ts",
          "newFile.2.test.ts",
          "newFile.3.test.ts",
          "newFile.4.test.ts",
          "newFile.5.test.ts",
          "newFile.6.test.ts",
          "newFile.7.test.ts",
          "newFile.8.test.ts"
        ];

        const runners = new LoadBalancer("round-robin").performLoadBalancing(2, "e2e", newFiles);

        expect(runners).to.deep.equal([
          ["newFile.1.test.ts", "newFile.3.test.ts", "newFile.5.test.ts", "newFile.7.test.ts"],
          ["newFile.2.test.ts", "newFile.4.test.ts", "newFile.6.test.ts", "newFile.8.test.ts"]
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;

        const outputtedFile = this.writeFileSyncStub.firstCall.args[1] as string;
        const e2eFileKeys = Object.keys(JSON.parse(outputtedFile).e2e);
        expect(e2eFileKeys).to.deep.eq(newFiles);
        expect(e2eFileKeys.length).to.eq(newFiles.length);
      });
    });

    context("file-name", function () {
      beforeEach(function () {
        const fixture = getFixture<LoadBalancingMapJSONFile>("spec-map/12-elements-alphabetical.json", {
          parseJSON: true
        });
        stubSpecMapReads(sandbox, { "spec-map.json": fixture });
        this.jsonFixture = fixture;
        this.filePaths = Object.keys(this.jsonFixture.e2e);
      });

      it("balances for 1 runner", function () {
        const filePaths = this.filePaths;
        const runners = new LoadBalancer("file-name").performLoadBalancing(1, "e2e", filePaths);
        expect(runners).to.deep.equal([
          [
            "a.test.ts",
            "b.test.ts",
            "c.test.ts",
            "d.test.ts",
            "e.test.ts",
            "f.test.ts",
            "g.test.ts",
            "h.test.ts",
            "i.test.ts",
            "j.test.ts",
            "k.test.ts",
            "l.test.ts"
          ]
        ]);
      });

      it("can balance for 2 runners", function () {
        const filePaths = this.filePaths;
        const runners = new LoadBalancer("file-name").performLoadBalancing(2, "e2e", filePaths);
        expect(runners).to.deep.equal([
          ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts", "e.test.ts", "f.test.ts"],
          ["g.test.ts", "h.test.ts", "i.test.ts", "j.test.ts", "k.test.ts", "l.test.ts"]
        ]);
      });

      it("can balance for an uneven runners to files", function () {
        const filePaths = this.filePaths;
        const runners = new LoadBalancer("file-name").performLoadBalancing(5, "e2e", filePaths);
        expect(runners).to.deep.equal([
          ["a.test.ts", "b.test.ts", "c.test.ts"],
          ["d.test.ts", "e.test.ts", "f.test.ts"],
          ["g.test.ts", "h.test.ts"],
          ["i.test.ts", "j.test.ts"],
          ["k.test.ts", "l.test.ts"]
        ]);
      });

      it("sorts files by file name", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(1, "e2e", this.filePaths);
        expect(runners).to.deep.equal([
          [
            "a.test.ts",
            "b.test.ts",
            "c.test.ts",
            "d.test.ts",
            "e.test.ts",
            "f.test.ts",
            "g.test.ts",
            "h.test.ts",
            "i.test.ts",
            "j.test.ts",
            "k.test.ts",
            "l.test.ts"
          ]
        ]);
      });

      it("treats file names case-insensitively", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(1, "e2e", ["a.test.ts", "Z.test.ts"]);
        expect(runners[0]).to.deep.eq(["a.test.ts", "Z.test.ts"]);
      });

      it("balances files per runner so files are evenly spread across runner", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(3, "e2e", this.filePaths);
        expect(runners.every((r) => r.length === 4)).to.be.true;
        expect(runners).to.deep.equal([
          ["a.test.ts", "b.test.ts", "c.test.ts", "d.test.ts"],
          ["e.test.ts", "f.test.ts", "g.test.ts", "h.test.ts"],
          ["i.test.ts", "j.test.ts", "k.test.ts", "l.test.ts"]
        ]);
      });

      it("can handle balancing runners when files cannot be evenly spread across them", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(5, "e2e", this.filePaths);
        expect(runners).to.deep.equal([
          ["a.test.ts", "b.test.ts", "c.test.ts"],
          ["d.test.ts", "e.test.ts", "f.test.ts"],
          ["g.test.ts", "h.test.ts"],
          ["i.test.ts", "j.test.ts"],
          ["k.test.ts", "l.test.ts"]
        ]);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(2, "e2e", [
          "a.test.ts",
          "b.test.ts",
          "c.test.ts"
        ]);
        expect(runners[0]).to.deep.eq(["a.test.ts", "b.test.ts"]);
        expect(runners[1]).to.deep.eq(["c.test.ts"]);
      });

      it("can handle less files than runners", function () {
        const filePaths = Object.keys(this.jsonFixture.e2e);
        const runners = new LoadBalancer("file-name").performLoadBalancing(filePaths.length + 1, "e2e", filePaths);
        expect(runners[0]).to.have.lengthOf(1);
        expect(runners[runners.length - 1]).to.have.lengthOf(0);
      });

      it("can differentiate specs between e2e and component", function () {
        const e2eRunners = new LoadBalancer("file-name").performLoadBalancing(
          1,
          "e2e",
          Object.keys(this.jsonFixture.e2e)
        );
        const componentRunners = new LoadBalancer("file-name").performLoadBalancing(
          1,
          "component",
          Object.keys(this.jsonFixture.component)
        );
        expect(e2eRunners[0]).to.deep.eq([
          "a.test.ts",
          "b.test.ts",
          "c.test.ts",
          "d.test.ts",
          "e.test.ts",
          "f.test.ts",
          "g.test.ts",
          "h.test.ts",
          "i.test.ts",
          "j.test.ts",
          "k.test.ts",
          "l.test.ts"
        ]);
        expect(componentRunners[0]).to.deep.eq(["a.ct.ts", "b.ct.ts", "c.ct.ts"]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function () {
        const runners = new LoadBalancer("file-name").performLoadBalancing(1, "e2e", ["a.test.ts", "z.test.ts"]);
        expect(runners[0]).to.deep.eq(["a.test.ts", "z.test.ts"]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty("z.test.ts");
      });

      it("can handle a brand new map", function () {
        const newFiles = [
          "newFile.1.test.ts",
          "newFile.2.test.ts",
          "newFile.3.test.ts",
          "newFile.4.test.ts",
          "newFile.5.test.ts",
          "newFile.6.test.ts"
        ];
        const runners = new LoadBalancer("file-name").performLoadBalancing(2, "e2e", newFiles);
        expect(runners).to.deep.equal([
          ["newFile.1.test.ts", "newFile.2.test.ts", "newFile.3.test.ts"],
          ["newFile.4.test.ts", "newFile.5.test.ts", "newFile.6.test.ts"]
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;

        newFiles.map((nf) => {
          expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(nf);
        });
      });
    });
  });
});
