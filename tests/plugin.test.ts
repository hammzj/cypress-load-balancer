//Thanks to https://github.com/javierbrea/cypress-fail-fast/blob/main/test/plugin.spec.js
import { expect } from "chai";
import fs from "node:fs";
import sinon, { SinonSandbox, SinonSpy } from "sinon";
import { getFixture, stubReadLoadBalancerFile } from "./support/utils";
import addCypressLoadBalancerPlugin from "../src/plugin";
import utils from "../src/utils";
// @ts-expect-error No types exist for this package
import findCypressSpecs from "find-cypress-specs";
import { debug as debugInitializer } from "debug";

let sandbox: SinonSandbox;
let onEventSpy: SinonSpy;
let output: string, write;
//eslint-disable-next-line prefer-const
write = process.stderr.write;

describe("addCypressLoadBalancerPlugin", function() {
  const getOnEventSpyHandler = () => {
    return onEventSpy.getCall(0).args[1];
  };

  const stubInitializeLoadBalancingFiles = () => {
    return sandbox.stub(utils, "initializeLoadBalancingFiles");
  };

  //Chg stderr for debugging
  beforeEach(function() {
    output = "";
    //@ts-expect-error Ignore
    process.stderr.write = function(str) {
      output += str;
    };
  });

  afterEach(function() {
    process.stderr.write = write;
  });

  context("base plugin", function() {
    beforeEach(function() {
      this.cypressConfigFile = {
        component: {
          specPattern: "**/*.cy.{js,jsx,ts,tsx}"
        },
        env: {}
      };

      sandbox = sinon.createSandbox();

      this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
      this.specFiles = [
        "cypress/tests/TestFunction.cy.ts",
        "cypress/tests/TestFunction.2.cy.ts",
        "cypress/tests/TestFunction.3.cy.ts",
        "cypress/tests/TestFunction.4.cy.ts"
      ];
      this.getSpecsStub = sandbox.stub(findCypressSpecs, "getSpecs").returns(this.specFiles);
      onEventSpy = sandbox.spy();
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
    });

    it("only starts up when \"env.runner\" is specified", function() {
      debugInitializer.enable("cypress-load-balancer");
      addCypressLoadBalancerPlugin(
        onEventSpy,
        {
          ...this.cypressConfigFile,
          env: { runner: "1/2" }
        },
        "component"
      );
      expect(output)
        .to.include(`cypress-load-balancer`)
        .and.include(`Starting up load balancing process as "env.runner" has been declared`);
    });

    it("does not start up if \"env.runner\" is empty", function() {
      debugInitializer.enable("cypress-load-balancer");
      addCypressLoadBalancerPlugin(
        onEventSpy,
        {
          ...this.cypressConfigFile,
          env: {}
        },
        "component"
      );
      expect(output).to.be.empty;
    });

    context("Empty runner handling", function() {
      it("initializes a runner with an empty spec if no specs have been found", function() {
        this.getSpecsStub.restore();
        this.getSpecsStub = sandbox.stub(findCypressSpecs, "getSpecs").returns([]);

        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: `1/1` }
          },
          "component"
        );

        expect(updatedConfigFile.specPattern).to.have.lengthOf(1);
        expect(updatedConfigFile.specPattern[0]).to.include("clb-empty-1-1.cy.js");
      });

      it("initializes a runner with an empty spec if the runner count is greater than the file count", function() {
        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: `${this.specFiles.length + 1}/${this.specFiles.length + 1}` }
          },
          "component"
        );

        expect(updatedConfigFile.specPattern).to.have.lengthOf(1);
        expect(updatedConfigFile.specPattern[0]).to.include("clb-empty-5-5.cy.js");
      });
    });

    context("inputs", function() {
      context("env.runner", function() {
        it("runner must be in X/Y format", function() {
          expect(() =>
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "foo" }
              },
              "component"
            )
          ).to.throw(
            "env.runner must be provided in X/Y format, where X is the runner index, and Y is the total runner count to use."
          );
        });

        it("cannot have an index 0", function() {
          expect(() =>
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "0/4" }
              },
              "component"
            )
          ).to.throw("env.runner index cannot be 0! Runner indices must begin at 1");
        });

        it("cannot have a count of 0", function() {
          expect(() =>
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "1/0" }
              },
              "component"
            )
          ).to.throw("env.runner count cannot be 0! Runner count must begin at 1");
        });

        it("the index cannot be higher than the runner count", function() {
          expect(() =>
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "2/1" }
              },
              "component"
            )
          ).to.throw("nv.runner is incorrect! The runner index cannot be greater than the total runner count: 2/1");
        });

        const test_theRunnerIndexSpecifiesTheSpecsThatWillBeRunInTheCypressProcess = [
          {
            runner: "1/2",
            expectedSpecPattern: ["cypress/tests/TestFunction.4.cy.ts", "cypress/tests/TestFunction.2.cy.ts"]
          },
          {
            runner: "2/2",
            expectedSpecPattern: ["cypress/tests/TestFunction.3.cy.ts", "cypress/tests/TestFunction.cy.ts"]
          }
        ];
        test_theRunnerIndexSpecifiesTheSpecsThatWillBeRunInTheCypressProcess.map(({ runner, expectedSpecPattern }) => {
          it("the runner index specifies the specs that will be run in the Cypress process", function() {
            const updatedConfigFile = addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner }
              },
              "component"
            );
            expect(updatedConfigFile.specPattern).to.deep.equal(expectedSpecPattern);
          });
        });
      });

      context("cypressLoadBalancerAlgorithm", function() {
        it("can specify a different load balancing algorithm", function() {
          debugInitializer.enable("cypress-load-balancer");
          addCypressLoadBalancerPlugin(
            onEventSpy,
            {
              ...this.cypressConfigFile,
              env: { runner: "1/2", cypressLoadBalancerAlgorithm: "round-robin" }
            },
            "component"
          );
          expect(output).to.include("Using algorithm for load balancing: round-robin");
        });
      });

      it("defaults to use the config specPattern defined for that testing type", function() {
        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: "1/1" }
          },
          "component"
        );

        expect(this.getSpecsStub).to.have.been.calledWith(sinon.match(this.cypressConfigFile), "component");

        expect(updatedConfigFile.specPattern).to.deep.equal([
          "cypress/tests/TestFunction.cy.ts",
          "cypress/tests/TestFunction.2.cy.ts",
          "cypress/tests/TestFunction.3.cy.ts",
          "cypress/tests/TestFunction.4.cy.ts"
        ]);
      });
    });
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
      this.getSpecsStub = sandbox
        .stub(findCypressSpecs, "getSpecs")
        .returns([
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

    it("is not registered if \"env.runner\" is not defined", function() {
      const cypressConfigFile = this.cypressConfigFile;
      delete cypressConfigFile.env.runner;
      addCypressLoadBalancerPlugin(onEventSpy, cypressConfigFile, "component");

      expect(onEventSpy).to.not.have.been.called;
    });

    it("is skipped if Cypress failed to execute", function() {
      const updatedConfigFile = { ...this.cypressConfigFile, env: { runner: "1/2" } };
      const updateFileStatsStub = sandbox.stub(utils, "updateFileStats");
      const failedResults = { ...this.results, status: "failed" };

      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(failedResults);

      expect(updateFileStatsStub).to.not.have.been.called;
    });

    it("is skipped if env.cypressLoadBalancerSkipResults is true", function() {
      const updatedConfigFile = {
        ...this.cypressConfigFile,
        env: { runner: "1/2", cypressLoadBalancerSkipResults: true }
      };
      const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
      const updateFileStatsStub = sandbox.stub(utils, "updateFileStats");

      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match.object, "spec-map-1-2.json");
      expect(updateFileStatsStub).to.not.have.been.called;
    });

    //Works for <= v23 of Cucumber
    const tests_isSkippedIfItIsACucumberDryRun = [
      "__cypress_cucumber_preprocessor_dont_use_this_suite",
      "__cypress_cucumber_preprocessor_registry_dont_use_this"
    ];
    tests_isSkippedIfItIsACucumberDryRun.map(injectedKeyName => {
      it("is skipped if it is a Cucumber dry run", function() {
        const updatedConfigFile = {
          ...this.cypressConfigFile,
          env: {
            runner: "1/2", dryRun: true, [injectedKeyName]: { "isEventHandlersAttached": true }
          }
        };
        const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
        const updateFileStatsStub = sandbox.stub(utils, "updateFileStats");

        stubReadLoadBalancerFile(sandbox);
        addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

        const onEventHandler = getOnEventSpyHandler();
        onEventHandler(this.results);

        expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match.object, "spec-map-1-2.json");
        expect(updateFileStatsStub).to.not.have.been.called;
      });
    });

    it("is skipped if there is only an empty file being run", function() {
      const emptyFileResults = getFixture<CypressCommandLine.CypressRunResult>(
        "component-results-for-empty-file.json",
        { parseJSON: true }
      );
      const updatedConfigFile = {
        ...this.cypressConfigFile,
        env: { runner: "1/2" }
      };
      const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
      const updateFileStatsStub = sandbox.stub(utils, "updateFileStats");

      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(emptyFileResults);

      expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match.object, "spec-map-1-2.json");
      expect(updateFileStatsStub).to.not.have.been.called;
    });

    const tests_onlyCreatesAMapForTheCurrentRunnerAndNoOtherRunners = [
      { called: "1/2", notCalled: "2/2" },
      { called: "2/2", notCalled: "1/2" }
    ];
    tests_onlyCreatesAMapForTheCurrentRunnerAndNoOtherRunners.map(
      ({ called, notCalled }: { called: string; notCalled: string }) => {
        it("only creates a map for the current runner and no other runners", function() {
          const updatedConfigFile = { ...this.cypressConfigFile, env: { runner: called } };

          const stub = sandbox.stub(utils, "saveMapFile");
          stubReadLoadBalancerFile(sandbox);

          addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");
          const onEventHandler = getOnEventSpyHandler();
          onEventHandler(this.results);
          expect(stub).to.have.been.calledWith(sinon.match.any, `spec-map-${called.replace("/", "-")}.json`);
          expect(stub).to.not.have.been.calledWith(sinon.match.any, `spec-map-${notCalled.replace("/", "-")}.json`);
        });
      }
    );

    it("runs file initialization for the base map if it does not exist", function() {
      const initializeLoadBalancingFilesStub = sandbox.stub(utils, "initializeLoadBalancingFiles");
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      expect(initializeLoadBalancingFilesStub).to.have.been.called;
    });

    it("runs file initialization for the current runner map", function() {
      sandbox.stub(utils, "initializeLoadBalancingFiles");
      const saveMapFileStub = sandbox.stub(utils, "saveMapFile");
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      expect(saveMapFileStub).to.have.been.calledWith(sinon.match.any, "spec-map-1-2.json");
    });

    it("uses the base spec map if there is only one runner (1/1)", function() {
      sandbox.stub(utils, "initializeLoadBalancingFiles");
      this.cypressConfigFile.env.runner = "1/1";
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);
      expect(this.writeFileSyncStub).to.have.been.calledWith(sinon.match("spec-map.json"));
    });

    it("adds non-existing files to the current runner map (even if not run)", function() {
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox);
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

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

      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

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
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      expect(saveMapFileStub).to.have.been.calledWith(
        {
          e2e: {},
          component: { "cypress/tests/TestFunction.cy.ts": { stats: sinon.match.object } }
        },
        `spec-map-${runner.replace("/", "-")}.json`
      );
    });

    it("adds new durations to existing files in the current runner map only", function() {
      const existingSpecName = this.results.runs[0].spec.relative;

      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000], average: 3000, median: 3000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(1);
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([3000]);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        3000,
        this.results.runs[0].stats.duration
      ]);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(2);
    });

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
      const onEventHandler = getOnEventSpyHandler();

      onEventHandler(this.results);

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
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(spy).to.have.been.calledWith([500, 1000, 2000, 3000]).and.returned(1000);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.median).to.eq(2000);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.median).to.eq(1000);
    });

    it("removes the oldest durations when the maximum limit has been reached for the current runner map only", function() {
      const existingSpecName = this.results.runs[0].spec.relative;
      sandbox.stub(utils, "MAX_DURATIONS_ALLOWED").get(() => 3);
      stubInitializeLoadBalancingFiles();
      stubReadLoadBalancerFile(sandbox, {
        e2e: {},
        component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2000, median: 2000 } } }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations)
        .to.deep.eq([3000, 2000, 1000])
        .and.have.lengthOf(3);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations)
        .to.deep.eq([1000, 2000, this.results.runs[0].stats.duration])
        .and.to.have.lengthOf(3);
    });
  });
});
