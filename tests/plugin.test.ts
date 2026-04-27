//Thanks to https://github.com/javierbrea/cypress-fail-fast/blob/main/test/plugin.spec.js
import fs from "node:fs";
import { expect } from "chai";
import sinon, { SinonSandbox, SinonSpy } from "sinon";
// @ts-expect-error No types exist for this package
import findCypressSpecs from "find-cypress-specs";
import { debug as debugInitializer } from "debug";
import { getFixture, stubInitializeSpecMapFile, stubSpecMapReads } from "./support/utils";
import addCypressLoadBalancerPlugin from "../src/plugin";
import { LoadBalancingMap, TestFile } from "../src/load.balancing.map";

let sandbox: SinonSandbox;
let onEventSpy: SinonSpy;
let output: string, write;
//eslint-disable-next-line prefer-const
write = process.stderr.write;

describe("addCypressLoadBalancerPlugin", function () {
  const getOnEventSpyHandler = () => {
    return onEventSpy.getCall(0).args[1];
  };

  //Chg stderr for debugging
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

  context("base plugin", function () {
    beforeEach(function () {
      //Basic fixtures
      this.cypressConfigFile = {
        component: {
          specPattern: "**/*.cy.{js,jsx,ts,tsx}"
        },
        env: {}
      };
      this.specFiles = [
        "cypress/tests/TestFunction.cy.ts",
        "cypress/tests/TestFunction.2.cy.ts",
        "cypress/tests/TestFunction.3.cy.ts",
        "cypress/tests/TestFunction.4.cy.ts"
      ];

      //Sandbox
      sandbox = sinon.createSandbox();

      //Spies and stubs
      //In order for the event spy to work, it needs to be registered as an instance variable and not as "this.onEventSpy"
      onEventSpy = sandbox.spy();

      this.initializeSpecMapFileStub = stubInitializeSpecMapFile(sandbox);
      this.getSpecsStub = sandbox.stub(findCypressSpecs, "getSpecs").returns(this.specFiles);

      //Force the test to think it is on a linux machine to avoid issues with Windows paths
      sandbox.stub(process, "platform").value("linux");
      sandbox.stub(process, "cwd").returns(`/usr/docs/test-repo/`);

      //Only way to test certain filesystem calls. Not ideal
      this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
    });

    it('only starts up when "env.runner" is specified', function () {
      //Arrange
      debugInitializer.enable("cypress-load-balancer");
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

      //Act
      addCypressLoadBalancerPlugin(
        onEventSpy,
        {
          ...this.cypressConfigFile,
          env: { runner: "1/2" }
        },
        "component"
      );

      //Assert
      expect(output)
        .to.include(`cypress-load-balancer`)
        .and.include(`Starting up load balancing process as "env.runner" has been declared`);
    });

    it('does not start up if "env.runner" is empty', function () {
      //Arrange
      debugInitializer.enable("cypress-load-balancer");

      //Act
      addCypressLoadBalancerPlugin(
        onEventSpy,
        {
          ...this.cypressConfigFile,
          env: {}
        },
        "component"
      );

      //Assert
      expect(output).to.be.empty;
    });

    context("Empty runner handling", function () {
      it("initializes a runner with an empty spec if no specs have been found", function () {
        //Arrange
        this.getSpecsStub.restore();
        this.getSpecsStub = sandbox.stub(findCypressSpecs, "getSpecs").returns([]);
        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

        //Act
        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: `1/1` }
          },
          "component"
        );

        //Assert
        expect(updatedConfigFile.specPattern).to.have.lengthOf(1);
        expect(updatedConfigFile.specPattern[0]).to.include("clb-empty-1-1.cy.js");
      });

      it("initializes a runner with an empty spec if the runner count is greater than the file count", function () {
        //Arrange
        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

        //Act
        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: `${this.specFiles.length + 1}/${this.specFiles.length + 1}` }
          },
          "component"
        );

        //Assert
        expect(updatedConfigFile.specPattern).to.have.lengthOf(1);
        expect(updatedConfigFile.specPattern[0]).to.include("clb-empty-5-5.cy.js");
      });
    });

    context("inputs", function () {
      it("defaults to use the config specPattern defined for that testing type", function () {
        //Arrange
        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

        //Act
        const updatedConfigFile = addCypressLoadBalancerPlugin(
          onEventSpy,
          {
            ...this.cypressConfigFile,
            env: { runner: "1/1" }
          },
          "component"
        );

        //Assert
        expect(this.getSpecsStub).to.have.been.calledWith(sinon.match(this.cypressConfigFile), "component");
        expect(updatedConfigFile.specPattern).to.have.all.members([
          "cypress/tests/TestFunction.cy.ts",
          "cypress/tests/TestFunction.2.cy.ts",
          "cypress/tests/TestFunction.3.cy.ts",
          "cypress/tests/TestFunction.4.cy.ts"
        ]);
      });

      context("env.runner", function () {
        it("runner must be in X/Y format", function () {
          //Arrange
          stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

          //Act & Assert
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

        it("cannot have an index 0", function () {
          //Act & Assert
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

        it("cannot have a count of 0", function () {
          //Act & Assert
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

        it("the index cannot be higher than the runner count", function () {
          //Act & Assert
          expect(() =>
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "2/1" }
              },
              "component"
            )
          ).to.throw("env.runner is incorrect! The runner index cannot be greater than the total runner count: 2/1");
        });

        const test_theRunnerIndexSpecifiesTheSpecsThatWillBeRunInTheCypressProcess = [
          {
            runner: "1/2",
            expectedSpecPattern: ["cypress/tests/TestFunction.cy.ts", "cypress/tests/TestFunction.3.cy.ts"]
          },
          {
            runner: "2/2",
            expectedSpecPattern: ["cypress/tests/TestFunction.2.cy.ts", "cypress/tests/TestFunction.4.cy.ts"]
          }
        ];
        test_theRunnerIndexSpecifiesTheSpecsThatWillBeRunInTheCypressProcess.map(({ runner, expectedSpecPattern }) => {
          it("the runner index specifies the specs that will be run in the Cypress process", function () {
            //Arrange
            stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

            //Act
            const updatedConfigFile = addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner }
              },
              "component"
            );

            //Assert
            expect(updatedConfigFile.specPattern.length).to.eq(expectedSpecPattern.length);
            expect(updatedConfigFile.specPattern).to.deep.eq(expectedSpecPattern);
          });
        });
      });

      context("cypressLoadBalancerAlgorithm", function () {
        for (const algo of ["weighted-largest", "round-robin", "file-name"]) {
          it(`can specify a different load balancing algorithm: ${algo}`, function () {
            //Arrange
            debugInitializer.enable("cypress-load-balancer");
            stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

            //Act
            addCypressLoadBalancerPlugin(
              onEventSpy,
              {
                ...this.cypressConfigFile,
                env: { runner: "1/2", cypressLoadBalancerAlgorithm: algo }
              },
              "component"
            );

            //Assert
            expect(output).to.include(`Using algorithm for load balancing: ${algo}`);
          });
        }
      });
    });
  });

  context("after:run event", function () {
    beforeEach(function () {
      this.cypressConfigFile = {
        component: {
          specPattern: "**/*.cy.{js,jsx,ts,tsx}"
        },
        env: {
          runner: "1/2"
        }
      };

      sandbox = sinon.createSandbox();
      onEventSpy = sandbox.spy();

      this.results = getFixture<CypressCommandLine.CypressRunResult>("component-results.json", { parseJSON: true });
      this.initializeSpecMapFileStub = stubInitializeSpecMapFile(sandbox);
      this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
      this.getSpecsStub = sandbox
        .stub(findCypressSpecs, "getSpecs")
        .returns([
          "cypress/tests/TestFunction.cy.ts",
          "cypress/tests/TestFunction.2.cy.ts",
          "cypress/tests/TestFunction.3.cy.ts",
          "cypress/tests/TestFunction.4.cy.ts"
        ]);
    });

    afterEach(() => {
      sandbox.restore();
      sinon.restore();
    });

    it(`adds an "after:run" event`, async function () {
      //Arrange
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

      //Act
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Assert
      expect(onEventSpy.getCall(0).args[0]).to.eq("after:run");
    });

    it('is not registered if "env.runner" is not defined', function () {
      //Arrange
      const cypressConfigFile = this.cypressConfigFile;
      delete cypressConfigFile.env.runner;

      //Act
      addCypressLoadBalancerPlugin(onEventSpy, cypressConfigFile, "component");

      //Assert
      expect(onEventSpy).to.not.have.been.called;
    });

    //TODO: Redo
    it("is skipped if Cypress failed to execute", function () {
      //Arrange
      const updatedConfigFile = { ...this.cypressConfigFile, env: { runner: "1/2" } };
      const failedResults = { ...this.results, status: "failed" };
      const stub = sandbox.stub(LoadBalancingMap.prototype, "updateTestFileEntry");

      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(failedResults);

      //Assert
      expect(stub).to.not.have.been.called;
    });

    it("is skipped if env.cypressLoadBalancerSkipResults is true", function () {
      //Arrange
      const updatedConfigFile = {
        ...this.cypressConfigFile,
        env: { runner: "1/2", cypressLoadBalancerSkipResults: true }
      };
      const saveMapFileStub = sandbox.stub(LoadBalancingMap.prototype, "saveMapFile");
      const updateTestFileEntryStub = sandbox.stub(LoadBalancingMap.prototype, "updateTestFileEntry");

      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match("spec-map-1-2.json"));
      expect(updateTestFileEntryStub).to.not.have.been.called;
    });

    //Works for <= v23 of Cucumber
    const tests_isSkippedIfItIsACucumberDryRun = [
      "__cypress_cucumber_preprocessor_dont_use_this_suite",
      "__cypress_cucumber_preprocessor_registry_dont_use_this"
    ];
    tests_isSkippedIfItIsACucumberDryRun.map((injectedKeyName) => {
      it("is skipped if it is a Cucumber dry run", function () {
        //Arrange
        const updatedConfigFile = {
          ...this.cypressConfigFile,
          env: {
            runner: "1/2",
            dryRun: true,
            [injectedKeyName]: { isEventHandlersAttached: true }
          }
        };
        const saveMapFileStub = sandbox.stub(LoadBalancingMap.prototype, "saveMapFile");
        const updateTestFileEntryStub = sandbox.stub(LoadBalancingMap.prototype, "updateTestFileEntry");

        stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
        addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

        //Act
        const onEventHandler = getOnEventSpyHandler();
        onEventHandler(this.results);

        //Assert
        expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match("spec-map-1-2.json"));
        expect(updateTestFileEntryStub).to.not.have.been.called;
      });
    });

    it("is skipped if there is only an empty file being run", function () {
      //Arrange
      const emptyFileResults = getFixture<CypressCommandLine.CypressRunResult>(
        "component-results-for-empty-file.json",
        { parseJSON: true }
      );
      const updatedConfigFile = {
        ...this.cypressConfigFile,
        env: { runner: "1/2" }
      };
      const saveMapFileStub = sandbox.stub(LoadBalancingMap.prototype, "saveMapFile");
      const updateFileStatsStub = sandbox.stub(LoadBalancingMap.prototype, "updateTestFileEntry");

      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(emptyFileResults);

      //Assert
      expect(saveMapFileStub).to.not.have.been.calledWith(sinon.match.object, "spec-map-1-2.json");
      expect(updateFileStatsStub).to.not.have.been.called;
    });

    const tests_onlyCreatesAMapForTheCurrentRunnerAndNoOtherRunners = [
      { called: "1/2", notCalled: "2/2" },
      { called: "2/2", notCalled: "1/2" }
    ];
    tests_onlyCreatesAMapForTheCurrentRunnerAndNoOtherRunners.map(
      ({ called, notCalled }: { called: string; notCalled: string }) => {
        it("only creates a map for the current runner and no other runners", function () {
          //Assert
          const updatedConfigFile = { ...this.cypressConfigFile, env: { runner: called } };
          stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
          addCypressLoadBalancerPlugin(onEventSpy, updatedConfigFile, "component");

          //Prepare spy for "after:run" handler; if it is registered before the plugin, it will be called twice instead
          const spy = sandbox.spy(LoadBalancingMap.prototype, "saveMapFile");

          //Act
          const onEventHandler = getOnEventSpyHandler();
          onEventHandler(this.results);

          //Assert
          expect(spy).to.have.been.calledOnce;
          expect(this.writeFileSyncStub).to.have.been.calledWith(
            sinon.match(`spec-map-${called.replace("/", "-")}.json`)
          );
          expect(this.writeFileSyncStub).to.not.have.been.calledWith(
            sinon.match.any,
            sinon.match(`spec-map-${notCalled.replace("/", "-")}.json`)
          );
        });
      }
    );

    //TODO: move to base plugin
    it("runs file initialization for the base map if it does not exist", function () {
      //Arrange
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      //const onEventHandler = getOnEventSpyHandler();
      //onEventHandler(this.results);

      //Assert
      expect(this.initializeSpecMapFileStub).to.have.been.called;

      //TODO: this actually is called twice
      expect(this.writeFileSyncStub.firstCall).to.have.been.calledWith(sinon.match("spec-map.json"));
    });

    it("runs file initialization for the current runner map", function () {
      //Arrange
      const spy = sandbox.spy(LoadBalancingMap.prototype, "saveMapFile");
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      //1st call is for "spec-map.json" initialization (when not pre-defined)
      //2nd call is for "spec-map-1-2.json" initialization (when not pre-defined)
      expect(spy).to.have.been.calledTwice;
      expect(this.writeFileSyncStub.lastCall).to.have.been.calledWith(sinon.match("spec-map-1-2.json"));
    });

    it("uses the base spec map if there is only one runner (1/1)", function () {
      //Arrange
      this.cypressConfigFile.env.runner = "1/1";
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      expect(this.writeFileSyncStub).to.have.been.calledWith(sinon.match("spec-map.json"));
    });

    it("adds non-existing files to the current runner map (even if not run)", function () {
      //Arrange
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      const loadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const actualSpecs = Object.keys(loadBalancingMap.component);
      //@ts-expect-error Ignore
      const expectedSpecs = this.results.runs.map((r) => r.spec.relative);

      expect(actualSpecs).to.include(expectedSpecs[0]);
      expect(actualSpecs.length).to.be.greaterThan(expectedSpecs.length);
    });

    it("skips existing files in the current runner map", function () {
      //Arrange
      const existingSpecName = this.results.runs[0].spec.relative;
      stubSpecMapReads(sandbox, {
        "spec-map.json": {
          e2e: {},
          component: { [existingSpecName]: { stats: { durations: [3000], average: 3000, median: 3000 } } }
        }
      });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      //Assumes it already existed in the maps with one duration but does not update the main one
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(1);
      //Assumes it already existed in the maps with one duration then adds a new duration to current runner map
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.length.above(1);
    });

    it("saves the current runner map file when complete", function () {
      //Arrange
      const runner = this.cypressConfigFile.env.runner;
      stubSpecMapReads(sandbox, { "spec-map.json": { e2e: {}, component: {} } });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      //Test that the current runner map file name has the runner values in it
      expect(this.writeFileSyncStub.lastCall).to.have.been.calledWith(
        sandbox.match(`spec-map-${runner.replace("/", "-")}.json`)
      );

      //Test that the current runner map saved is accurate
      expect(
        sandbox
          .match({ e2e: {}, component: { "cypress/tests/TestFunction.cy.ts": { stats: sinon.match.object } } })
          .test(JSON.parse(this.writeFileSyncStub.lastCall.args[1]))
      ).to.be.true;
    });

    it("adds new durations to existing files in the current runner map only", function () {
      //Arrange
      const existingSpecName = this.results.runs[0].spec.relative;
      stubSpecMapReads(sandbox, {
        "spec-map.json": {
          e2e: {},
          component: { [existingSpecName]: { stats: { durations: [3000], average: 3000, median: 3000 } } }
        }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      //Assert
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(1);
      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([3000]);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.deep.eq([
        3000,
        this.results.runs[0].stats.duration
      ]);
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.lengthOf(2);
    });

    it("calculates the average duration and saves it per spec for the current runner map only", function () {
      //Arrange
      const existingSpecName = this.results.runs[0].spec.relative;
      this.results.runs[0].stats.duration = 1000; //Set it to an even number for clarity
      stubSpecMapReads(sandbox, {
        "spec-map.json": {
          e2e: {},
          component: { [existingSpecName]: { stats: { durations: [3000, 2000], average: 2500, median: 2000 } } }
        }
      });

      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Register spy after plugin but before after:run event is triggered
      const onEventHandler = getOnEventSpyHandler();
      const spy = sandbox.spy(TestFile.prototype, <never>"calculateAverage");

      //Act
      onEventHandler(this.results);

      //Assert
      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      //Ensure the correct test file was called
      expect(spy.lastCall).to.exist;
      expect(spy.lastCall.thisValue.path).eq(existingSpecName);
      expect(spy.lastCall.thisValue.durations).to.have.all.members([3000, 2000, 1000]);

      //Original spec-map value (should not be updated)
      expect(mainLoadBalancingMap.component[existingSpecName].stats.average).to.eq(2500);

      //Updated value on current runner map
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.average).to.eq(2000);
    });

    it("calculates the median duration and saves it per spec for the current runner map only", function () {
      //Arrange
      const existingSpecName = this.results.runs[0].spec.relative;
      this.results.runs[0].stats.duration = 500; //Set it to an even number for clarity

      stubSpecMapReads(sandbox, {
        "spec-map.json": {
          e2e: {},
          component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2500, median: 2000 } } }
        }
      });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Register spy after plugin but before after:run event is triggered
      const onEventHandler = getOnEventSpyHandler();
      const spy = sandbox.spy(TestFile.prototype, <never>"calculateMedian");

      //Act
      onEventHandler(this.results);

      //Assert
      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      //Ensure the correct test file was called
      expect(spy.lastCall).to.exist;
      expect(spy.lastCall.thisValue.path).eq(existingSpecName);
      expect(spy.lastCall.thisValue.durations).to.have.all.members([500, 1000, 2000, 3000]);

      //Original spec-map value (should not be updated)
      expect(mainLoadBalancingMap.component[existingSpecName].stats.median).to.eq(2000);

      //Updated value on current runner map
      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.median).to.eq(1000);
    });

    it("removes the oldest durations when the maximum limit has been reached for the current runner map only", function () {
      //Arrange
      sinon.stub(process, "env").value({ ...process.env, CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED: "3" });
      const existingSpecName = this.results.runs[0].spec.relative;
      stubSpecMapReads(sandbox, {
        "spec-map.json": {
          e2e: {},
          component: { [existingSpecName]: { stats: { durations: [3000, 2000, 1000], average: 2000, median: 2000 } } }
        }
      });
      addCypressLoadBalancerPlugin(onEventSpy, this.cypressConfigFile, "component");

      //Act
      const onEventHandler = getOnEventSpyHandler();
      onEventHandler(this.results);

      //Assert
      //First call is the main load balancer map (initialization)
      //Second call is the current runner map
      const mainLoadBalancingMap = JSON.parse(this.writeFileSyncStub.firstCall.args[1]);
      const currentRunnerLoadBalancingMap = JSON.parse(this.writeFileSyncStub.secondCall.args[1]);

      expect(mainLoadBalancingMap.component[existingSpecName].stats.durations).to.have.all.members([3000, 2000, 1000]);

      expect(currentRunnerLoadBalancingMap.component[existingSpecName].stats.durations).to.have.all.members([
        1000,
        2000,
        this.results.runs[0].stats.duration
      ]);
    });
  });
});
