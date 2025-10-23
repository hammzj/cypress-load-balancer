import { expect } from "chai";
import { debug as debugInitializer } from "debug";
import { debug } from "../src/helpers";

describe("debug", function () {
  let output: string, write;
  //eslint-disable-next-line prefer-const
  write = process.stderr.write;

  beforeEach(function () {
    //if (process.env.DEBUG == null) process.env.DEBUG = "FAKE";

    output = "";
    //@ts-expect-error Ignore
    process.stderr.write = function (str) {
      output += str;
    };
  });

  afterEach(function () {
    process.stderr.write = write;
  });

  it("sends logs to STDOUT when DEBUG=cypress-load-balancer", function () {
    debugInitializer.enable("cypress-load-balancer");
    debug("This is a test log!", "Second message");
    expect(output).to.match(/cypress-load-balancer.+This is a test log! Second message/);
  });

  it("sends logs to STDOUT when DEBUG=*", function () {
    debugInitializer.enable("*");
    debug("This is a test log!", "Second message");
    expect(output).to.match(/cypress-load-balancer.+This is a test log! Second message/);
  });

  it("does not send logs when DEBUG is not set", function () {
    debugInitializer.disable();
    debug("This is a test log!", "Second message");
    expect(output).to.not.match(/cypress-load-balancer.+This is a test log! Second message/);
  });
});
