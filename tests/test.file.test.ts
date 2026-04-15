import sinon from "sinon";
import { expect } from "chai";
import path from "path";
import { TestFile } from "../src/load.balancing.map";

describe("TestFile", function () {
  beforeEach(function () {});
  afterEach(function () {
    sinon.restore();
  });

  context("TestFile.convertToInternalPath", () => {
    const expected = `tests/browser/foo.test.js`;

    it("converts absolute Windows paths to a relative POSIX path format", () => {
      sinon.stub(process, "platform").value("win32");
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

  it("can determine if the test is a new file", () => {
    expect(new TestFile("test-a.js").isNewFile()).to.be.true;
    expect(new TestFile("test-b.js", [100]).isNewFile()).to.be.false;
  });

  context("systemPath", () => {
    it("can convert to relative Windows path on Windows systems", () => {
      const fakeCwd = `B:\\GitHub\\Projects\\test-repo`;
      sinon.stub(process, "platform").value("win32");
      sinon.stub(process, "cwd").returns(fakeCwd);
      const win32Spy = sinon.spy(path.win32, "relative");
      const posixSpy = sinon.spy(path.posix, "relative");

      const testFileAbsolutePath = `B:\\GitHub\\Projects\\test-repo\\tests\\browser\\foo.test.js`;
      const tf = new TestFile(testFileAbsolutePath);

      expect(win32Spy).to.have.been.calledWith(fakeCwd, testFileAbsolutePath);
      expect(posixSpy).to.not.have.been.called;
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
        const fakeCwd = `/usr/docs/test-repo`;
        sinon.stub(process, "platform").value(system);
        sinon.stub(process, "cwd").returns(fakeCwd);
        const win32Spy = sinon.spy(path.win32, "relative");
        const posixSpy = sinon.spy(path.posix, "relative");

        const testFileAbsolutePath = `/usr/docs/test-repo/tests/browser/foo.test.js`;
        const tf = new TestFile(testFileAbsolutePath);

        expect(posixSpy).to.have.been.calledWith(fakeCwd, testFileAbsolutePath);
        expect(win32Spy).to.not.have.been.called;
        expect(tf.systemPath).to.equal(`tests/browser/foo.test.js`);
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
      expect(spy).to.have.been.calledOnce;

      expect(tf.getMedian()).to.eq(300);
      expect(tf.getAverage()).to.eq(400);
    });

    it("skips calculating statistics if the array is empty", function () {
      const tf = new TestFile(`foo.test.js`, [100, 200]);
      const spy = sinon.spy(tf, <never>"calculateStatistics");

      tf.addDurations();
      expect(tf.stats.durations).to.deep.eq([100, 200]);
      expect(spy).to.not.have.been.called;
    });
  });

  context("calculating statistics", () => {
    it("can calculate the average based on the durations", () => {
      const tf = new TestFile(`foo.test.js`, [100, 200]);
      expect(tf.getAverage()).to.eq(150);

      const tf2 = new TestFile(`bar.test.js`, [200, 600, 400, 200]);
      expect(tf2.getAverage()).to.eq(350);

      //No entries
      const tf3 = new TestFile(`bar.test.js`, []);
      expect(tf3.getAverage()).to.eq(0);
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

      //No entries
      const tf5 = new TestFile(`bar.test.js`, []);
      expect(tf5.getMedian()).to.eq(0);
    });
  });
});
