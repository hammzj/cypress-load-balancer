//Thanks to https://github.com/javierbrea/cypress-fail-fast/blob/main/test/plugin.spec.js
import { expect } from "chai";
import fs from "node:fs";
import sinon, { SinonSandbox, SinonSpy } from "sinon";
import { getFixture, stubReadLoadBalancerFile } from "./support/utils";
import addCypressLoadBalancerPlugin from "../src/plugin";
import utils from "../src/utils";
// @ts-expect-error No types exist for this package
import findCypressSpecs from "find-cypress-specs";

let sandbox: SinonSandbox;
let onEventSpy: SinonSpy;

describe("addCypressLoadBalancerPlugin", function() {
  const getOnEventSpyHandler = () => {
    return onEventSpy.getCall(0).args[1];
  };

  const stubInitializeLoadBalancingFiles = () => {
    return sandbox.stub(utils, "initializeLoadBalancingFiles");
  };

  context("base plugin", function() {
  });

  context("after:run event", function() {
    beforeEach(function() {
      this.cypressConfigFile = {
        component: {
          specPattern: "**/*.cy.{js,jsx,ts,tsx}"
        },
        env: {
          runner: "1/2"
        }
      };
      sandbox = sinon.createSandbox();
      this.results = getFixture<CypressCommandLine.CypressRunResult>("component-results.json", { parseJSON: true });
      this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
      this.getSpecsStub = sandbox.stub(findCypressSpecs, "getSpecs").returns([
        "cypress/tests/TestFunction.cy.ts",
        "cypress/tests/TestFunction.2.cy.ts",
        "cypress/tests/TestFunction.3.cy.ts",
        "cypress/tests/TestFunction.4.cy.ts"
      ]);

      onEventSpy = sandbox.spy();
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
    });

    it(`adds an "after:run" event`, async function() {
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      expect(onEventSpy.getCall(0).args[0]).to.eq("after:run");
    });

    it("is not called if \"env.runner\" is not defined", function() {
      const cypressConfigFile = this.cypressConfigFile;
      delete cypressConfigFile.env.runner;
      addCypressLoadBalancerPlugin(onEventSpy, cypressConfigFile, "component");

      const handler = getOnEventSpyHandler();
      const stub = sandbox.stub(utils, "initializeLoadBalancingFiles");
      handler(this.results);
      expect(stub).to.not.have.been.called;
    });


    //TODO
    [
      { called: "1/2", notCalled: "2/2" },
      { called: "2/2", notCalled: "1/2" }
    ].map(({ called, notCalled }) => {
      it("only creates a map for the current runner and no other runners", function() {
        const updatedConfigFile = {
          ...this.cypressConfigFile, env: { runner: called }
        };

        const stub = sandbox.stub(utils, "saveMapFile");
        stubReadLoadBalancerFile(sandbox);

        addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");
        let handler = getOnEventSpyHandler();
        handler(this.results);
        expect(stub).to.have.been.calledWith(sinon.match.any, `spec-map-${called.replace("/", "-")}.json`);
        expect(stub).to.not.have.been.calledWith(sinon.match.any, `spec-map-${notCalled.replace("/", "-")}.json`);
      });
    });


    it("runs file initialization for the base map if it does not exist", function() {
      const initializeLoadBalancingFilesStub = sandbox.stub(utils, "initializeLoadBalancingFiles");
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const handler = getOnEventSpyHandler();
      handler(this.results);

      expect(initializeLoadBalancingFilesStub).to.have.been.called;
    });

    it("runs file initialization for the current runner map", function() {
      sandbox.stub(utils, "initializeLoadBalancingFiles");
      const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const handler = getOnEventSpyHandler();
      handler(this.results);

      expect(saveMapFileStub).to.have.been.calledWith(sinon.match.any, "spec-map-1-2.json");
    });

    it("adds non-existing files to the current runner map (even if not run)", function() {
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const handler = getOnEventSpyHandler();
      handler(this.results);

      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const actualSpecs = Object.keys(loadBalancingMap.component);
      //@ts-expect-error Ignore
      const expectedSpecs = this.results.runs.map((r) => r.spec.relative);

      expect(actualSpecs).to.include(expectedSpecs[0]);
      expect(actualSpecs.length).to.be.greaterThan(expectedSpecs.length);
    });

    it("skips existing files in the current runner map", function() {
      const existingSpecName = this.results.runs[0].spec.relative;
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000], average: 3000, median: 3000 } } }
      });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const handler = getOnEventSpyHandler();
      handler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      //Assumes it already existed in the maps with one duration but does not update the main one
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(1);
      //Assumes it already existed in the maps with one duration then adds a new duration to current runner map
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.length.above(1);
    });

    it("saves the current runner map file when complete", function() {
      const runner = this.cypressConfigFile.env.runner;
      const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox);

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const handler = getOnEventSpyHandler();
      handler(this.results);

      expect(saveMapFileStub).to.have.been.calledWith(
        {
          e2e: {},
          component: { "cypress/tests/TestFunction.cy.ts": { stats: sinon.match.object } }
        }, `spec-map-${runner.replace("/", "-")}.json`);
    });

    it("adds new durations to existing files in the current runner map only", function() {
      const existingSpecName = this.results.runs[0].spec.relative;

      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000], average: 3000, median: 3000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const handler = getOnEventSpyHandler();
      handler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(1);
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([3000]);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([3000, this.results.runs[0].stats.duration]);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(2);
    });

    //TODO
    it("calculates the average duration and saves it per spec for the current runner map only", function() {
      const spy = sandbox.spy(utils, "calculateAverageDuration");
      const existingSpecName = this.results.runs[0].spec.relative;
      this.results.runs[0].stats.duration = 1000; //Set it to an even number for clarity

      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000], average: 2500, median: 2000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const handler = getOnEventSpyHandler();

      handler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);


      expect(spy).to.have.been.calledWith([1000, 2000, 3000]).and.returned(2000);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.average).to.eq(2500);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.average).to.eq(2000);
    });

    it("calculates the median duration and saves it per spec for the current runner map only", function() {
      const spy = sandbox.spy(utils, "calculateMedianDuration");
      const existingSpecName = this.results.runs[0].spec.relative;
      this.results.runs[0].stats.duration = 500; //Set it to an even number for clarity

      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2500, median: 2000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const handler = getOnEventSpyHandler();
      handler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(spy).to.have.been.calledWith([500, 1000, 2000, 3000]).and.returned(1000);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.median).to.eq(2000);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.median).to.eq(1000);
    });

    //TODO
    it("removes the oldest durations when the maximum limit has been reached for the current runner map only", function() {
      const existingSpecName = this.results.runs[0].spec.relative;
      sandbox.stub(utils, "MAX_DURATIONS_ALLOWED").get(() => 3);
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2000, median: 2000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const handler = getOnEventSpyHandler();
      handler(this.results);


      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        3000,
        2000,
        1000
      ]).and.have.lengthOf(3);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        1000,
        2000,
        this.results.runs[0].stats.duration
      ]).and.to.have.lengthOf(3);
    });
  });
});
