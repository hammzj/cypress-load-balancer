import sinon from "sinon";
import * as utils from "../src/utils";
import performLoadBalancing from "../src/loadBalancer";
import fs from "node:fs";

let initializeLoadBalancingFilesStub: sinon.SinonStub;

describe("Load balancing", function () {
  beforeEach(function () {
    //TODO: TEMPORARY
    sinon.stub(fs, "mkdirSync");
    sinon.stub(fs, "writeFileSync");
    //  initializeLoadBalancingFilesStub = sinon.stub(utils, 'initializeLoadBalancingFiles')
  });
  afterEach(function () {
    sinon.restore();
  });

  context("preparation", function () {
    it("runs initialization", function () {
      performLoadBalancing(3, "e2e", []);
      expect(initializeLoadBalancingFilesStub.calledOnce).to.be.true;
    });

    it("creates an empty file entry if one does not exist", function () {});
  });

  context("balancing files", function () {
    beforeEach(function () {
      //TODO: move to a fixture file
      this.loadBalancingMap = {
        //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
        e2e: {
          "foo.test.ts": {
            stats: {
              durations: [100, 200, 300],
              average: 200
            }
          },
          "bar.test.ts": {
            stats: {
              durations: [300],
              average: 300
            }
          },
          "baz.test.ts": {
            stats: {
              durations: [1000, 1000, 100, 1000],
              average: 1000
            }
          },
          "wee.test.ts": {
            stats: {
              durations: [25, 50, 75, 100],
              average: 63
            }
          },
          "zoom.test.ts": {
            stats: {
              durations: [4000, 4000, 4000],
              average: 4000
            }
          },
          "tuu.test.ts": {
            stats: {
              durations: [1, 1, 1, 1, 1, 1],
              average: 1
            }
          }
        },

        //SLOWEST TO FASTEST: "bee.test.ts", "foo.test.ts"
        component: {
          "foo.test.ts": {
            stats: {
              durations: [50],
              average: 50
            },
            "bee.test.ts": {
              stats: {
                durations: [100],
                average: 100
              }
            }
          }
        }
      };

      sinon.stub(fs, "readFileSync").returns(JSON.stringify(this.loadBalancingMap));
    });

    it("can differentiate specs between e2e and component", function () {});

    it("balances files per runner equally", function () {
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(3, "e2e", filePaths);
      //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
      expect(runners).to.have.lengthOf(3);
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "foo.test.ts"]);
      expect(runners[1]).to.deep.eq(["baz.test.ts", "wee.test.ts"]);
      expect(runners[2]).to.deep.eq(["bar.test.ts", "tuu.test.ts"]);
    });

    it("can handle balancing runners when files cannot be balanced equally across them", function () {
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(4, "e2e", filePaths);
      //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "wee.test.ts"]);
      expect(runners[1]).to.deep.eq(["baz.test.ts", "tuu.test.ts"]);
      expect(runners[2]).to.deep.eq(["bar.test.ts"]);
      expect(runners[3]).to.deep.eq(["foo.test.ts"]);
    });

    it("only includes files given to it and does not consider others in the load balancing map", function () {
      const runners = performLoadBalancing(2, "e2e", ["zoom.test.ts", "bar.test.ts", "tuu.test.ts"]);
      //SLOWEST TO FASTEST: "zoom.test.ts", "baz.test.ts", "bar.test.ts", "foo.test.ts", "wee.test.ts", "tuu.test.ts"
      expect(runners[0]).to.deep.eq(["zoom.test.ts", "tuu.test.ts"]);
      expect(runners[1]).to.deep.eq(["bar.test.ts"]);
    });

    it("can handle less files than runners", function () {
      const filePaths = Object.keys(this.loadBalancingMap.e2e);
      const runners = performLoadBalancing(filePaths.length + 1, "e2e", filePaths);
      expect(runners[0]).to.have.lengthOf(1);
      expect(runners[runners.length - 1]).to.have.lengthOf(0);
    });
  });
});
