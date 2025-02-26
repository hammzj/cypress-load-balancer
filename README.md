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
`.cypress_load_balancer/main.json`. This is the load balancing map file.

TODO

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
  Load balancing for 6 runners against      cypressLoadBalancer -r 6 -t
  "component" testing with implied Cypress  component
  configuration of `./cypress.config.js`
  Load balancing for 3 runners against      cypressLoadBalancer -r 3 -t e2e -F
  "e2e" testing with specified file paths   cypress/e2e/foo.cy.js
                                            cypress/e2e/bar.cy.js
                                            cypress/e2e/wee.cy.js
```

_This probably will not work with `tsx` or `ts-node` -- I need to figure out why._

## Configuring for CI/CD

### General instructions

This is the basic idea of steps that need to occur in order to use load balancing properly. The load balancing map file
needs to saved and persisted throughout all runs in a stable, base location. After all parallel test runs complete,
their results can be merged back to the main file, which can be consumed on the next test runs, and so on.

1. **Install and configure the plugin.** When Cypress runs, it will be able to locally save the results of the spec
   executions per each runner.
2. **Execute the load balancer against a number of runners.** The output is able to be used for all parallelized jobs to
   instruct them which specs to execute.
3. **Run each parallelized job that will execute the Cypress testrunner with the spec output per each runner.**
4. **Collect and save the output of the load balancing files from each job in a temporary location.**
5. **After all parallelized test jobs complete, merge their load balancing map results back to the persisted map file**.

### GitHub Actions

There is an example workflow in `.github/workflows/cypress-parallel.yml`. It demonstrates (with some extra steps) how to
perform load balancing.

When pull requests are merged, the latest load balancing map file is saved to the base branch so it can be used again.
This allows the map to be saved on a trunk branch, so workflows can reuse and overwrite it when there are new pull
requests with updated test results.

I'd love to add actual GitHub Actions for this project.

### Docker and Docker Compose

Someone please help me here :simple_smile:

## Development

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
