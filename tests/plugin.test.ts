//Thanks to https://github.com/javierbrea/cypress-fail-fast/blob/main/test/plugin.spec.js
import { expect } from "chai";
import fs from "node:fs";
import sinon, { SinonSandbox, SinonSpy } from "sinon";
import { getFixture, stubReadLoadBalancerFile } from "./support/utils";
import addCypressLoadBalancerPlugin from "../src/plugin";
import utils from "../src/utils";

let sandbox: SinonSandbox;
let onEventSpy: SinonSpy;
let results: CypressCommandLine.CypressRunResult;

describe("addCypressLoadBalancerPlugin", function () {
  beforeEach(function () {
    sandbox = sinon.createSandbox();
    results = getFixture<CypressCommandLine.CypressRunResult>("component-results.json", { parseJSON: true });
    this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
    onEventSpy = sandbox.spy();
    addCypressLoadBalancerPlugin(onEventSpy);
  });

  afterEach(() => {
    sandbox.restore();
    sinon.restore();
  });

  const getHandler = () => {
    return onEventSpy.getCall(0).args[1];
  };

  const stubInitializeLoadBalancingFiles = () => {
    return sandbox.stub(utils, "initializeLoadBalancingFiles");
  };

  it(`is added as an "after:run" event`, async function () {
    expect(onEventSpy.getCall(0).args[0]).to.eq("after:run");
  });

  context("handler function", function () {
    it("runs file initialization", function () {
      const handler = getHandler();
      const stub = sandbox.stub(utils, "initializeLoadBalancingFiles");
      stubReadLoadBalancerFile(sandbox);

      handler(results);

      expect(stub).to.have.been.calledOnce;
    });

    it("adds non-existing files to the map", function () {
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      stubReadLoadBalancerFile(sandbox);
      handler(results);

      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const actualSpecs = Object.keys(loadBalancingMap.component);
      const expectedSpecs = results.runs.map((r) => r.spec.relative);

      expect(actualSpecs).to.deep.eq(expectedSpecs);
    });

    it("skips existing files in the map", function () {
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      const existingSpecName = results.runs[0].spec.relative;
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000], average: 3000 } } }
      });
      handler(results);
      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);

      //Assumes it already existed in the map with one duration then adds a new duration to it
      expect(loadBalancingMap.component[existingSpecName].stats.durations).to.have.length.above(1);
    });

    it("saves the file when complete", function () {
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      stubReadLoadBalancerFile(sandbox);
      const stub = sandbox.stub(utils, "saveMapFile");
      handler(results);
      expect(stub).to.have.been.calledOnce;
    });

    it("adds new durations to existing files", function () {
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      const existingSpecName = results.runs[0].spec.relative;
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000], average: 3000 } } }
      });
      handler(results);
      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);

      expect(loadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        3000,
        results.runs[0].stats.duration
      ]);
      expect(loadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(2);
    });

    it("calculates the average duration and saves it per spec", function () {
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      const spy = sandbox.spy(utils, "calculateAverageDuration");
      const existingSpecName = results.runs[0].spec.relative;
      results.runs[0].stats.duration = 1000; //Nice even number

      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000], average: 2500 } } }
      });
      handler(results);
      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);

      expect(spy).to.have.been.calledWith([3000, 2000, 1000]).and.returned(2000);
      expect(loadBalancingMap.component[existingSpecName].stats.average).to.eq(2000);
    });

    it("removes the oldest durations when the maximum limit has been reached", function () {
      sandbox.stub(utils, "MAX_DURATIONS_ALLOWED").get(() => 3);
      stubInitializeLoadBalancingFiles();
      const handler = getHandler();
      const existingSpecName = results.runs[0].spec.relative;
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2000 } } }
      });
      handler(results);
      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);

      expect(loadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        2000,
        1000,
        results.runs[0].stats.duration
      ]);
      expect(loadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(3);
    });
  });
});
