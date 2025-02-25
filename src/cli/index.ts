import yargs from "yargs/yargs";

import balanceCmd from "./commands/balance";
import mergeCmd from "./commands/merge";

const cli = yargs(process.argv.slice(2)).command(balanceCmd).command(mergeCmd).demandCommand();

export default cli;
