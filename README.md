# cypress-load-balancer

A simple load balancer for Cypress tests.

Use this for parallelizing jobs across CI/CD solutions, or locally if set up.

_Note: Requires extra setup on your own CI/CD environment to function correctly!_

## Environment Variables:

- `CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED`: Determines how many durations are saved per file. Deletes oldest
  durations once the maximum limit has been reached. **Defaulted to 10**.
- `CYPRESS_LOAD_BALANCER_DEBUG`: Enables debugging output. Does not clear the console, so the output may be unusable.

## Setup

Install the package to your project:

```shell
npm install --save-dev cypress-load-balancer
yarn add -D cypress-load-balancer
```

Add the following to your `.gitignore` and other ignore files:

```
.cypress_load_balancer
```

In your Cypress configuration file, add the plugin separately to your `e2e` configuration and also `component`
configuration, if you have one.
This will register load balancing for separate testing types

```js
import { addCypressLoadBalancerPlugin } from "cypress-load-balancer";

defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      addCypressLoadBalancerPlugin(on);
    }
  },
  component: {
    setupNodeEvents(on, config) {
      addCypressLoadBalancerPlugin(on);
    }
  }
});
```

**Currently, this only supports one configuration. I am considering how to handle multiple configs later on.**

Now, when you run your suite, it will calculate the average for each file based on previous durations and output it into
`.cypress_load_balancer/spec-map.json`. This is the load balancing map file.

## Executables

### `cypress-load-balancer`

This can be executed with `npx cypress-load-balancer`:

```
$: npx cypress-load-balancer --help
cypress-load-balancer

Performs load balancing against a set of runners and Cypress specs

Commands:
  cypress-load-balancer             Performs load balancing against a set of
                                    runners and Cypress specs          [default]
  cypress-load-balancer initialize  Initializes the load balancing map file and
                                    directory.
  cypress-load-balancer merge       Merges load balancing map files together
                                    back to an original map.

Options:
      --version                Show version number                     [boolean]
  -r, --runners                The count of executable runners to use
                                                             [number] [required]
  -t, --testing-type           The testing type to use for load balancing
                               [string] [required] [choices: "e2e", "component"]
  -a, --algorithm              The algorithm to use for load balancing
                               weighted-largest:  Attempts to get a uniform
                               total run time between all runners by separating
                               the longest-running tests into their own runners
                               first, and attempting to keep all other runners
                               equal to or lower than its time. If there are
                               more tests than runners, it will repeat based
                               against the newest highest run time from the
                               runners.
                               round-robin: Balances the runners based on a
                               modulo-index approach, where the X-indexed runner
                               will get the X-indexed test file after performing
                               a modulo operation on the index against the total
                               runner count.
                 [string] [choices: "weighted-largest", "round-robin"] [default:
                                                             "weighted-largest"]
  -F, --files                  An array of file paths relative to the current
                               working directory to use for load balancing.
                               Overrides finding Cypress specs by configuration
                               file.
                               If left empty, it will utilize a Cypress
                               configuration file to find test files to use for
                               load balancing.
                               The Cypress configuration file is implied to
                               exist at the base of the directory unless set by
                               "process.env.CYPRESS_CONFIG_FILE"
                                                           [array] [default: []]
  -G, --glob                   Specify one or more glob pattern to match test
                               file names.
                               Can be used with "--files". Overrides finding
                               Cypress specs by configuration file.
                                                           [array] [default: []]
      --removeEmptyRunners     If true, will remove empty runners and only
                               return the number of runners that have files. If
                               false, retains any empty runner arrays. In most
                               cases, this should remain as true as providing
                               any empty buckets to "--spec" may inadvertently
                               result in Cypress failures.
                                                       [boolean] [default: true]
      --format, --fm           Transforms the output of the runner jobs into
                               various formats.
                               "--transform spec": Converts the output of the
                               load balancer to be as an array of "--spec
                               {file}" formats
                               "--transform string": Spec files per runner are
                               joined with a comma; example:
                               "tests/spec.a.ts,tests/spec.b.ts"
                               "--transform newline": Spec files per runner are
                               joined with a newline; example:
                                "tests/spec.a.ts
                               tests/spec.b.ts"
                                          [choices: "spec", "string", "newline"]
      --set-gha-output, --gha  Sets the output to the GitHub Actions step output
                               as "cypressLoadBalancerSpecs"           [boolean]
  -h, --help                   Show help                               [boolean]

Examples:
  Load balancing for 6 runners against      npx cypressLoadBalancer -r 6 -t
  "component" testing with implied Cypress  component
  configuration of `./cypress.config.js`
  Load balancing for 6 runners against      CYPRESS_CONFIG_FILE=./src/tests/cypr
  "component" testing with an explicit      ess.config.js npx
  Cypress configuration set by an           cypressLoadBalancer -r 6 -t e2e
  environment variable
  Load balancing for 3 runners against      npx cypressLoadBalancer -r 3 -t e2e
  "e2e" testing with specified file paths   -F cypress/e2e/foo.cy.js
                                            cypress/e2e/bar.cy.js
                                            cypress/e2e/wee.cy.js
  Load balancing for 3 runners against      npx cypressLoadBalancer -r 3 -t e2e
  "e2e" testing with a specified glob       -F cypress/e2e/foo.cy.js -G
  pattern and file path                     cypress/e2e/more_tests/*.cy.js
```

