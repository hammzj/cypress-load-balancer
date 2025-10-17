import fs from "node:fs";
import { expect } from "chai";
import sinon from "sinon";
import Sinon from "sinon";
import mergeLoadBalancingMapFiles from "../src/merge";
import { LoadBalancingMap } from "../src/types";
import utils from "../src/utils";

const sandbox: Sinon.SinonSandbox = sinon.createSandbox();

describe("mergeLoadBalancingMapFiles", function () {
  beforeEach(function () {
    this.writeFileSyncStub = sandbox.stub(fs, "writeFileSync");
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("merges maps back to a main file", function () {
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp1: LoadBalancingMap = {
      e2e: {
        "test-bar.ts": {
          stats: {
            durations: [300],
            average: 300,
            median: 300
          }
        }
      },
      component: {}
    };

    const temp2: LoadBalancingMap = {
      e2e: {
        "test-baz.ts": {
          stats: {
            durations: [400],
            average: 400,
            median: 400
          }
        }
      },
      component: {}
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp1, temp2]);
    expect(Object.keys(merged.e2e)).to.include.members(["test-foo.ts", "test-bar.ts", "test-baz.ts"]);
  });

  it("existing files have their durations updated", function () {
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200, 300],
            average: 200,
            median: 200
          }
        }
      },
      component: {}
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp]);
    expect(merged.e2e["test-foo.ts"].stats.durations).to.deep.eq([100, 200, 300]);
  });

  it("shrinks the duration of files above the maximum length", function () {
    sandbox.stub(utils, "MAX_DURATIONS_ALLOWED").get(() => 3);
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [200, 200, 200],
            average: 200,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [200, 200, 200, 300],
            average: 300,
            median: 200
          }
        }
      },
      component: {}
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp]);
    expect(merged.e2e["test-foo.ts"].stats.durations).to.have.length(3);
    expect(merged.e2e["test-foo.ts"].stats.durations).to.deep.eq([200, 200, 300]);
  });

  it("adds new files to the main map if not existing", function () {
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp: LoadBalancingMap = {
      e2e: {
        "test-bar.ts": {
          stats: {
            durations: [300],
            average: 300,
            median: 300
          }
        }
      },
      component: {}
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp]);
    expect(merged.e2e["test-foo.ts"]).to.exist;
    expect(merged.e2e["test-bar.ts"]).to.exist;
  });

  it("does not impact existing files in another testing type", function () {
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {
        "test-zoom.ts": {
          stats: {
            durations: [400],
            average: 400,
            median: 400
          }
        }
      }
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp]);
    expect(merged.e2e["test-foo.ts"].stats.durations).to.deep.eq([100, 200]);
    expect(merged.component["test-zoom.ts"].stats.durations).to.deep.eq([400]);
  });

  it("re-calculates file stats", function () {
    const stub = sandbox.stub(utils, "updateFileStats");
    const orig: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200],
            average: 150,
            median: 200
          }
        }
      },
      component: {}
    };

    const temp: LoadBalancingMap = {
      e2e: {
        "test-foo.ts": {
          stats: {
            durations: [100, 200, 300],
            average: 200,
            median: 200
          }
        }
      },
      component: {}
    };

    const merged = mergeLoadBalancingMapFiles(orig, [temp]);

    expect(stub).to.have.been.called;
    expect(merged.e2e["test-foo.ts"].stats.average).to.eq(200);
  });
});
