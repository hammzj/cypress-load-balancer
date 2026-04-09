import { LoadBalancingMap } from "../../load.balancing.map";

export default {
  command: "initialize",
  description: "Initializes the load balancing map file and directory.",
  //@ts-expect-error Need to fix type
  builder: function (yargs) {
    return (
      yargs
        // .option("output", {
        //   alias: "o",
        //   description: "An output file path to which to save. If not provided, uses the original file path",
        //   type: "string",
        //   default: undefined
        // })
        .option("force", {
          description: "Forces re-initialization of file even if existing",
          type: "boolean",
          default: false
        })
        .option("force-dir", {
          description: "Forces re-initialization of directory even if existing",
          type: "boolean",
          default: false
        })
    );
  },
  //@ts-expect-error Need to fix type
  handler: function (argv) {
    const [isDirectoryCreated, isFileCreated] = new LoadBalancingMap().initializeSpecMapFile({
      forceCreateMainDirectory: argv["force-dir"],
      forceCreateFile: argv["force"]
    });
    if (isDirectoryCreated) console.log("cypress-load-balancer", "Created directory");
    if (isFileCreated) console.log("cypress-load-balancer", "Created initial file");
  }
};
