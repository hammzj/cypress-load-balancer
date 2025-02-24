#!/usr/bin/env node
import "ts-node/register";
import yargs from "yargs/yargs";
// @ts-expect-error There are no types for this package
import { getSpecs } from "find-cypress-specs";
import performLoadBalancing from "../loadBalancer";
import { Runners } from "../types";

type FormatOutputOption = "spec" | "string" | "newline"

const formatOutput = (output: Runners, type?: FormatOutputOption) => {
  switch (type) {
    case("spec"):
      return output.map(runner => (runner.length > 0 ? `--spec ${runner.join(",")}` : ""));
    case("string"):
      return output.map(runner => runner.join(","));
    case("newline"):
      return output.map(runner => runner.join("\n"));
    default:
      return output;
  }
};

//TODO: add type later
//eslint-disable-next-line @typescript-eslint/no-explicit-any
const argv: any = yargs(process.argv.slice(2))
  .option("runners", {
    alias: "r",
    type: "number",
    demandOption: true,
    describe: "The count of executable runners to use"
  })
  .option("testingType", {
    alias: "t",
    type: "string",
    choices: ["e2e", "component"],
    demandOption: true,
    describe: "The testing type to use for load balancing"
  })
  .option("filePaths", {
    alias: "F",
    type: "array",
    default: [],
    describe:
      "An array of file paths relative to the current working directory to use for load balancing. Overrides finding Cypress specs by configuration file." +
      "\nIf left empty, it will utilize a Cypress configuration file to find test files to use for load balancing." +
      "\nThe Cypress configuration file is implied to exist at the base of the directory unless set by \"process.env.CYPRESS_CONFIG_FILE\""
  })
  .option("getSpecsOptions", {
    type: "string",
    coerce: JSON.parse,
    implies: ["findCypressSpecs"],
    describe: "Options to pass to getSpecs (See \"find-cypress-specs\" package)"
  })
  .option("format", {
    alias: "fm",
    choices: ["spec", "string", "newline"] as FormatOutputOption[],
    describe: `Transforms the output of the runner jobs into various formats.` +
      `\n"--transform spec": Converts the output of the load balancer to be as an array of "--spec {file}" formats` +
      `\n"--transform string": Spec files per runner are joined with a comma; example: "tests/spec.a.ts,tests/spec.b.ts"` +
      `\n"--transform newline": Spec files per runner are joined with a newline; example: \n\t"tests/spec.a.ts\ntests/spec.b.ts"`
  })
  //TODO: allow using other file names. This is useful when multiple cypress configurations exist
  // .option('loadBalancingMapFileName', {
  //     alias: 'M',
  //     type: 'string',
  //     default: process.env.CYPRESS_LOAD_BALANCING_MAP_FILE_NAME,
  //     describe: 'If using a file name for a different load balancing map, add it as the option here',
  //     coerce: opt=> {
  //         process.env.CYPRESS_LOAD_BALANCING_MAP_FILE_NAME = opt
  //     }
  // })
  .middleware((argv) => {
    if (argv.filePaths.length === 0) {
      argv.filePaths = getSpecs(argv.getSpecsOptions, argv.testingType);
    }
  })
  .help()
  .alias("help", "h")
  .example(
    "Load balancing for 6 runners against \"component\" testing with implied Cypress configuration of `./cypress.config.js`",
    "cypressLoadBalancer -r 6 -t component"
  )
  .example(
    "Load balancing for 3 runners against \"e2e\" testing with specified file paths",
    "cypressLoadBalancer -r 3 -t e2e -F cypress/e2e/foo.cy.js cypress/e2e/bar.cy.js cypress/e2e/wee.cy.js"
  )
  .parse();

let output: Runners | string[] = performLoadBalancing(argv.runners, argv.testingType, argv.filePaths);

console.log(JSON.stringify(formatOutput(output, argv.format)));
