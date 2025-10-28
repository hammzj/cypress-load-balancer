import yargs from "yargs/yargs";

//import balanceCmd from "./commands/balance";
import initializeCmd from "./commands/initialize";
import mergeCmd from "./commands/merge";
import generateRunnersCmd from "./commands/generateRunners";

const argv = yargs(process.argv.slice(2))
  // .command(balanceCmd)
  .command(initializeCmd)
  .command(mergeCmd)
  .command(generateRunnersCmd)
  .demandCommand();

export default argv;
