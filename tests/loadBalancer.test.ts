//eslint-disable @typescript-eslint/no-unused-expressions
import { expect } from "chai";
import sinon from "sinon";
import utils from "../src/utils";
import performLoadBalancing from "../src/loadBalancer";
import fs from "node:fs";
import { getFixture, stubReadLoadBalancerFile } from "./support/utils";
import { FilePath, LoadBalancingMap, TestingType } from "../src/types";

//eslint-disable-next-line prefer-const
let sandbox = sinon.createSandbox();

const getTotalMedianTime = (loadBalancerFile: LoadBalancingMap, testingType: TestingType, fps: FilePath[]) =>
  fps.map((f) => loadBalancerFile[testingType][f].stats.median).reduce((acc, next) => acc + next, 0);
const assertTotalRunnerTime = (
  loadBalancerFile: LoadBalancingMap,
  testingType: TestingType,
  runner: FilePath[],
  expectedTime: number
) => {
  expect(getTotalMedianTime(loadBalancerFile, testingType, runner)).to.eq(expectedTime);
};

describe("Load balancing", function () {
  beforeEach(function () {
    this.initializeLoadBalancingFilesStub = sandbox.stub(utils, "initializeLoadBalancingFiles");
  });
  afterEach(function () {
    sandbox.restore();
  });

  context("preparation", function () {
    it("cannot accept a runner count less than 1", function () {
      expect(() => performLoadBalancing(0, "e2e", [])).to.throw("Runner count cannot be less than 1");
      expect(() => performLoadBalancing(-1, "e2e", [])).to.throw("Runner count cannot be less than 1");
    });

    it("runs file initialization", function () {
      stubReadLoadBalancerFile(sandbox);
      performLoadBalancing(3, "e2e", []);
      expect(this.initializeLoadBalancingFilesStub.calledOnce).to.be.true;
    });
  });

  it("can remove empty runners if there are no files", function () {
    stubReadLoadBalancerFile(sandbox);
    const runners = performLoadBalancing(3, "e2e", [], "weighted-largest", { removeEmptyRunners: true });
    expect(runners).to.have.lengthOf(0);
  });

  it("defaults to remove empty runners", function () {
    stubReadLoadBalancerFile(sandbox);
    const runners = performLoadBalancing(3, "e2e", []);
    expect(runners).to.have.lengthOf(0);
  });

  it("can keep empty runners when the option is specified", function () {
    stubReadLoadBalancerFile(sandbox);
    const runners = performLoadBalancing(3, "e2e", [], "weighted-largest", { removeEmptyRunners: false });
    expect(runners).to.have.lengthOf(3);
  });

  describe("load balancing algorithms", function () {
    it("defaults to weighted-largest", function () {
      const fixture = getFixture<LoadBalancingMap>("spec-map/11-elements-600-time.json", { parseJSON: true });
      stubReadLoadBalancerFile(sandbox, fixture);
      this.loadBalancingMap = fixture;
      sandbox.stub(fs, "writeFileSync");

      const callable = { performLoadBalancing: performLoadBalancing };
      const spy = sinon.spy(utils, "DEBUG");
      callable.performLoadBalancing(4, "e2e", ["file.cy.ts"]);
      expect(spy).to.have.been.calledWith(`Using algorithm for load balancing: weighted-largest`, "weighted-largest");
    });

    it("throws an error on unknown algorithm", function () {
      const fixture = getFixture<LoadBalancingMap>("spec-map/generic.json", { parseJSON: true });
      stubReadLoadBalancerFile(sandbox, fixture);
      this.loadBalancingMap = fixture;
      sandbox.stub(fs, "writeFileSync");
      expect(() => performLoadBalancing(4, "e2e", ["file.cy.ts"], "FAKE" as never)).to.throw(
        "Algorithm not known for FAKE"
      );
    });

    context("weighted-largest", function () {
      beforeEach(function () {
        const fixture = getFixture<LoadBalancingMap>("spec-map/11-elements-600-time.json", { parseJSON: true });
        stubReadLoadBalancerFile(sandbox, fixture);
        this.loadBalancingMap = fixture;
        this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
        this.filePaths = Object.keys(this.loadBalancingMap.e2e);
      });

      context("simple balancing cases", function () {
        it("balances for 1 runner", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(1, "e2e", filePaths, "weighted-largest");
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
          const runners = performLoadBalancing(3, "e2e", filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            //200 median time
            ["100.1.test.ts", "75.1.test.ts", "10.2.test.ts", "10.1.test.ts", "5.1.test.ts"],
            //200 median time
            ["150.1.test.ts", "25.2.test.ts", "25.1.test.ts"],
            //200 median time
            ["75.3.test.ts", "75.2.test.ts", "50.1.test.ts"]
          ]);

          const expectedTime = getTotalMedianTime(this.loadBalancingMap, "e2e", runners[0]);
          runners.every((r) => assertTotalRunnerTime(this.loadBalancingMap, "e2e", r, expectedTime));
        });

        it("can balance for 4 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(4, "e2e", filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            //150 total run time
            ["100.1.test.ts", "25.2.test.ts", "10.2.test.ts", "10.1.test.ts", "5.1.test.ts"],
            //150 total run time
            ["75.2.test.ts", "50.1.test.ts", "25.1.test.ts"],
            //150 total run time
            ["75.3.test.ts", "75.1.test.ts"],
            //150 total run time
            ["150.1.test.ts"]
          ]);

          const expectedTime = getTotalMedianTime(this.loadBalancingMap, "e2e", runners[0]);
          for (const r of runners) assertTotalRunnerTime(this.loadBalancingMap, "e2e", r, expectedTime);
        });

        it("can balance for 6 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(6, "e2e", filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            //75 Total run time
            ["50.1.test.ts", "25.2.test.ts"],
            //100 Total run time
            ["75.3.test.ts", "25.1.test.ts"],
            //85 Total run time
            ["75.2.test.ts", "10.2.test.ts"],
            //85 Total run time
            ["75.1.test.ts", "10.1.test.ts"],
            //105 Total run time
            ["100.1.test.ts", "5.1.test.ts"],
            //150 Total run time
            ["150.1.test.ts"]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            75, 100, 85, 85, 105, 150
          ]);
        });
      });

      it("can handle more runners than files", function () {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "weighted-largest", {
          removeEmptyRunners: false
        });
        expect(runners.filter((r) => r.length === 0)).to.have.lengthOf(1);
        expect(runners.filter((r) => r.length === 1)).to.have.lengthOf(filePaths.length);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function () {
        const fourFiles = this.filePaths.slice(0, 3);
        const runners = performLoadBalancing(2, "e2e", fourFiles, "weighted-largest");
        expect(runners[0]).to.deep.eq(["100.1.test.ts", "75.1.test.ts"]);
        expect(runners[1]).to.deep.eq(["150.1.test.ts"]);
      });

      it("can differentiate specs between e2e and component", function () {
        const e2eFilePaths = Object.keys(this.loadBalancingMap.e2e);
        const e2eRunners = performLoadBalancing(1, "e2e", e2eFilePaths, "weighted-largest");
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

        const componentFilePaths = Object.keys(this.loadBalancingMap.component);
        const componentRunners = performLoadBalancing(1, "component", componentFilePaths, "weighted-largest");
        expect(componentRunners).to.deep.eq([
          ["50.1.test.ct.ts", "10.1.test.ct.ts", "10.2.test.ct.ts", "5.1.test.ct.ts"]
        ]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function () {
        this.writeFileSyncStub = this.writeFileSyncStub.withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
        const e2eFilePaths = [...Object.keys(this.loadBalancingMap.e2e), "newFile.test.ts"];

        const runners = performLoadBalancing(1, "e2e", e2eFilePaths, "weighted-largest");
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
        this.writeFileSyncStub = this.writeFileSyncStub.withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
        const runners = performLoadBalancing(2, "e2e", ["newFile.test.ts", "newFile.2.test.ts"], "weighted-largest");
        expect(runners).to.deep.eq([["newFile.2.test.ts"], ["newFile.test.ts"]]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(
          "newFile.test.ts"
        );
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(
          "newFile.2.test.ts"
        );
      });

      context("specific cases based on time distribution", function () {
        beforeEach(function () {
          sandbox.restore();
          this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
        });

        it("every test file has equal (median) time (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/all-equal-time.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            ["100.9.test.ts", "100.6.test.ts", "100.4.test.ts"],
            ["100.8.test.ts", "100.5.test.ts", "100.3.test.ts"],
            ["100.7.test.ts", "100.1.test.ts", "100.2.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            300, 300, 300
          ]);
        });

        it("bell-curve distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/bell-curve.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            [
              "90.2.test.ts",
              "80.3.test.ts",
              "70.4.test.ts",
              "70.1.test.ts",
              "60.1.test.ts",
              "50.4.test.ts",
              "50.1.test.ts",
              "40.3.test.ts",
              "30.4.test.ts",
              "30.3.test.ts",
              "20.3.test.ts",
              "10.2.test.ts"
            ],
            [
              "90.1.test.ts",
              "80.2.test.ts",
              "70.3.test.ts",
              "60.5.test.ts",
              "60.3.test.ts",
              "50.6.test.ts",
              "50.3.test.ts",
              "40.5.test.ts",
              "40.2.test.ts",
              "30.2.test.ts",
              "20.2.test.ts",
              "10.1.test.ts"
            ],
            [
              "100.1.test.ts",
              "80.1.test.ts",
              "70.2.test.ts",
              "60.4.test.ts",
              "60.2.test.ts",
              "50.5.test.ts",
              "50.2.test.ts",
              "40.4.test.ts",
              "40.1.test.ts",
              "30.1.test.ts",
              "20.1.test.ts",
              "1.1.test.ts"
            ]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            600, 600, 601
          ]);
        });

        it("extreme high values (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-highs.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            ["500.8.test.ts", "500.6.test.ts", "500.4.test.ts", "500.2.test.ts", "100.2.test.ts"],
            ["500.7.test.ts", "100.1.test.ts", "500.5.test.ts", "500.3.test.ts", "500.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([2100, 2100]);
        });

        it("extreme low values, example 1: sum of total low values equals highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-lows-equal-to-highest-value.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            [
              "100.10.test.ts",
              "100.9.test.ts",
              "100.8.test.ts",
              "100.7.test.ts",
              "100.6.test.ts",
              "100.5.test.ts",
              "100.4.test.ts",
              "100.3.test.ts",
              "100.2.test.ts",
              "100.1.test.ts"
            ],
            ["1000.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([1000, 1000]);
        });

        it("extreme low values, example 2: sum of total low values is greater than highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-lows-greater-than-highest-value.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            [
              "100.11.test.ts",
              "100.10.test.ts",
              "100.9.test.ts",
              "100.8.test.ts",
              "100.7.test.ts",
              "100.6.test.ts",
              "100.5.test.ts",
              "100.4.test.ts",
              "100.3.test.ts",
              "100.2.test.ts"
            ],
            ["1000.1.test.ts", "100.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([1000, 1100]);
        });

        it("extreme center distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-center-distribution.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            ["90.1.test.ts", "60.1.test.ts", "10.1.test.ts", "50.3.test.ts", "40.1.test.ts", "30.1.test.ts"],
            ["100.1.test.ts", "50.6.test.ts", "50.5.test.ts", "50.2.test.ts"],
            ["80.1.test.ts", "70.1.test.ts", "50.4.test.ts", "50.1.test.ts", "20.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            280, 250, 270
          ]);
        });

        it("extreme end distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-ends-distribution.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            ["100.3.test.ts", "90.1.test.ts", "70.1.test.ts", "20.1.test.ts", "10.3.test.ts"],
            ["100.4.test.ts", "100.1.test.ts", "50.1.test.ts", "30.1.test.ts", "10.4.test.ts"],
            ["100.2.test.ts", "10.1.test.ts", "80.1.test.ts", "60.1.test.ts", "40.1.test.ts", "10.2.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            290, 290, 300
          ]);
        });

        it("uniform distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/uniform-distribution.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
          expect(runners).to.deep.equal([
            ["200.6.test.ts", "200.3.test.ts", "100.6.test.ts", "100.4.test.ts"],
            ["200.5.test.ts", "200.2.test.ts", "100.5.test.ts", "100.3.test.ts"],
            ["200.4.test.ts", "100.1.test.ts", "200.1.test.ts", "100.2.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            600, 600, 600
          ]);
        });
      });
    });

    context("round-robin", function () {
      beforeEach(function () {
        //SLOWEST TO FASTEST: "median.4000.test.ts", "median.1000.test.ts", "median.300.test.ts", "median.200.test.ts", "median.50.test.ts", "median.1.test.ts"
        const fixture = getFixture<LoadBalancingMap>("spec-map/generic.json", { parseJSON: true });
        stubReadLoadBalancerFile(sandbox, fixture);

        this.loadBalancingMap = fixture;
      });

      context("simple balancing cases", function () {
        beforeEach(function () {
          sandbox.restore();
          const fixture = getFixture<LoadBalancingMap>("spec-map/11-elements-600-time.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);
        });

        it("balances for 1 runner", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(1, "e2e", filePaths, "round-robin");
          expect(runners).to.deep.equal([
            [
              "150.1.test.ts",
              "100.1.test.ts",
              "75.3.test.ts",
              "75.2.test.ts",
              "75.1.test.ts",
              "50.1.test.ts",
              "25.2.test.ts",
              "25.1.test.ts",
              "10.2.test.ts",
              "10.1.test.ts",
              "5.1.test.ts"
            ]
          ]);
        });

        it("can balance for 3 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(3, "e2e", filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "75.2.test.ts", "25.2.test.ts", "10.1.test.ts"],
            ["100.1.test.ts", "75.1.test.ts", "25.1.test.ts", "5.1.test.ts"],
            ["75.3.test.ts", "50.1.test.ts", "10.2.test.ts"]
          ]);

          //Super imbalanced -- need to improve on this algorithm
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[0], 260);
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[1], 205);
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[2], 135);
        });

        it("can balance for 4 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(4, "e2e", filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "75.1.test.ts", "10.2.test.ts"],
            ["100.1.test.ts", "50.1.test.ts", "10.1.test.ts"],
            ["75.3.test.ts", "25.2.test.ts", "5.1.test.ts"],
            ["75.2.test.ts", "25.1.test.ts"]
          ]);

          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[0], 235);
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[1], 160);
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[2], 105);
          assertTotalRunnerTime(this.loadBalancingMap, "e2e", runners[3], 100);
        });

        it("can balance for 6 runners with nearly even total time", function () {
          const filePaths = this.filePaths;
          const runners = performLoadBalancing(6, "e2e", filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["150.1.test.ts", "25.2.test.ts"],
            ["100.1.test.ts", "25.1.test.ts"],
            ["75.3.test.ts", "10.2.test.ts"],
            ["75.2.test.ts", "10.1.test.ts"],
            ["75.1.test.ts", "5.1.test.ts"],
            ["50.1.test.ts"]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            175, 125, 85, 85, 80, 50
          ]);
        });
      });

      it("sorts files slowest to fastest", function () {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(1, "e2e", filePaths, "round-robin");
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
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(3, "e2e", filePaths, "round-robin");
        expect(runners).to.have.lengthOf(3);
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.200.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.50.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts", "median.1.test.ts"]);
      });

      it("can handle balancing runners when files cannot be balanced equally across them", function () {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(4, "e2e", filePaths, "round-robin");
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.50.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.1.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts"]);
        expect(runners[3]).to.deep.eq(["median.200.test.ts"]);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function () {
        sandbox.stub(fs, "writeFileSync");
        const runners = performLoadBalancing(
          2,
          "e2e",
          ["median.4000.test.ts", "median.300.test.ts", "median.1.test.ts"],
          "round-robin"
        );
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.1.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.300.test.ts"]);
      });

      it("can handle less files than runners", function () {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "round-robin", {
          removeEmptyRunners: false
        });
        expect(runners[0]).to.have.lengthOf(1);
        expect(runners[runners.length - 1]).to.have.lengthOf(0);
      });

      it("can differentiate specs between e2e and component", function () {
        sandbox.stub(fs, "writeFileSync");
        const e2eRunners = performLoadBalancing(1, "e2e", ["median.200.test.ts", "median.300.test.ts"], "round-robin");
        const componentRunners = performLoadBalancing(
          1,
          "component",
          ["median.50.test.ct.ts", "median.100.test.ct.ts"],
          "round-robin"
        );
        expect(e2eRunners[0]).to.deep.eq(["median.300.test.ts", "median.200.test.ts"]);
        expect(componentRunners[0]).to.deep.eq(["median.50.test.ct.ts", "median.100.test.ct.ts"]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function () {
        const stub = sandbox.stub(fs, "writeFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
        const runners = performLoadBalancing(1, "e2e", ["median.200.test.ts", "newFile.test.ts"], "round-robin");
        expect(runners[0]).to.deep.eq(["median.200.test.ts", "newFile.test.ts"]);
        expect(stub.calledOnce).to.be.true;
        expect(JSON.parse(stub.firstCall.args[1] as string).e2e).to.haveOwnProperty("newFile.test.ts");
      });

      context("specific cases based on time distribution", function () {
        beforeEach(function () {
          sandbox.restore();
          this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
        });

        it("every test file has equal (median) time (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/all-equal-time.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["100.9.test.ts", "100.6.test.ts", "100.3.test.ts"],
            ["100.8.test.ts", "100.5.test.ts", "100.2.test.ts"],
            ["100.7.test.ts", "100.4.test.ts", "100.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            300, 300, 300
          ]);
        });

        it("bell-curve distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/bell-curve.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(3, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            [
              "100.1.test.ts",
              "80.3.test.ts",
              "70.4.test.ts",
              "70.1.test.ts",
              "60.3.test.ts",
              "50.6.test.ts",
              "50.3.test.ts",
              "40.5.test.ts",
              "40.2.test.ts",
              "30.3.test.ts",
              "20.3.test.ts",
              "10.2.test.ts"
            ],
            [
              "90.2.test.ts",
              "80.2.test.ts",
              "70.3.test.ts",
              "60.5.test.ts",
              "60.2.test.ts",
              "50.5.test.ts",
              "50.2.test.ts",
              "40.4.test.ts",
              "40.1.test.ts",
              "30.2.test.ts",
              "20.2.test.ts",
              "10.1.test.ts"
            ],
            [
              "90.1.test.ts",
              "80.1.test.ts",
              "70.2.test.ts",
              "60.4.test.ts",
              "60.1.test.ts",
              "50.4.test.ts",
              "50.1.test.ts",
              "40.3.test.ts",
              "30.4.test.ts",
              "30.1.test.ts",
              "20.1.test.ts",
              "1.1.test.ts"
            ]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            620, 600, 581
          ]);
        });

        it("extreme high values (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-highs.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["500.8.test.ts", "500.6.test.ts", "500.4.test.ts", "500.2.test.ts", "100.2.test.ts"],
            ["500.7.test.ts", "500.5.test.ts", "500.3.test.ts", "500.1.test.ts", "100.1.test.ts"]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([2100, 2100]);
        });

        it("extreme low values, example 1: sum of total low values equals highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-lows-equal-to-highest-value.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["1000.1.test.ts", "100.9.test.ts", "100.7.test.ts", "100.5.test.ts", "100.3.test.ts", "100.1.test.ts"],
            ["100.10.test.ts", "100.8.test.ts", "100.6.test.ts", "100.4.test.ts", "100.2.test.ts"]
          ]);
          //REALLY bad spread
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([1500, 500]);
        });

        it("extreme low values, example 2: sum of total low values is greater than highest value (2 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-lows-greater-than-highest-value.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(2, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["1000.1.test.ts", "100.10.test.ts", "100.8.test.ts", "100.6.test.ts", "100.4.test.ts", "100.2.test.ts"],
            ["100.11.test.ts", "100.9.test.ts", "100.7.test.ts", "100.5.test.ts", "100.3.test.ts", "100.1.test.ts"]
          ]);

          //REALLY bad spread
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([1500, 600]);
        });

        it("extreme center distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-center-distribution.json", {
            parseJSON: true
          });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["100.1.test.ts", "70.1.test.ts", "50.5.test.ts", "50.2.test.ts", "30.1.test.ts"],
            ["90.1.test.ts", "60.1.test.ts", "50.4.test.ts", "50.1.test.ts", "20.1.test.ts"],
            ["80.1.test.ts", "50.6.test.ts", "50.3.test.ts", "40.1.test.ts", "10.1.test.ts"]
          ]);

          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            300, 270, 230
          ]);
        });

        it("extreme end distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/extreme-ends-distribution.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["100.4.test.ts", "100.1.test.ts", "70.1.test.ts", "40.1.test.ts", "10.4.test.ts", "10.1.test.ts"],
            ["100.3.test.ts", "90.1.test.ts", "60.1.test.ts", "30.1.test.ts", "10.3.test.ts"],
            ["100.2.test.ts", "80.1.test.ts", "50.1.test.ts", "20.1.test.ts", "10.2.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            330, 290, 260
          ]);
        });

        it("uniform distribution (3 runners)", function () {
          const fixture = getFixture<LoadBalancingMap>("spec-map/uniform-distribution.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);
          this.loadBalancingMap = fixture;
          this.filePaths = Object.keys(this.loadBalancingMap.e2e);

          const runners = performLoadBalancing(3, "e2e", this.filePaths, "round-robin");
          expect(runners).to.deep.equal([
            ["200.6.test.ts", "200.3.test.ts", "100.6.test.ts", "100.3.test.ts"],
            ["200.5.test.ts", "200.2.test.ts", "100.5.test.ts", "100.2.test.ts"],
            ["200.4.test.ts", "200.1.test.ts", "100.4.test.ts", "100.1.test.ts"]
          ]);
          expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
            600, 600, 600
          ]);
        });
      });
    });
  });
});
