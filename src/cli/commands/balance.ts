//TODO: add type later
//eslint-disable @typescript-eslint/no-explicit-any

import { setOutput } from "@actions/core";
// @ts-expect-error There are no types for this package
import { getSpecs } from "find-cypress-specs";
import { glob } from "glob";
import performLoadBalancing from "../../loadBalancer";
import { Runners, TestingType } from "../../types";
import utils from "../../utils";
import { GetSpecsError } from "../errors";

type FormatOutputOption = "spec" | "string" | "newline";

const formatOutput = (output: Runners, type?: FormatOutputOption) => {
  switch (type) {
    case "spec":
      return output.map((runner) => (runner.length > 0 ? `--spec ${runner.join(",")}` : ""));
    case "string":
      return output.map((runner) => runner.join(","));
    case "newline":
      return output.map((runner) => runner.join("\n"));
    default:
      return output;
  }
};

export default {
  command: "$0",
  description: "Performs load balancing against a set of runners and Cypress specs",
  //@ts-expect-error Figuring out the type later
  builder: function(yargs) {
    return (
      yargs
        .option("runners", {
          alias: "r",
          type: "number",
          demandOption: true,
          description: "The count of executable runners to use"
        })
        .option("testing-type", {
          alias: "t",
          type: "string",
          choices: ["e2e", "component"],
          demandOption: true,
          description: "The testing type to use for load balancing"
        })
        .option("algorithm", {
          alias: "a",
          type: "string",
          choices: ["weighted-largest", "average-time", "round-robin"],
          default: "weighted-largest",
          description:
          //TODO: more info on the algoritms
            "The algorithm to use for load balancing"
        })
        .option("files", {
          alias: "F",
          type: "array",
          default: [],
          description:
            `An array of file paths relative to the current working directory to use for load balancing. Overrides finding Cypress specs by configuration file.` +
            `\nIf left empty, it will utilize a Cypress configuration file to find test files to use for load balancing.` +
            `\nThe Cypress configuration file is implied to exist at the base of the directory unless set by "process.env.CYPRESS_CONFIG_FILE"`
        })
        .option("glob", {
          alias: "G",
          type: "array",
          default: [],
          description:
            `Specify one or more glob pattern to match test file names.` +
            `\nCan be used with "--files". Overrides finding Cypress specs by configuration file.`
        })
        .option("format", {
          alias: "fm",
          choices: ["spec", "string", "newline"] as FormatOutputOption[],
          description:
            `Transforms the output of the runner jobs into various formats.` +
            `\n"--transform spec": Converts the output of the load balancer to be as an array of "--spec {file}" formats` +
            `\n"--transform string": Spec files per runner are joined with a comma; example: "tests/spec.a.ts,tests/spec.b.ts"` +
            `\n"--transform newline": Spec files per runner are joined with a newline; example: \n\t"tests/spec.a.ts\ntests/spec.b.ts"`
        })
        .option("set-gha-output", {
          alias: "gha",
          type: "boolean",
          description: `Sets the output to the GitHub Actions step output as "cypressLoadBalancerSpecs"`
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
        .help()
        .alias("help", "h")
        .example(
          "Load balancing for 6 runners against \"component\" testing with implied Cypress configuration of `./cypress.config.js`",
          "npx cypressLoadBalancer -r 6 -t component"
        )
        .example(
          "Load balancing for 6 runners against \"component\" testing with an explicit Cypress configuration set by an environment variable",
          "CYPRESS_CONFIG_FILE=./src/tests/cypress.config.js npx cypressLoadBalancer -r 6 -t e2e"
        )
        .example(
          "Load balancing for 3 runners against \"e2e\" testing with specified file paths",
          "npx cypressLoadBalancer -r 3 -t e2e -F cypress/e2e/foo.cy.js cypress/e2e/bar.cy.js cypress/e2e/wee.cy.js"
        )
        .example(
          "Load balancing for 3 runners against \"e2e\" testing with a specified glob pattern and file path",
          "npx cypressLoadBalancer -r 3 -t e2e -F cypress/e2e/foo.cy.js -G cypress/e2e/more_tests/*.cy.js"
        )
    );
  },
  //@ts-expect-error Figuring out the type later
  handler: function(argv) {
    //Assign files array to detect "--files" or files found "--glob" patterns first
    let files: string[] = argv.files;
    files.push(...glob.globSync(argv.glob));

    //If nothing is found from either option, use the base cypress configuration
    try {
      if (files.length === 0) {
        utils.DEBUG("No files provided, so using Cypress configuration");
        files = getSpecs(undefined, argv[`testing-type`]);
      }
    } catch (e) {
      const error = new GetSpecsError(argv["testing-type"], { cause: e });
      console.error(error.name, error.message, `Testing Type: ${error.testingType}`, `Cause:`, e);
      throw error;
    }

    const output: Runners | string[] = performLoadBalancing(
      argv.runners,
      argv["testing-type"] as TestingType,
      [...new Set(files)],
      argv.algorithm
    );

    argv.output = JSON.stringify(formatOutput(output, argv.format));

    if (argv[`set-gha-output`]) {
      setOutput("cypressLoadBalancerSpecs", argv.output);
    }
    if (process.env.CYPRESS_LOAD_BALANCER_DEBUG !== "true") {
      console.clear();
    }
    console.log(argv.output);
  }
};
