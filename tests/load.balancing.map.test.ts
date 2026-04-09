import fs, { writeFileSync } from "node:fs";
import path from "path";
import sinon from "sinon";
import { expect } from "chai";
import { LoadBalancingMap, TestFile } from "../src/load.balancing.map";

describe("LoadBalancingMap", function () {
  beforeEach(function () {});
  afterEach(function () {
    sinon.restore();
  });

  context("initialization", function () {
    it('defaults to use "spec-map.json" as the file name if one is not provided', function () {
      const loadBalancingMap = new LoadBalancingMap();
      expect(loadBalancingMap.path).to.eq(path.join(process.cwd(), ".cypress_load_balancer", "spec-map.json"));
    });

    it("can use a custom file name", function () {
      const loadBalancingMap = new LoadBalancingMap("nested/my-map.json");
      expect(loadBalancingMap.path).to.eq(path.join(process.cwd(), ".cypress_load_balancer", "nested/my-map.json"));
    });

    it('removes duplicate ".json" when initializing custom file names', function () {
      const loadBalancingMap = new LoadBalancingMap("nested/my-map.json.json.json");
      expect(loadBalancingMap.path).to.eq(path.join(process.cwd(), ".cypress_load_balancer", "nested/my-map.json"));
    });

    context("importJSON", function () {
      it("attempts to import from an existing JSON file on initialization", function () {
        const fakeFile = {
          e2e: {
            "e2e-tests/foo.test.js": {
              stats: {
                durations: [1000],
                average: 1000,
                median: 1000
              }
            }
          },
          component: {}
        };
        sinon.stub(fs, "existsSync").withArgs(sinon.match("spec-map.json")).returns(true);
        sinon.stub(fs, "readFileSync").withArgs(sinon.match("spec-map.json")).returns(JSON.stringify(fakeFile));

        const loadBalancingMap = new LoadBalancingMap();

        const testFile = loadBalancingMap.getTestFiles("e2e", ["e2e-tests/foo.test.js"])[0];
        expect(testFile).to.exist;
        expect(testFile.getMedian()).to.eq(1000);
      });

      it("skips when the base JSON file does not exist", function () {
        sinon.stub(fs, "existsSync").withArgs(sinon.match("spec-map.json")).returns(false);
        const readFileSyncSpy = sinon.spy(fs, "readFileSync").withArgs(sinon.match("spec-map.json"));

        const loadBalancingMap = new LoadBalancingMap();

        expect(readFileSyncSpy).to.not.have.been.called;
        const testFiles = loadBalancingMap.getTestFiles("e2e", ["e2e-tests/foo.test.js"]);
        expect(testFiles).to.be.empty;
      });

      //TODO
      it.skip("rejects on bad JSON files", function () {});
    });
  });

  context("interacting with TestFiles class", function () {
    context("addTestFileEntry", function () {
      it("adds a new TestFile without statistics to the correct testing type", function () {
        const loadBalancingMap = new LoadBalancingMap();

        const result1 = loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
        const result2 = loadBalancingMap.addTestFileEntry("e2e", "e2e/bar.test.js");
        const result3 = loadBalancingMap.addTestFileEntry("component", "component/foo.ct.test.js");

        const e2eFiles = loadBalancingMap.getTestFiles("e2e", ["e2e/foo.test.js", "e2e/bar.test.js"]);
        const componentFiles = loadBalancingMap.getTestFiles("component", ["component/foo.ct.test.js"]);

        expect([result1, result2, result3]).deep.eq([true, true, true]);

        expect(e2eFiles).to.have.lengthOf(2);
        expect(componentFiles).to.have.lengthOf(1);
        expect(componentFiles[0].internalPath).to.eq("component/foo.ct.test.js");
      });

      it("does not add a TestFile if already existing to prevent accidental overwrites", function () {
        const loadBalancingMap = new LoadBalancingMap();
        const spy = sinon.spy(loadBalancingMap, <never>"setTestFileEntry");

        loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");

        const result = loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
        expect(result).to.be.false;
        expect(spy).to.have.been.calledOnce;
      });

      it("can be set to force overwrite a TestFile even if already existing", function () {
        const loadBalancingMap = new LoadBalancingMap();
        const spy = sinon.spy(loadBalancingMap, <never>"setTestFileEntry");
        loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");

        const result = loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js", { force: true });

        expect(result).to.be.true;
        expect(spy).to.have.callCount(2);
      });

      it("changes absolute to relative paths", function () {
        sinon.stub(process, "cwd").returns("/docs/test-project/");
        const loadBalancingMap = new LoadBalancingMap();

        loadBalancingMap.addTestFileEntry("e2e", "/docs/test-project/tests/foo.test.js");

        const testFile = loadBalancingMap.getTestFiles("e2e", ["tests/foo.test.js"])[0];
        expect(testFile.internalPath).to.eq("tests/foo.test.js");
      });

      it("changes Windows to POSIX paths for keys", function () {
        sinon.stub(process, "platform").returns("win32");
        sinon.stub(process, "cwd").returns("C:\\docs\\test-project\\");
        const loadBalancingMap = new LoadBalancingMap();

        loadBalancingMap.addTestFileEntry("e2e", "C:\\docs\\test-project\\tests\\foo.test.js");

        const testFile = loadBalancingMap.getTestFiles("e2e", ["tests/foo.test.js"])[0];
        expect(testFile.internalPath).to.eq("tests/foo.test.js");
      });
    });

    context("getTestFiles", function () {
      it("retrieves test files from the e2e testing type that match the inputted file paths", function () {
        const nonExistantPath = "e2e/wee.test.js";
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
        loadBalancingMap.addTestFileEntry("e2e", "e2e/bar.test.js");

        const testFiles = loadBalancingMap.getTestFiles("e2e", ["e2e/foo.test.js", "e2e/bar.test.js", nonExistantPath]);

        expect(testFiles).to.have.lengthOf(2);
        testFiles.map((tf) => expect(tf).to.be.instanceOf(TestFile));
        expect(testFiles.map((tf) => tf.internalPath)).to.deep.eq(["e2e/foo.test.js", "e2e/bar.test.js"]);
      });

      it("retrieves test files from the component testing type that match the inputted file paths", function () {
        const nonExistantPath = "ct/wee.test.js";
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");

        const testFiles = loadBalancingMap.getTestFiles("component", ["ct/foo.test.js", nonExistantPath]);

        expect(testFiles).to.have.lengthOf(1);
        expect(testFiles[0]).to.be.instanceOf(TestFile);
        expect(testFiles[0].internalPath).to.eq("ct/foo.test.js");
      });

      it("filters out files that are not listed for that testing type", function () {
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");
        loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
        loadBalancingMap.addTestFileEntry("e2e", "e2e/bar.test.js");

        const e2eFiles = loadBalancingMap.getTestFiles("e2e", ["e2e/foo.test.js", "e2e/bar.test.js", "ct/foo.test.js"]);
        const componentFiles = loadBalancingMap.getTestFiles("component", [
          "e2e/foo.test.js",
          "e2e/bar.test.js",
          "ct/foo.test.js"
        ]);

        expect(e2eFiles.map((tf) => tf.internalPath)).to.deep.eq(["e2e/foo.test.js", "e2e/bar.test.js"]);
        expect(componentFiles[0].internalPath).to.eq("ct/foo.test.js");
      });

      it("changes Windows paths to POSIX paths to reference the internal key correctly", function () {
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct\\foo.test.js");

        const componentFiles = loadBalancingMap.getTestFiles("component", ["ct\\foo.test.js"]);

        expect(componentFiles[0].internalPath).to.eq("ct/foo.test.js");
      });
    });

    context("updateTestFileEntry", function () {
      it("update a test file with new durations", function () {
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");

        const result1 = loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [100]);
        const result2 = loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [200, 300, 400, 1000]);
        expect(result1).to.be.true;
        expect(result2).to.be.true;

        const testFile = loadBalancingMap.getTestFiles("component", ["ct/foo.test.js"])[0];
        expect(testFile.getMedian()).to.eq(300);
        expect(testFile.getAverage()).to.eq(400);
      });

      it("skips if no durations are provided", function () {
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");
        loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [100]);

        const result = loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", []);
        expect(result).to.be.false;

        const testFile = loadBalancingMap.getTestFiles("component", ["ct/foo.test.js"])[0];
        expect(testFile.getMedian()).to.eq(100);
        expect(testFile.getAverage()).to.eq(100);
      });

      it("skips if the file is not found", function () {
        const loadBalancingMap = new LoadBalancingMap();
        loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");
        loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [100]);

        const result = loadBalancingMap.updateTestFileEntry("e2e", "ct/foo.test.js", [200]);
        expect(result).to.be.false;

        const testFile = loadBalancingMap.getTestFiles("component", ["ct/foo.test.js"])[0];
        expect(testFile.getMedian()).to.eq(100);
        expect(testFile.getAverage()).to.eq(100);
      });
    });
  });

  context("saveMapFile", function () {
    beforeEach(function () {
      sinon.stub(process, "platform").returns("linux");
      sinon.stub(process, "cwd").returns("/test-project/");
    });

    it("writes a represenation of the map to a JSON file using its base path", function () {
      const stub = sinon.stub(fs, "writeFileSync");
      const loadBalancingMap = new LoadBalancingMap();
      loadBalancingMap.saveMapFile();

      expect(stub).to.have.been.calledWith(loadBalancingMap.path, JSON.stringify({ e2e: {}, component: {} }));
    });

    it("can write to a different file name or file path in its container directory", function () {
      const stub = sinon.stub(fs, "writeFileSync");
      const loadBalancingMap = new LoadBalancingMap();

      loadBalancingMap.saveMapFile("spec-map-1-2.json");
      expect(stub).to.have.been.calledWith(
        sinon.match(path.join(".cypress_load_balancer", "spec-map-1-2.json")),
        JSON.stringify({ e2e: {}, component: {} })
      );

      loadBalancingMap.saveMapFile("foo/spec-map-1-2.json");
      expect(stub).to.have.been.calledWith(
        sinon.match(path.join(".cypress_load_balancer", "foo", "spec-map-1-2.json")),
        JSON.stringify({ e2e: {}, component: {} })
      );
    });

    it("can save new data when new test files are added", function () {
      const stub = sinon.stub(fs, "writeFileSync");
      const loadBalancingMap = new LoadBalancingMap();
      loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
      loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");

      loadBalancingMap.saveMapFile();

      //Initial save
      expect(stub.lastCall).to.have.been.calledWith(
        sinon.match.string,
        JSON.stringify({
          e2e: { "e2e/foo.test.js": { stats: { durations: [], average: 0, median: 0 } } },
          component: { "ct/foo.test.js": { stats: { durations: [], average: 0, median: 0 } } }
        })
      );

      //Add another file
      loadBalancingMap.addTestFileEntry("component", "ct/bar.test.js");
      loadBalancingMap.saveMapFile();

      //Initial save
      expect(stub.lastCall).to.have.been.calledWith(
        sinon.match.string,
        JSON.stringify({
          e2e: { "e2e/foo.test.js": { stats: { durations: [], average: 0, median: 0 } } },
          component: {
            "ct/foo.test.js": { stats: { durations: [], average: 0, median: 0 } },
            "ct/bar.test.js": { stats: { durations: [], average: 0, median: 0 } }
          }
        })
      );
    });

    it("can save the data when test files are updated", function () {
      const stub = sinon.stub(fs, "writeFileSync");
      const loadBalancingMap = new LoadBalancingMap();

      loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
      loadBalancingMap.updateTestFileEntry("e2e", "e2e/foo.test.js", [1000, 2000, 3000]);

      loadBalancingMap.addTestFileEntry("component", "ct/foo.test.js");
      loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [100]);

      loadBalancingMap.saveMapFile();

      //Initial save with updates
      expect(stub.lastCall).to.have.been.calledWith(
        sinon.match.string,
        JSON.stringify({
          e2e: { "e2e/foo.test.js": { stats: { durations: [1000, 2000, 3000], average: 2000, median: 2000 } } },
          component: { "ct/foo.test.js": { stats: { durations: [100], average: 100, median: 100 } } }
        })
      );

      //Update a file
      loadBalancingMap.updateTestFileEntry("component", "ct/foo.test.js", [200]);
      loadBalancingMap.saveMapFile();

      expect(stub.lastCall).to.have.been.calledWith(
        sinon.match.string,
        JSON.stringify({
          e2e: { "e2e/foo.test.js": { stats: { durations: [1000, 2000, 3000], average: 2000, median: 2000 } } },
          component: { "ct/foo.test.js": { stats: { durations: [100, 200], average: 150, median: 100 } } }
        })
      );
    });
  });

  context("initializeSpecMapFile", function () {
    beforeEach(function () {
      sinon.stub(process, "platform").returns("linux");
      sinon.stub(process, "cwd").returns("/test-project/");
      this.writeFileSync = sinon.stub(fs, "writeFileSync");
      this.mkDirSyncStub = sinon.stub(fs, "mkdirSync");
      this.BASE_DIR = path.join(process.cwd(), ".cypress_load_balancer");
    });

    it("initializes the container directory when not existing", function () {
      sinon.stub(fs, "existsSync").withArgs(this.BASE_DIR).returns(false);

      const loadBalancingMap = new LoadBalancingMap();
      const [isDirectoryCreated] = loadBalancingMap.initializeSpecMapFile();

      expect(this.mkDirSyncStub).to.have.been.calledWith(this.BASE_DIR);
      expect(isDirectoryCreated).to.be.true;
    });

    it("does not create the directory when it is existing and not forced", function () {
      sinon.stub(fs, "existsSync").withArgs(this.BASE_DIR).returns(true);

      const loadBalancingMap = new LoadBalancingMap();
      const [isDirectoryCreated] = loadBalancingMap.initializeSpecMapFile();

      expect(this.mkDirSyncStub).to.not.have.been.called;
      expect(isDirectoryCreated).to.be.false;
    });

    it("creates a representation of itself as a JSON file when not existing", function () {
      const loadBalancingMap = new LoadBalancingMap();
      const spy = sinon.spy(loadBalancingMap, "saveMapFile");
      sinon.stub(fs, "existsSync").withArgs(loadBalancingMap.path).returns(false);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, isFileCreated] = loadBalancingMap.initializeSpecMapFile();
      expect(spy).to.have.called;
      expect(isFileCreated).to.be.true;
    });

    it("does not create the file when it is existing and not forced", function () {
      const loadBalancingMap = new LoadBalancingMap();
      const spy = sinon.spy(loadBalancingMap, "saveMapFile");
      sinon.stub(fs, "existsSync").withArgs(loadBalancingMap.path).returns(true);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, isFileCreated] = loadBalancingMap.initializeSpecMapFile();
      expect(spy).to.not.have.called;
      expect(isFileCreated).to.be.false;
    });

    it("can force create the container directory even when existing", function () {
      sinon.stub(fs, "existsSync").withArgs(this.BASE_DIR).returns(true);

      const loadBalancingMap = new LoadBalancingMap();
      const [isDirectoryCreated] = loadBalancingMap.initializeSpecMapFile({ forceCreateMainDirectory: true });

      expect(this.mkDirSyncStub).to.have.been.calledWith(this.BASE_DIR);
      expect(isDirectoryCreated).to.be.true;
    });

    it("can force create the mapfile even when existing", function () {
      const loadBalancingMap = new LoadBalancingMap();
      const spy = sinon.spy(loadBalancingMap, "saveMapFile");
      sinon.stub(fs, "existsSync").withArgs(loadBalancingMap.path).returns(true);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, isFileCreated] = loadBalancingMap.initializeSpecMapFile({ forceCreateFile: true });
      expect(spy).to.have.called;
      expect(isFileCreated).to.be.true;
    });

    //Might remove if I decide not to allow creating the map with a different file name. There are issues when it is not using the base mapping file.
    it("can create the file using a custom file name when provided upon initialization", function () {});
  });

  context("prepareForLoadBalancing", function () {
    it("does not do anything if no file paths are provided", function () {
      const loadBalancingMap = new LoadBalancingMap();

      const initializeSpecMapFileStub = sinon.stub(loadBalancingMap, "initializeSpecMapFile");
      const saveMapFileSpy = sinon.stub(loadBalancingMap, "saveMapFile");

      //No args
      loadBalancingMap.prepareForLoadBalancing("e2e");
      expect(saveMapFileSpy).not.to.have.been.called;
      expect(initializeSpecMapFileStub).not.to.have.been.called;

      //Empty pattern
      loadBalancingMap.prepareForLoadBalancing("e2e", []);
      expect(saveMapFileSpy).not.to.have.been.called;
      expect(initializeSpecMapFileStub).not.to.have.been.called;
    });

    it("initializes the JSON file and adds any new entries", function () {
      const loadBalancingMap = new LoadBalancingMap();
      loadBalancingMap.addTestFileEntry("e2e", "e2e/foo.test.js");
      loadBalancingMap.updateTestFileEntry("e2e", "e2e/foo.test.js", [100]);

      const initializeSpecMapFileStub = sinon.stub(loadBalancingMap, "initializeSpecMapFile");
      const saveMapFileSpy = sinon.spy(loadBalancingMap, "saveMapFile");
      const writeFileSyncSpy = sinon.stub(fs, "writeFileSync").withArgs(sinon.match("spec-map.json"));

      loadBalancingMap.prepareForLoadBalancing("e2e", ["e2e/bar.test.js"]);

      expect(initializeSpecMapFileStub).to.have.been.calledOnce;
      expect(saveMapFileSpy).to.have.been.calledOnce;
      expect(writeFileSyncSpy.lastCall).to.have.been.calledWith(
        sinon.match("spec-map.json"),
        JSON.stringify({
          e2e: {
            "e2e/foo.test.js": { stats: { durations: [100], average: 100, median: 100 } },
            "e2e/bar.test.js": { stats: { durations: [], average: 0, median: 0 } }
          },
          component: {}
        })
      );
    });
  });
});
