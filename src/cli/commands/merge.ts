import fs from "node:fs";
import { globSync } from "glob";
import utils from "../../utils";
import { debug } from "../../helpers";
import mergeLoadBalancingMapFiles from "../../merge";
import { LoadBalancingMap } from "../../types";

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
            `Defaulted to exist within the current working directory at "./cypress_load_balancer/spec-map.json"`,
          type: "string",
          default: utils.MAIN_LOAD_BALANCING_MAP_FILE_PATH
        })
        .option("files", {
          alias: "F",
          description: "A list of other files to load and merge back to the original",
          type: "array",
          default: []
        })
        .option("glob", {
          alias: "G",
          description:
            "One or more glob patterns to match for load balancing maps to merge." +
            "Make sure to wrap in quotes for the glob to work correctly." +
            '\nNOTE: If merging maps from multiple runners, use the pattern ".cypress_load_balancer/spec-map-*-*.json"',
          type: "array",
          default: []
        })
        .option("handle-empty-files", {
          alias: "HE",
          type: "string",
          choices: ["ignore", "warn", "error"],
          default: "warn",
          description: "What should the script do when it has no files to merge?"
        })
        .option("removeExtraMaps", {
          alias: "rm",
          type: "boolean",
          default: false,
          description:
            'If true, it will delete all input files while keeping the original map. This only works if in the default ".cypress_load_balancer" directory.'
        })
        .option("output", {
          alias: "o",
          description: "An output file path to which to save. If not provided, uses the original file path",
          type: "string"
        })

        //@ts-expect-error Need to fix type
        .check(function (argv) {
          if ([argv.files.length, argv.glob.length].every((length) => length === 0)) {
            throw Error("At least one file path or a glob pattern must be provided.");
          }
          return true;
        })
    );
  },
  //@ts-expect-error Need to fix type
  handler: function (argv) {
    const loadFile = (fileName: string) => {
      const data = JSON.parse(fs.readFileSync(fileName).toString());
      others.push(data);
    };
    const orig = JSON.parse(fs.readFileSync(argv.original).toString());
    const others: LoadBalancingMap[] = [];

    const fileNames = [
      //Collect data from files found by glob
      globSync(argv.glob, { dot: true, absolute: true, ignore: argv.original }),
      //Collect data from explicit file names
      argv.files
    ].flat();

    fileNames.map(loadFile);

    debug("spec-maps to merge to original: %o", others);
    if (others.length > 0) {
      const merged = mergeLoadBalancingMapFiles(orig, others);
      utils.saveMapFile(merged, argv.output);
      console.log("cypress-load-balancer", "map merge complete");

      if (argv.removeExtraMaps) {
        fileNames.map((f) => {
          fs.unlinkSync(f);
          debug("Removed temp map file: %s", f);
        });
        console.log("Removed temporary files", fileNames);
      }
    } else {
      switch (argv["handle-empty-files"]) {
        case "warn":
          console.warn("cypress-load-balancer", "No input files found, so skipping merging of maps");
          break;
        case "error":
          throw Error("No input files provided or found for the merge command to use!");
        default:
          break;
      }
    }
  }
};
