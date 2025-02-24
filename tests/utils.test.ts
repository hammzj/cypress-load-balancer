import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import utils from "../src/utils";

describe("Utils", function () {
  beforeEach(function () {});
  afterEach(function () {
    sinon.restore();
  });

  context("saveMapFile", function () {
    it('saves map file data to default "/.cypress-load-balancer/main.json" file', function () {
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");
      utils.saveMapFile({ e2e: {}, component: {} });
      expect(writeFileSyncStub).to.have.been.calledOnce;
      expect(writeFileSyncStub.firstCall.args[0]).to.include(".cypress-load-balancer/main.json");
      expect(writeFileSyncStub.firstCall.args[1]).to.deep.eq(JSON.stringify({ e2e: {}, component: {} }));
    });

    it("can save to another json file", function () {
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");
      utils.saveMapFile({ e2e: {}, component: {} }, "alternate.json");
      expect(writeFileSyncStub.calledOnce).to.be.true;
      expect(writeFileSyncStub.firstCall.args[0]).to.include(".cypress-load-balancer/alternate.json");
      expect(writeFileSyncStub.firstCall.args[1]).to.deep.eq(JSON.stringify({ e2e: {}, component: {} }));
    });

    it('converts ".json.json" to ".json"', function () {
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");
      utils.saveMapFile({ e2e: {}, component: {} }, "alternate.json.json");
      expect(writeFileSyncStub.calledOnce).to.be.true;
      expect(writeFileSyncStub.firstCall.args[0]).to.endWith(".cypress-load-balancer/alternate.json");
      expect(writeFileSyncStub.firstCall.args[1]).to.deep.eq(JSON.stringify({ e2e: {}, component: {} }));
    });
  });

  context("initializeLoadBalancingFiles", function () {
    it('creates the ".cypress-load-balancer" directory if it does not exist', function () {
      sinon.stub(fs, "existsSync").returns(false);
      const mkdirSyncStub = sinon.stub(fs, "mkdirSync");
      sinon.stub(fs, "writeFileSync");

      utils.initializeLoadBalancingFiles();
      expect(mkdirSyncStub.calledOnce).to.be.true;
      expect(mkdirSyncStub.calledWithMatch(".cypress-load-balancer")).to.be.true;
    });

    it('skips creating the ".cypress-load-balancer" directory if it exists', function () {
      sinon.stub(fs, "existsSync").returns(true);
      const mkdirSyncStub = sinon.stub(fs, "mkdirSync");

      utils.initializeLoadBalancingFiles();
      expect(mkdirSyncStub.calledOnce).to.be.false;
    });

    it('can force re-create the ".cypress-load-balancer" directory', function () {
      sinon.stub(fs, "existsSync").returns(true);
      const mkdirSyncStub = sinon.stub(fs, "mkdirSync");

      utils.initializeLoadBalancingFiles({ forceCreateMainDirectory: true });
      expect(mkdirSyncStub.calledOnce).to.be.true;
    });

    it("creates the main load balancing map file if it does not exist", function () {
      sinon.stub(fs, "existsSync").returns(false);
      sinon.stub(fs, "mkdirSync");
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");

      utils.initializeLoadBalancingFiles();
      expect(writeFileSyncStub.calledOnce).to.be.true;
      expect(writeFileSyncStub.firstCall.args[0]).to.include(".cypress-load-balancer/main.json");
      expect(JSON.parse(writeFileSyncStub.firstCall.args[1] as string)).to.deep.eq({ e2e: {}, component: {} });
    });

    it("skips creating the main load balancing map file if it exists", function () {
      sinon.stub(fs, "existsSync").returns(true);
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");

      utils.initializeLoadBalancingFiles();
      expect(writeFileSyncStub.calledOnce).to.be.false;
    });

    it("can force re-create main load balancing map file", function () {
      sinon.stub(fs, "existsSync").returns(true);
      const writeFileSyncStub = sinon.stub(fs, "writeFileSync");

      utils.initializeLoadBalancingFiles({ forceCreateMainLoadBalancingMap: true });
      expect(writeFileSyncStub.calledOnce).to.be.true;
    });
  });

  context("createNewEntry", function () {
    beforeEach(function () {
      this.loadBalancerMap = { e2e: {}, component: {} };
    });

    it("creates a new entry file in the load balancer map if it does not exist", function () {
      utils.createNewEntry(this.loadBalancerMap, "component", "tests/foo.spec.ts");
      utils.createNewEntry(this.loadBalancerMap, "e2e", "tests/bar.spec.ts");
      expect(Object.keys(this.loadBalancerMap.component).length).to.eq(1);
      expect(this.loadBalancerMap.component["tests/foo.spec.ts"]).to.exist.and.deep.eq({
        stats: {
          durations: [],
          average: 0
        }
      });
      expect(Object.keys(this.loadBalancerMap.e2e).length).to.eq(1);
      expect(this.loadBalancerMap.e2e["tests/bar.spec.ts"]).to.exist.and.deep.eq({
        stats: {
          durations: [],
          average: 0
        }
      });
    });

    it("skips creating a new file entry in the load balancer map if it exists", function () {
      utils.createNewEntry(this.loadBalancerMap, "component", "tests/foo.spec.ts");
      this.loadBalancerMap.component["tests/foo.spec.ts"].stats.durations = [300];
      this.loadBalancerMap.component["tests/foo.spec.ts"].stats.average = 300;
      expect(this.loadBalancerMap.component["tests/foo.spec.ts"]).to.exist.and.deep.eq({
        stats: {
          durations: [300],
          average: 300
        }
      });
    });

    it("can force re-create a file entry in the load balancer map ", function () {
      utils.createNewEntry(this.loadBalancerMap, "component", "tests/foo.spec.ts");
      this.loadBalancerMap.component["tests/foo.spec.ts"].name = "foo";
      utils.createNewEntry(this.loadBalancerMap, "component", "tests/foo.spec.ts", { force: true });
      expect(this.loadBalancerMap.component["tests/foo.spec.ts"]).to.exist.and.deep.eq({
        stats: {
          durations: [],
          average: 0
        }
      });
    });
  });

  context("update file stats", function () {
    it("shrinks the durations to the maximum length", function () {
      sinon.stub(utils, "MAX_DURATIONS_ALLOWED").get(() => 3);

      const orig = {
        e2e: {},
        component: { "tests/foo.spec.ts": { stats: { durations: [100, 200, 300], average: 200 } } }
      };

      utils.updateFileStats(orig, "component", "tests/foo.spec.ts", 400);
      expect(orig.component["tests/foo.spec.ts"].stats.durations).to.have.length(3);
      expect(orig.component["tests/foo.spec.ts"].stats.durations).to.deep.eq([200, 300, 400]);
    });

    it("calculates the average duration as 0 if no durations are provided", function () {
      expect(utils.calculateAverageDuration([])).to.eq(0);
    });

    it("calculates the average duration", function () {
      expect(utils.calculateAverageDuration([1, 2, 2, 3])).to.eq(2);
      expect(utils.calculateAverageDuration([2, 4, 6])).to.eq(4);
      //Round up
      expect(utils.calculateAverageDuration([3, 4])).to.eq(4);
    });
  });
});
