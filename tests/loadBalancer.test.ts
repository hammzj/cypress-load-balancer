//eslint-disable @typescript-eslint/no-unused-expressions
import { expect } from "chai";
import sinon from "sinon";
import utils from "../src/utils";
import performLoadBalancing from "../src/loadBalancer";
import fs from "node:fs";
import { getFixture, stubReadLoadBalancerFile } from "./support/utils";
import { LoadBalancingMap } from "../src/types";

//eslint-disable-next-line prefer-const
let sandbox = sinon.createSandbox();

describe("Load balancing", function() {
  beforeEach(function() {
    this.initializeLoadBalancingFilesStub = sandbox.stub(utils, "initializeLoadBalancingFiles");
  });
  afterEach(function() {
    sandbox.restore();
  });

  context("preparation", function() {
    it("runs file initialization", function() {
      stubReadLoadBalancerFile(sandbox);
      performLoadBalancing(3, "e2e", []);
      expect(this.initializeLoadBalancingFilesStub.calledOnce).to.be.true;
    });
  });

  describe("load balancing algorithms", function() {
    //TODO
    it("defaults to weighted-largest", function() {
    });

    //TODO
    context("weighted-largest", function() {
      beforeEach(function() {
        const fixture = getFixture<LoadBalancingMap>("load-balancing-map-weighted-largest.json", { parseJSON: true });
        stubReadLoadBalancerFile(sandbox, fixture);
        this.loadBalancingMap = fixture;
        sandbox.stub(fs, "writeFileSync");
        this.filePaths = Object.keys(this.loadBalancingMap.e2e);
      });


      it("balances for 3 runners with nearly even total time", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(3, "e2e", filePaths, "weighted-largest");
        console.log(runners);
        expect(runners).to.deep.equal(
          [
            //225 total run time
            ["150.test.ts", "75.b.test.ts"],
            //225 total run time
            [
              "100.test.ts",
              "5.test.ts",
              "10.a.test.ts",
              "10.b.test.ts",
              "25.a.test.ts",
              "75.a.test.ts"
            ],
            //150 total run time
            ["75.c.test.ts", "25.b.test.ts", "50.test.ts"]
          ]
        );
      });

      it("balances for 4 runners with nearly even total time", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(4, "e2e", filePaths, "weighted-largest");
        console.log(runners);
        expect(runners).to.deep.equal(
          [
            //150 total time
            ["150.test.ts"],
            //150 total time
            ["100.test.ts", "5.test.ts", "10.a.test.ts", "10.b.test.ts", "25.a.test.ts"],
            //150 total time
            ["75.c.test.ts", "25.b.test.ts", "50.test.ts"],
            //150 total time
            ["75.b.test.ts", "75.a.test.ts"]
          ]
        );
      });


      it("can handle more runners than files", function() {
        const filePaths = this.filePaths;
        const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "weighted-largest");
        expect(runners.filter(r => r.length === 0)).to.have.lengthOf(1);
        expect(runners.filter(r => r.length === 1)).to.have.lengthOf(filePaths.length);
      });
    });

    context("average-time", function() {
      context("TESTS I KNOW WILL WORK", function() {
        it("balances the provided map for 3 runners when no limit is given", function() {
          const fixture = getFixture<LoadBalancingMap>("load-balancing-map-average-time.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);

          this.loadBalancingMap = fixture;

          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          //[ [ 25, 50, 10, 100 ], [ 10, 100, 10, 100 ], [ 5, 1000 ] ] total buckets 3 sum [ 185, 220, 1005 ] total time 1410
          // @ts-expect-error I want this to be undefined in this case
          const runners = performLoadBalancing(undefined, "e2e", filePaths, "average-time");

          expect(runners[0]).to.deep.eq(["25.test.ts", "50.test.ts", "10.c.test.ts", "100.a.test.ts"]);
          expect(runners[1]).to.deep.eq(["10.b.test.ts", "100.b.test.ts", "10.a.test.ts", "100.c.test.ts"]);
          expect(runners[2]).to.deep.eq(["5.test.ts", "1000.test.ts"]);
          expect(runners[3]).to.be.undefined;
        });

        it("balances the provided map into 2 runners when a limit of 2 is given", function() {
          const fixture = getFixture<LoadBalancingMap>("load-balancing-map-average-time.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);

          this.loadBalancingMap = fixture;

          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          // [ [ 5, 10, 25, 100, 100 ], [ 10, 10, 50, 100, 1000 ] ] total buckets 2 sum [ 240, 1170 ] total time 1410
          const runners = performLoadBalancing(2, "e2e", filePaths, "average-time");

          expect(runners[0]).to.deep.eq(["5.test.ts", "10.b.test.ts", "25.test.ts", "100.a.test.ts", "100.c.test.ts"]);
          expect(runners[1]).to.deep.eq([
            "10.a.test.ts",
            "10.c.test.ts",
            "50.test.ts",
            "100.b.test.ts",
            "1000.test.ts"
          ]);
          expect(runners[2]).to.be.undefined;
        });
      });

      context("balancing files", function() {
        beforeEach(function() {
          //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
          const fixture = getFixture<LoadBalancingMap>("load-balancing-map.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);

          this.loadBalancingMap = fixture;
        });

        it("balances files per runner equally", function() {
          sandbox.stub(fs, "writeFileSync");
          const totalAverageTime = Object.values(this.loadBalancingMap.e2e).reduce(
            //@ts-expect-error Ignore this
            (acc, { stats }: { DurationStatistics }) => acc + stats.average,
            0
          );
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(3, "e2e", filePaths, "average-time");
          expect(runners).to.have.lengthOf(3);

          expect(runners[0]).to.deep.eq(["foo.test.ts", "wee.test.ts"]);
          expect(runners[1]).to.deep.eq(["baz.test.ts", "tuu.test.ts"]);
          expect(runners[2]).to.deep.eq(["bar.test.ts", "zoom.test.ts"]);

          const runnerAverageTimes = runners.map((r) =>
            r.reduce((acc, fp) => acc + this.loadBalancingMap.e2e[fp].stats.average, 0)
          );
          expect(totalAverageTime).to.eq(runnerAverageTimes.reduce((acc, avg) => acc + avg, 0));

          expect(runnerAverageTimes[0]).to.eq(263);
          expect(runnerAverageTimes[1]).to.eq(1001);
          expect(runnerAverageTimes[2]).to.eq(4300);
        });

        it("can handle balancing runners when files cannot be balanced equally across them", function() {
          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(4, "e2e", filePaths, "average-time");
          expect(runners[0]).to.deep.eq(["baz.test.ts"]);
          expect(runners[1]).to.deep.eq(["bar.test.ts", "tuu.test.ts"]);
          expect(runners[2]).to.deep.eq(["foo.test.ts", "zoom.test.ts"]);
          expect(runners[3]).to.deep.eq(["wee.test.ts"]);
        });

        it("only includes files given to it and does not consider others in the load balancing map", function() {
          sandbox.stub(fs, "writeFileSync");
          const runners = performLoadBalancing(2, "e2e", ["zoom.test.ts", "bar.test.ts", "tuu.test.ts"], "average-time");
          expect(runners[0]).to.deep.eq(["bar.test.ts"]);
          expect(runners[1]).to.deep.eq(["zoom.test.ts", "tuu.test.ts"]);
        });

        it("can handle less files than runners", function() {
          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths, "average-time");

          //Only one runner should be empty
          const emptyRunners = runners.filter((r) => r.length === 0);
          expect(emptyRunners.length).to.eq(1);
        });

        it("can differentiate specs between e2e and component", function() {
          sandbox.stub(fs, "writeFileSync");
          const e2eRunners = performLoadBalancing(1, "e2e", ["foo.test.ts", "bar.test.ts"], "average-time");
          const componentRunners = performLoadBalancing(1, "component", ["foo.test.ts", "bee.test.ts"], "average-time");
          expect(e2eRunners[0]).to.deep.eq(["foo.test.ts", "bar.test.ts"]);
          expect(componentRunners[0]).to.deep.eq(["foo.test.ts", "bee.test.ts"]);
        });

        it("can handle files that have not been run (or do not exist in map) yet", function() {
          const stub = sandbox.stub(fs, "writeFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
          const runners = performLoadBalancing(1, "e2e", ["foo.test.ts", "newFile.test.ts"], "average-time");
          expect(runners[0]).to.deep.eq(["foo.test.ts", "newFile.test.ts"]);
          expect(stub.calledOnce).to.be.true;
          expect(JSON.parse(stub.firstCall.args[1] as string).e2e).to.haveOwnProperty("newFile.test.ts");
        });
      });
    });

    context("round-robin", function() {
      context("balancing files", function() {
        beforeEach(function() {
          //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
          const fixture = getFixture<LoadBalancingMap>("load-balancing-map.json", { parseJSON: true });
          stubReadLoadBalancerFile(sandbox, fixture);

          this.loadBalancingMap = fixture;
        });

        it("sorts files slowest to fastest", function() {
          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(1, "e2e", filePaths, "round-robin");
          expect(runners[0]).to.deep.eq([
            "zoom.test.ts",
            "baz.test.ts",
            "bar.test.ts",
            "foo.test.ts",
            "wee.test.ts",
            "tuu.test.ts"
          ]);
        });

        it("balances files per runner equally", function() {
          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(3, "e2e", filePaths, "round-robin");
          expect(runners).to.have.lengthOf(3);
          expect(runners[0]).to.deep.eq(["zoom.test.ts", "foo.test.ts"]);
          expect(runners[1]).to.deep.eq(["baz.test.ts", "wee.test.ts"]);
          expect(runners[2]).to.deep.eq(["bar.test.ts", "tuu.test.ts"]);
        });

        it("can handle balancing runners when files cannot be balanced equally across them", function() {
          sandbox.stub(fs, "writeFileSync");
          const filePaths = Object.keys(this.loadBalancingMap.e2e);
          const runners = performLoadBalancing(4, "e2e", filePaths, "round-robin");
          expect(runners[0]).to.deep.eq(["zoom.test.ts", "wee.test.ts"]);
          expect(runners[1]).to.deep.eq(["baz.test.ts", "tuu.test.ts"]);
          expect(runners[2]).to.deep.eq(["bar.test.ts"]);
          expect(runners[3]).to.deep.eq(["foo.test.ts"]);
        });

        it("only includes files given to it and does not consider others in the load balancing map", function() {
          sandbox.stub(fs, "writeFileSync");
          const runners = performLoadBalancing(2, "e2e", ["zoom.test.ts", "bar.test.ts", "tuu.test.ts"], "round-robin");
          expect(runners[0]).to.deep.eq(["zoom.test.ts", "tuu.test.ts"]);
          expect(runners[1]).to.deep.eq(["bar.test.ts"]);
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
          const e2eRunners = performLoadBalancing(1, "e2e", ["foo.test.ts", "bar.test.ts"], "round-robin");
          const componentRunners = performLoadBalancing(1, "component", ["foo.test.ts", "bee.test.ts"], "round-robin");
          expect(e2eRunners[0]).to.deep.eq(["bar.test.ts", "foo.test.ts"]);
          expect(componentRunners[0]).to.deep.eq(["foo.test.ts", "bee.test.ts"]);
        });

        it("can handle files that have not been run (or do not exist in map) yet", function() {
          const stub = sandbox.stub(fs, "writeFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
          const runners = performLoadBalancing(1, "e2e", ["foo.test.ts", "newFile.test.ts"], "round-robin");
          expect(runners[0]).to.deep.eq(["foo.test.ts", "newFile.test.ts"]);
          expect(stub.calledOnce).to.be.true;
          expect(JSON.parse(stub.firstCall.args[1] as string).e2e).to.haveOwnProperty("newFile.test.ts");
        });
      });
    });
  });
});
