import sinon from "sinon";
import { expect } from "chai";
import { TestFile } from "../src/load.balancing.map";
import path from "path";

describe("TestFile", function () {
  beforeEach(function () {});
  afterEach(function () {
    sinon.restore();
  });

  context("TestFile.convertToInternalPath", () => {
    const expected = `tests/browser/foo.test.js`;
    it("converts absolute Windows paths to a relative POSIX path format", () => {
      sinon.stub(process, "cwd").returns(`B:\\GitHub\\Projects\\test-repo`);
      expect(TestFile.convertToInternalPath(`B:\\GitHub\\Projects\\test-repo\\tests\\browser\\foo.test.js`)).to.equal(
        expected
      );
    });

    it("converts absolute UNIX paths to a relative POSIX path format", () => {
      sinon.stub(process, "cwd").returns(`/Users/hammzj/Documents/GitHub/test-repo/`);
      expect(
        TestFile.convertToInternalPath(`/Users/hammzj/Documents/GitHub/test-repo/tests/browser/foo.test.js`)
      ).to.equal(expected);
    });

    it("converts relative UNIX paths to a relative POSIX path format", () => {
      expect(TestFile.convertToInternalPath(`tests/browser/foo.test.js`)).to.equal(expected);
    });
  });

  it("sets its internal path to a relative POSIX format", () => {
    sinon.stub(process, "cwd").returns(`/Users/hammzj/Documents/GitHub/test-repo/`);
    const tf = new TestFile(`/Users/hammzj/Documents/GitHub/test-repo/tests/browser/foo.test.js`);
    expect(tf.internalPath).to.equal(`tests/browser/foo.test.js`);
  });

  context("systemPath", () => {
    it("can convert to relative Windows path on Windows systems", () => {
      sinon.stub(process, "platform").returns("win32");
      sinon.stub(process, "cwd").returns(`B:\\GitHub\\Projects\\test-repo`);
      const tf = new TestFile(`B:\\GitHub\\Projects\\test-repo\\tests\\browser\\foo.test.js`);
      expect(tf.systemPath).to.equal(`tests\\browser\\foo.test.js`);
    });

    for (const system of [
      "aix",
      "android",
      "darwin",
      "freebsd",
      "haiku",
      "linux",
      "openbsd",
      "sunos",
      "cygwin",
      "netbsd"
    ]) {
      it(`uses relative POSIX path on other systems: ${system}`, () => {
        sinon.stub(process, "platform").returns(system);
        sinon.stub(process, "cwd").returns(`/Users/hammzj/Documents/GitHub/test-repo/`);

        //To get around strangeness with mocking the platform
        //If not provided, it will still try to convert to a Windows path on a Windows system
        sinon.stub(path, 'relative').callsFake(path.posix.relative)

        const tf = new TestFile(`/Users/hammzj/Documents/GitHub/test-repo/tests/browser/foo.test.js`);
        expect(tf.internalPath).to.equal(`tests/browser/foo.test.js`);
      });
    }
  });

  context("addDurations", () => {
    it("allows adding durations on initialization", () => {
      const tf = new TestFile(`foo.test.js`, [100, 200, 200]);
      expect(tf.stats.durations).to.deep.eq([100, 200, 200]);
    });

    it("can add a new duration to its list of durations", () => {
      const tf = new TestFile(`foo.test.js`);
      expect(tf.stats.durations).to.have.lengthOf(0);
      tf.addDurations(100);
      expect(tf.stats.durations).to.deep.eq([100]);
    });

    it("can add multiple new durations to its list of durations", () => {
      const tf = new TestFile(`foo.test.js`, [100]);
      tf.addDurations(...[200, 400]);
      expect(tf.stats.durations).to.deep.eq([100, 200, 400]);
    });

    it("defaults to a max size of 10 durations", () => {
      const tf = new TestFile(`foo.test.js`);
      tf.addDurations(...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
      expect(tf.stats.durations).to.have.lengthOf(10);
    });

    it("limits the durations to the max size on initialization", () => {
      sinon.stub(process, "env").value({ ...process.env, CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED: "2" });
      const tf = new TestFile(`foo.test.js`, [100, 200, 300]);
      expect(tf.stats.durations).to.deep.eq([200, 300]);
    });

    it("removes the oldest durations when the max size has been reached", () => {
      sinon.stub(process, "env").value({ ...process.env, CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED: "4" });
      const tf = new TestFile(`foo.test.js`, [100, 200, 300, 400]);
      tf.addDurations(...[500, 600]);
      expect(tf.stats.durations).to.deep.eq([300, 400, 500, 600]);
    });

    it("recalculates the statistics on each new addition", () => {
      const tf = new TestFile(`foo.test.js`, [100, 200]);

      //Roundabout way to ensure the calculation method is called in the constructor
      expect(tf.getMedian()).to.eq(100);
      expect(tf.getAverage()).to.eq(150);

      //Make sure it's called again
      const spy = sinon.spy(tf, <never>"calculateStatistics");

      tf.addDurations(300, 400, 1000);
      expect(spy).to.have.callCount(1);

      expect(tf.getMedian()).to.eq(300);
      expect(tf.getAverage()).to.eq(400);
    });
  });

  context("calculating statistics", () => {
    it("can calculate the average based on the durations", () => {
      const tf = new TestFile(`foo.test.js`, [100, 200]);
      expect(tf.getAverage()).to.eq(150);

      const tf2 = new TestFile(`bar.test.js`, [200, 600, 400, 200]);
      expect(tf2.getAverage()).to.eq(350);
    });

    it("can calculate the median based on the durations", () => {
      //only one
      const tf = new TestFile(`foo.test.js`, [100]);
      expect(tf.getMedian()).to.eq(100);

      //two similar numbers
      const tf2 = new TestFile(`bar.test.js`, [100, 200, 200]);
      expect(tf2.getMedian()).to.eq(200);

      //reverse order
      const tf3 = new TestFile(`baz.test.js`, [300, 200, 100]);
      expect(tf3.getMedian()).to.eq(200);

      //should sort highest to lowest
      const tf4 = new TestFile(`wee.test.js`, [100, 500, 200, 100, 300]);
      expect(tf4.getMedian()).to.eq(200);
    });
  });
});