Example of load balancing on shell:

```
#If running with DEBUG mode on, make sure to use `tail -1` to get the output correctly
specs=$(echo npx cypress-load-balancer -r 3 -t e2e | tail -1)
```

_This probably will not work with `tsx` or `ts-node` -- I need to figure out why._

## Configuring for CI/CD

### General instructions

For more complete instructions, see [USING_WIH_WORKFLOWS.md](./docs/USING_WITH_WORKFLOWS.md).

This is the basic idea of steps that need to occur in order to use load balancing properly. The load balancing map file
needs to saved and persisted throughout all runs in a stable, base location. After all parallel test runs complete,
their results can be merged back to the main file, which can be consumed on the next test runs, and so on.

1. **Install and configure the plugin.** When Cypress runs, it will be able to locally save the results of the spec
   executions per each runner.
2. **Initialize the load balancer main map file in a persisted location that can be easily restored from cache.** This
   means the main file needs to be in a place outside of the parallelized jobs to can be referenced _by_ the
   parallelized jobs in order to save new results.
3. **Execute the load balancer against a number of runners.** The output is able to be used for all parallelized jobs to
   instruct them which specs to execute.
4. **Run each parallelized job that will execute the Cypress testrunner with the spec output per each runner.**
5. **Collect and save the output of the load balancing files from each job in a temporary location.**
6. **After all parallelized test jobs complete, merge their load balancing map results back to the persisted map file
   and cached for later usage.**
   In a GitHub Actions run, this means on pull request merge, the load balancing files from the base branch and the head
   branch need to be merged, then cached down to the base branch.

### GitHub Actions

There are example workflows here:

- `.github/workflows/cypress-parallel.yml`: demonstrates (with some extra steps) how to
  perform load balancing and cache the files on runs. For pull requests, it will prepare the file to be saved when
  merging down to the base branch.
- `.github/workflows/save-map-to-base-branch-on-pr-merge.yml`: when the pull request is merged, the load balancing file
  from the test
  runs on the PR will be saved to the base branch.

When pull requests are merged, the latest load balancing map file is saved to the base branch so it can be used again.
This allows the map to be saved on a trunk branch, so workflows can reuse and overwrite it when there are new pull
requests with updated test results.

I'd love to add actual GitHub Actions for this project.

### Docker and Docker Compose

Someone please help me here :simple_smile:

## Development

## Publishing

_THIS WILL BECOME A WORKFLOW AT SOME POINT._

- Increment the version in the `package.json` Prefer a minor version in most cases (`0.X.0`).
- Run `yarn run build`. THIS NEEDS TO HAPPEN EACH TIME.
- Run `npm publish`.

### Creating a hybrid package for ESM and CommonJS

See https://www.embedthis.com/blog/sensedeep/how-to-create-single-source-npm-module.html.

_To be incredibly honest, I would not have been able to do this myself without the help from above. Huge thanks to the
authors._

Because JavaScript is an unnecessarily difficult language to compile, this package does its best to handle both ESM and
CommonJS suites. Basically, it outputs ESM and CommonJS modules to `/dist` as `/dist/mjs` and `/dist/cjs`, respectively.
The `package.json` describes the exports as well. Finally, each output gets its own `package.json` that describes the
type of module; these files are created with `scrips/fixup`.

The TS Config files used are:

- `tsconfig.json`: The base file from which others are derived. Used for type checking but does not output
- `tsconfig.test.json`: Used for type checking test files
- `tsconfig.commonjs.json`: Outputs CommonJS modules to `/dist/cjs`
- `tsconfig.esm.json`: Outputs ESM modules to `/dist/mjs`

To output distributed files, run `yarn build`.
