import sinon from "sinon";
import utils from "../src/utils";
import performLoadBalancing from "../src/loadBalancer";
import fs from "node:fs";
import { getFixture } from "./support/utils";

const stubReadLoadBalancerFile = (
  returns: any = {
    e2e: {},
    component: {}
  }
) => {
  sinon.stub(fs, "readFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH).returns(JSON.stringify(returns));
};

describe("Load balancing", function () {
  beforeEach(function () {
    this.initializeLoadBalancingFilesStub = sinon.stub(utils, "initializeLoadBalancingFiles");
  });
  afterEach(function () {
    sinon.restore();
  });

  context("preparation", function () {
    it("runs file initialization", function () {
      stubReadLoadBalancerFile();
      performLoadBalancing(3, "e2e", []);
      expect(this.initializeLoadBalancingFilesStub.calledOnce).to.be.true;
    });
  });

  context("balancing files", function () {
    beforeEach(function () {
      //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
      const fixture = getFixture("load-balancing-map.json", { parseJSON: true });
      stubReadLoadBalancerFile(fixture);

      this.loadBalancingMap = fixture;
    });

    it("sorts files slowest to fastest", function () {
      sinon.stub(fs, "writeFileSync");
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(1, "e2e", filePaths);
      expect(runners[0]).to.deep.eq([
        "zoom.test.ts",
        "baz.test.ts",
        "bar.test.ts",
        "foo.test.ts",
        "wee.test.ts",
        "tuu.test.ts"
      ]);
    });

    it("balances files per runner equally", function () {
      sinon.stub(fs, "writeFileSync");
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(3, "e2e", filePaths);
      expect(runners).to.have.lengthOf(3);
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "foo.test.ts"]);
      expect(runners[1]).to.deep.eq(["baz.test.ts", "wee.test.ts"]);
      expect(runners[2]).to.deep.eq(["bar.test.ts", "tuu.test.ts"]);
    });

    it("can handle balancing runners when files cannot be balanced equally across them", function () {
      sinon.stub(fs, "writeFileSync");
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(4, "e2e", filePaths);
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "wee.test.ts"]);
      expect(runners[1]).to.deep.eq(["baz.test.ts", "tuu.test.ts"]);
      expect(runners[2]).to.deep.eq(["bar.test.ts"]);
      expect(runners[3]).to.deep.eq(["foo.test.ts"]);
    });

    it("only includes files given to it and does not consider others in the load balancing map", function () {
      sinon.stub(fs, "writeFileSync");
      const runners = performLoadBalancing(2, "e2e", ["zoom.test.ts", "bar.test.ts", "tuu.test.ts"]);
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "tuu.test.ts"]);
      expect(runners[1]).to.deep.eq(["bar.test.ts"]);
    });

    it("can handle less files than runners", function () {
      sinon.stub(fs, "writeFileSync");
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths);
      expect(runners[0]).to.have.lengthOf(1);
      expect(runners[runners.length - 1]).to.have.lengthOf(0);
    });

    it("can differentiate specs between e2e and component", function () {
      sinon.stub(fs, "writeFileSync");
      const e2eRunners = performLoadBalancing(1, "e2e", ["foo.test.ts", "bar.test.ts"]);
      const componentRunners = performLoadBalancing(1, "component", ["foo.test.ts", "bee.test.ts"]);
      expect(e2eRunners[0]).to.deep.eq(["bar.test.ts", "foo.test.ts"]);
      expect(componentRunners[0]).to.deep.eq(["foo.test.ts", "bee.test.ts"]);
    });

    it("can handle files that have not been run (or do not exist in map) yet", function () {
      const stub = sinon.stub(fs, "writeFileSync").withArgs(utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH);
      const runners = performLoadBalancing(1, "e2e", ["foo.test.ts", "newFile.test.ts"]);
      expect(runners[0]).to.deep.eq(["foo.test.ts", "newFile.test.ts"]);
      expect(stub.calledOnce).to.be.true;
      expect(JSON.parse(stub.firstCall.args[1] as string).e2e).to.haveOwnProperty("newFile.test.ts");
    });
  });
});
