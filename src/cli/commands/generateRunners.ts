export default {
  command: "generate-runners <count>",
  description: "Creates an array of runner patterns to pass to `--env runners` in a CI/CD workflow.",
  //@ts-expect-error Need to fix type
  builder: function (yargs) {
    return (
      yargs
        .positional("count", {
          describe: "The count of runners to use",
          type: "number"
        })
        .example(
          "npx cypress-load-balancer generate-runners 4",
          'Returns [ "1/4", "2/4", "3/4", "4/4" ]. For example, in a GitHub Actions workflow job, this can be passed to \`strategy.matrix.runner\` and then to either ENV.CYPRESS_runner or to \`cypress run --env runner="\${{matrix.runner}}"\`'
        )
        //@ts-expect-error Need to fix type
        .check(function (argv) {
          if (argv.count <= 0) {
            throw Error("The runner count must be greater than 0");
          }
          return true;
        })
    );
  },
  //@ts-expect-error Need to fix type
  handler: function (argv) {
    const runnerValues = Array.from({ length: argv.count }, (_, i) => `${i + 1}/${argv.count}`);
    console.log(runnerValues);
  }
};
