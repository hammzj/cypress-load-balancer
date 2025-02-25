import utils from "../../utils";
import mergeLoadBalancingMapFiles from "../../merge";
import fs from "node:fs";
import { globSync } from "glob";

export default {
  command: "merge",
  description: "Merges load balancing map files together back to an original map.",
  //@ts-expect-error Need to fix type
  builder: function (yargs) {
    return (
      yargs
        .option("original", {
          alias: "og",
          description:
            `The JSON file path of the original load balancing map into which to merge other files.\n` +
            `Defaulted to exist within the current working directory at "./cypress_load_balancer/main.json"`,
          type: "string",
          default: utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH
        })
        // .option("json", {
        //   alias: "j",
        //   description: "Provide JSONs as strings to merge. Must match the type for LoadBalancerMap",
        //   type: "array",
        //   default: []
        // })
        .option("files", {
          alias: "F",
          description: "A list of other files to load and merge back to the original",
          type: "array",
          default: []
        })
        .option("glob", {
          alias: "G",
          description:
            "A glob pattern to match for load balancing maps to merge." +
            "Make sure to wrap in quotes for the glob to work correctly",
          type: "string"
        })
        .option("output", {
          alias: "o",
          description: "An output file path to which to save. If not provided, uses the original file path"
        })

        //@ts-expect-error Need to fix type
        .check(function (argv) {
          if (argv.files.length === 0 && !argv.glob) {
            throw Error("At least one file path or glob pattern must be provided.");
          }
          return true;
        })
    );
  },
  //@ts-expect-error Need to fix type
  handler: function (argv) {
    const orig = JSON.parse(fs.readFileSync(argv.original).toString());
    const others = [];

    if (argv.glob) {
      const files = globSync(argv.glob, { dot: true, absolute: true, ignore: argv.original });
      for (const f of files) {
        const data = JSON.parse(fs.readFileSync(f).toString());
        others.push(data);
      }
    }
    for (const f of argv.files) {
      const data = JSON.parse(fs.readFileSync(f).toString());
      others.push(data);
    }
    if (others.length > 0) {
      const merged = mergeLoadBalancingMapFiles(orig, others);
      utils.saveMapFile(merged, argv.output);
    } else {
      console.warn("No input files found, so skipping merging");
    }
  }
};
