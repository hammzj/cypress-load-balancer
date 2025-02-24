import utils from "../../utils";
import mergeLoadBalancingMapFiles from "../../merge";
import fs from "node:fs";
import { globSync } from "glob";

export default {
  command: "merge",
  description: "Merges load balancing map files together back to an original map.",
  //@ts-expect-error Need to fix type
  builder: function(yargs) {
    return yargs
      .option("original", {
        description: "The JSON file path of the original load balancing map into which to merge other files. Defaulted to `main.json`",
        type: "string",
        default: utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH
      })
      .option("filePaths", {
        alias: "F",
        description: "A list of other files to load and merge back",
        type: "array"
      })
      .option("glob", {
        alias: "G",
        description: "A glob pattern to match for load balancing maps to merge",
        type: "string"
      })
      .option("output", {
        alias: "o",
        description: "An output file path to which to save. If not provided, uses the original file path"
      })
      //@ts-expect-error Need to fix type
      .check(function(argv) {
        if (!argv.filePaths && !argv.glob) {
          throw Error("At least one file path or glob pattern must be provided.");
        }
        return true;
      });

  },
  //@ts-expect-error Need to fix type
  handler: function(argv) {
    const orig = JSON.parse(fs.readFileSync(argv.orig).toString());
    const others = [];

    for (const f of argv.filePaths) {
      const data = JSON.parse(fs.readFileSync(f).toString());
      others.push(data);
    }

    if (argv.glob) {
      const matches = globSync(argv.glob);
      for (const f of matches) {
        const data = JSON.parse(fs.readFileSync(f).toString());
        others.push(data);
      }
    }

    const merged = mergeLoadBalancingMapFiles(orig, others);
    utils.saveMapFile(merged, argv.output);
  }
};
