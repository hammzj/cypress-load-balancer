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

describe("Load balancing", function() {
  beforeEach(function() {
    this.initializeLoadBalancingFilesStub = sandbox.stub(utils, "initializeLoadBalancingFiles");
  });
  afterEach(function() {
    sandbox.restore();
  });


  context("preparation", function() {
    it("cannot accept a runner count less than 1", function() {
      expect(() => performLoadBalancing(0, "e2e", [])).to.throw("Runner count cannot be less than 1");
      expect(() => performLoadBalancing(-1, "e2e", [])).to.throw("Runner count cannot be less than 1");
    });

    it("runs file initialization", function() {
      stubReadLoadBalancerFile(sandbox);
      performLoadBalancing(3, "e2e", []);
      expect(this.initializeLoadBalancingFilesStub.calledOnce).to.be.true;
    });
  });

  describe("load balancing algorithms", function() {
    it("defaults to weighted-largest", function() {
      const fixture = getFixture<LoadBalancingMap>("load-balancing-map-weighted-largest.json", { parseJSON: true });
      stubReadLoadBalancerFile(sandbox, fixture);
      this.loadBalancingMap = fixture;
      sandbox.stub(fs, "writeFileSync");

      const callable = { performLoadBalancing: performLoadBalancing };
      const spy = sinon.spy(utils, "DEBUG");
      callable.performLoadBalancing(4, "e2e", ["file.cy.ts"]);
      expect(spy).to.have.been.calledWith(`Using algorithm for load balancing: weighted-largest`, "weighted-largest");
    });

    it("throws an error on unknown algorithm", function() {
      const fixture = getFixture<LoadBalancingMap>("load-balancing-map-weighted-largest.json", { parseJSON: true });
      stubReadLoadBalancerFile(sandbox, fixture);
      this.loadBalancingMap = fixture;
      sandbox.stub(fs, "writeFileSync");
      expect(() => performLoadBalancing(4, "e2e", ["file.cy.ts"], "FAKE" as never)).to.throw(
        "Algorithm not known for FAKE"
      );
    });

    context("weighted-largest", function() {
      beforeEach(function() {
        const fixture = getFixture<LoadBalancingMap>("load-balancing-map-weighted-largest.json", { parseJSON: true });
        stubReadLoadBalancerFile(sandbox, fixture);
        this.loadBalancingMap = fixture;
        this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
        this.filePaths = Object.keys(this.loadBalancingMap.e2e);
      });

      it("balances for 1 runner", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(1, "e2e", filePaths, "weighted-largest");
        expect(runners).to.deep.equal([
          [
            "150.test.ts",
            "100.test.ts",
            "75.a.test.ts",
            "75.b.test.ts",
            "75.c.test.ts",
            "50.test.ts",
            "25.a.test.ts",
            "25.b.test.ts",
            "10.a.test.ts",
            "10.b.test.ts",
            "5.test.ts"
          ]
        ]);
      });

      it("can balance for 3 runners with nearly even total time", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(3, "e2e", filePaths, "weighted-largest");
        expect(runners).to.deep.equal([
          //200 median time
          ["100.test.ts", "75.a.test.ts", "10.b.test.ts", "10.a.test.ts", "5.test.ts"],
          //200 median time
          ["150.test.ts", "25.b.test.ts", "25.a.test.ts"],
          //200 median time
          ["75.c.test.ts", "75.b.test.ts", "50.test.ts"]
        ]);

        const expectedTime = getTotalMedianTime(this.loadBalancingMap, "e2e", runners[0]);
        runners.every((r) => assertTotalRunnerTime(this.loadBalancingMap, "e2e", r, expectedTime));
      });

      it("can balance for 4 runners with nearly even total time", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(4, "e2e", filePaths, "weighted-largest");
        expect(runners).to.deep.equal([
          //150 total run time
          ["100.test.ts", "25.b.test.ts", "10.b.test.ts", "10.a.test.ts", "5.test.ts"],
          //150 total run time
          ["75.b.test.ts", "50.test.ts", "25.a.test.ts"],
          //150 total run time
          ["75.c.test.ts", "75.a.test.ts"],
          //150 total run time
          ["150.test.ts"]
        ]);

        const expectedTime = getTotalMedianTime(this.loadBalancingMap, "e2e", runners[0]);
        for (const r of runners) assertTotalRunnerTime(this.loadBalancingMap, "e2e", r, expectedTime);
      });

      it("can balance for 6 runners with nearly even total time", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(6, "e2e", filePaths, "weighted-largest");
        expect(runners).to.deep.equal([
          //75 Total run time
          ["50.test.ts", "25.b.test.ts"],
          //100 Total run time
          ["75.c.test.ts", "25.a.test.ts"],
          //85 Total run time
          ["75.b.test.ts", "10.b.test.ts"],
          //85 Total run time
          ["75.a.test.ts", "10.a.test.ts"],
          //105 Total run time
          ["100.test.ts", "5.test.ts"],
          //150 Total run time
          ["150.test.ts"]
        ]);

        expect(runners.map((r) => getTotalMedianTime(this.loadBalancingMap, "e2e", r))).to.deep.equal([
          75, 100, 85, 85, 105, 150
        ]);
      });

      it("works if all test files are equal in median time", function() {
        const fixture = {
          e2e: {
            "100.a.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.b.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.c.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.d.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.e.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.f.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.g.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.h.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            },
            "100.i.test.ts": {
              stats: {
                durations: [100],
                average: 100,
                median: 100
              }
            }
          },
          component: {}
        };

        sandbox.restore();
        stubReadLoadBalancerFile(sandbox, fixture);
        this.loadBalancingMap = fixture;
        this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
        this.filePaths = Object.keys(this.loadBalancingMap.e2e);

        const runners = performLoadBalancing(3, "e2e", this.filePaths, "weighted-largest");
        expect(runners).to.deep.equal([
          ["100.i.test.ts", "100.f.test.ts", "100.d.test.ts"],
          ["100.h.test.ts", "100.e.test.ts", "100.c.test.ts"],
          ["100.g.test.ts", "100.a.test.ts", "100.b.test.ts"]
        ]);
        const expectedTime = getTotalMedianTime(this.loadBalancingMap, "e2e", runners[0]);
        runners.every((r) => assertTotalRunnerTime(this.loadBalancingMap, "e2e", r, expectedTime));
      });

      it("can handle more runners than files", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "weighted-largest");
        expect(runners.filter((r) => r.length === 0)).to.have.lengthOf(1);
        expect(runners.filter((r) => r.length === 1)).to.have.lengthOf(filePaths.length);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function() {
        const fourFiles = this.filePaths.slice(0, 3);
        const runners = performLoadBalancing(2, "e2e", fourFiles, "weighted-largest");
        expect(runners[0]).to.deep.eq(["100.test.ts", "75.a.test.ts"]);
        expect(runners[1]).to.deep.eq(["150.test.ts"]);
      });

      it("can differentiate specs between e2e and component", function() {
        const e2eFilePaths = Object.keys(this.loadBalancingMap.e2e);
        const e2eRunners = performLoadBalancing(1, "e2e", e2eFilePaths, "weighted-largest");
        expect(e2eRunners[0]).to.deep.eq([
          "150.test.ts",
          "100.test.ts",
          "75.a.test.ts",
          "75.b.test.ts",
          "75.c.test.ts",
          "50.test.ts",
          "25.a.test.ts",
          "25.b.test.ts",
          "10.a.test.ts",
          "10.b.test.ts",
          "5.test.ts"
        ]);

        const componentFilePaths = Object.keys(this.loadBalancingMap.component);
        const componentRunners = performLoadBalancing(1, "component", componentFilePaths, "weighted-largest");
        expect(componentRunners[0]).to.deep.eq(["50.test.ct.ts", "10.a.test.ct.ts", "10.b.test.ct.ts", "5.test.ct.ts"]);
      });

      it("can handle files that have not been run (or do not exist in map) yet", function() {
        this.writeFileSyncStub = this.writeFileSyncStub.withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
        const e2eFilePaths = [...Object.keys(this.loadBalancingMap.e2e), "newFile.test.ts"];

        const runners = performLoadBalancing(1, "e2e", e2eFilePaths, "weighted-largest");
        expect(runners[0]).to.deep.eq([
          "150.test.ts",
          "100.test.ts",
          "75.a.test.ts",
          "75.b.test.ts",
          "75.c.test.ts",
          "50.test.ts",
          "25.a.test.ts",
          "25.b.test.ts",
          "10.a.test.ts",
          "10.b.test.ts",
          "5.test.ts",
          "newFile.test.ts"
        ]);
        expect(this.writeFileSyncStub.calledOnce).to.be.true;
        expect(JSON.parse(this.writeFileSyncStub.firstCall.args[1] as string).e2e).to.haveOwnProperty(
          "newFile.test.ts"
        );
      });
    });

    context("round-robin", function() {
      beforeEach(function() {
        //SLOWEST TO FASTEST: "median.4000.test.ts", "median.1000.test.ts", "median.300.test.ts", "median.200.test.ts", "median.50.test.ts", "median.1.test.ts"
        const fixture = getFixture<LoadBalancingMap>("load-balancing-map.json", { parseJSON: true });
        stubReadLoadBalancerFile(sandbox, fixture);

        this.loadBalancingMap = fixture;
      });

      it("sorts files slowest to fastest", function() {
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

      it("balances files per runner equally", function() {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(3, "e2e", filePaths, "round-robin");
        expect(runners).to.have.lengthOf(3);
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.200.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.50.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts", "median.1.test.ts"]);
      });

      it("can handle balancing runners when files cannot be balanced equally across them", function() {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(4, "e2e", filePaths, "round-robin");
        expect(runners[0]).to.deep.eq(["median.4000.test.ts", "median.50.test.ts"]);
        expect(runners[1]).to.deep.eq(["median.1000.test.ts", "median.1.test.ts"]);
        expect(runners[2]).to.deep.eq(["median.300.test.ts"]);
        expect(runners[3]).to.deep.eq(["median.200.test.ts"]);
      });

      it("only includes files given to it and does not consider others in the load balancing map", function() {
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

      it("can handle less files than runners", function() {
        sandbox.stub(fs, "writeFileSync");
        const filePaths = Object.keys(this.loadBalancingMap.e2e);
        const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "round-robin");
        expect(runners[0]).to.have.lengthOf(1);
        expect(runners[runners.length - 1]).to.have.lengthOf(0);
      });

      it("can differentiate specs between e2e and component", function() {
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

      it("can handle files that have not been run (or do not exist in map) yet", function() {
        const stub = sandbox.stub(fs, "writeFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
        const runners = performLoadBalancing(1, "e2e", ["median.200.test.ts", "newFile.test.ts"], "round-robin");
        expect(runners[0]).to.deep.eq(["median.200.test.ts", "newFile.test.ts"]);
        expect(stub.calledOnce).to.be.true;
        expect(JSON.parse(stub.firstCall.args[1] as string).e2e).to.haveOwnProperty("newFile.test.ts");
      });
    });
  });
});
