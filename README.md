# cypress-load-balancer

A simple load balancer for Cypress tests.

Use this for parallelizing jobs across CI/CD solutions or locally in separate processes.

_Note: Requires extra setup on your own CI/CD environment to function correctly!_

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

In your Cypress configuration file, add the plugin separately to your `e2e` configuration and `component`, if declared.
configuration, if you have one. It must come after any other plugins that can mutate the `config.specPattern`. It is
best to register it as the last plugin.

Finally, return the `config` from `setupNodeEvents.

This will register load balancing for separate testing types:

```typescript
import { addCypressLoadBalancerPlugin } from "cypress-load-balancer";

defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      //Any other plugins that mutate the config's specPattern

      //This add this plugin
      addCypressLoadBalancerPlugin(on, config, "e2e");

      //Return the config as well!
      return confg;
    }
  },
  component: {
    setupNodeEvents(on, config) {
      //Any other plugins that mutate the config's specPattern

      //This add this plugin
      addCypressLoadBalancerPlugin(on, config, "component");

      //Return the config as well!
      return confg;
    }
  }
});
```

Now, when you run your suite, it will calculate the average for each file based on previous durations and output it into
`.cypress_load_balancer/spec-map.json`. This is the load balancing map file.

**Currently, this file will place files from ALL configurations in it. I am investigating how to handle separate load
balancing map files for use with multiple configs later on.**

### Installing the plugin

## Usage

This works very similar to other sharding techniques that can be found in WebDriverIO, Playwright, and Vitest.
Runners, like shards, are declared in an `X/Y` pattern, where `X` is the current runner index, and `Y` is the total
count of runners to use.

For example, if you want to use 4 runners, you would execute each of these commands within 4 separate processes:

- Process 1: `cypress run --env runner=1/4`
- Process 2: `cypress run --env runner=2/4`
- Process 3: `cypress run --env runner=3/4`
- Process 4: `cypress run --env runner=4/4`

To enable, you need to declare `runner` in your Cypress environment variables. There are two ways:

1. Cypress CLI `--env runner` option: `cypress run --env runner="1/2"` (the first of two runners)
   Note:
2. Node environment variables in `CYPRESS_runner` format: `CYPRESS_runner=1/2 cypress run`

However, the runners WILL affect the specs displayed in `cypress open`, so do NOT declare `--env runner` for "open"
mode!

### Inputs

| Input                                                     | Type                                | Required | Default            | Description                                                                                                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------- | -------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.env.runner`                                       | string                              | true     |                    | To enable load balancing, you must provide a runner in `"index/total"` format. For an example of two runners in separate processes, you would supply `"1/2" for the first runner and "2/2" for the second runner. |
| `config.env.cypressLoadBalancerAlgorithm`                 | "weighted-largest" \| "round-robin" | false    | "weighted-largest" | Allows selecting a different algorithm for load balancing, if desired.                                                                                                                                            |
| `config.env.cypressLoadBalancerSkipResults`               | boolean                             | false    | false              | Set this if you need to temporarily disable collecting duration statistics from test files.                                                                                                                       |
| `config.env.cypressLoadBalancerDisableWarnings`           | boolean                             | false    | false              | Disables warning logs when produced.                                                                                                                                                                              |
| `process.env.CYPRESS_LOAD_BALANCER_MAX_DURATIONS_ALLOWED` | Number                              | false    | 10                 | This is the maximum number of durations allowed in the map file. **It must be set statically as a Node environment variable in order to work for both the merge process and the Cypress plugin!**                 |
| `process.env.DEBUG`                                       | string                              | false    |                    | Set to `cypress-load-balancer` to enable debug logging.                                                                                                                                                           |

**Note: do NOT declare the runner count within your configuration file as it may permanently filter out your test files!
Only declare it from the command line when you need to use parallel processes.**

### Using a different configuration file

To use a different configuration file, simply add this plugin to all Cypress configurations needed and declare
`--env runner` normally. For example, `cypress run --config-file "my-other-cypress-config.js" --env runner="1/2"`

You can also use a node env variable of
`CYPRESS_CONFIG_FILE=./my-other-cypress-config.js cypress run --env runner="1/2"`

### Overriding the configuration `specPattern`

If you wish to run any files or a different set of files than your configuration's `specPattern`, then simply pass this
to `cypress run`: `--config specPattern="{FILE_PATTERN}"`.

This is the only way to get the load balancer to handle a different pattern than what is specified in your configuration
file. Please note you may need to also declare `--config excludeSpecPattern=""` to override your config file's default
option for that, if one is specified that may exclude your new spec pattern. In most cases, you should not need to do
so.

Examples:

```
# Run a single file (on the first runner; the second runner is empty!_
cypress run --env runner=1/2 --config specPattern="cypress/e2e/**/actions.cy.js"


# Run a set of multiple files (both runners have files!)
cypress run  --env runner=1/2 --config '{"specPattern":["cypress/e2e/**/actions.cy.js","cypress/e2e/**/window.cy.js"]}'
cypress run  --env runner=2/2 --config '{"specPattern":["cypress/e2e/**/actions.cy.js","cypress/e2e/**/window.cy.js"]}'

# These may also work for multiple files
cypress run  --env runner=1/2 --config specPattern='["cypress/e2e/**/actions.cy.js","cypress/e2e/**/window.cy.js"]'
cypress run  --env runner=1/2 --config specPattern=["cypress/e2e/**/actions.cy.js","cypress/e2e/**/window.cy.js"]




```

**Warning: do not use `cypress run --spec "{FILE_PATTERN}` as it may produce Cypress errors with an empty fileset!
Use `--config specPattern` instead.**

### Result collection

Results are only collected in `cypress run` mode. They are not collected when using the interactive testrunner from
`cypress open`.

Each separate runner will create its own load balancing map in the format of `spec-map-{index}-{total}.json`. For
example, `runner=2/4` will create a spec-map of `spec-map-2-4.json`. When tests have finished, they will update that
runner's load balancing map with statistics on the total file run. These statistics are used for the load balancing
algorithms.

However, if you are only using one runner (`runner=1/1`), then the results will be saved back to the main
`spec-map.json` and you
will not need to merge any other files!

### Merging results

When all tests have completed, you will need to use `npx cypress-load-balancer merge` to merge the results. In MOST
cases, you should use this command to correctly get all parallelized maps and then delete them:

```
npx cypress-load-balancer -G "/.cypress_load_balancer/**/spec-map-*.json --rm"
```

### Usage with Cucumber

This can be used with the [Cypress Cucumber preprocessor](https://github.com/badeball/cypress-cucumber-preprocessor/),
though the configuration is a bit different. You can use it just as you would in a regular Cypress project, and it even
works by filtering Cucumber tags!

```
# This example works by filtering ALL features with tags!
cypress run --env tags="@smoke",runner=2/2

# This example works by filtering only specific features with tags!
cypress run --env tags="@smoke",runner=2/2 --config specPattern="my-other-features/**/*.feature"

```

Since **"cypress-load-balancer"** also registers an `after:run` event, it may conflict with the one registered by the
Cucumber preprocessor. We also advise setting `env.filterSpecs=true` to avoid creating bad file stats.

There are two ways to handle this configuration:

<details>
<summary> 1. Use `cypress-on-fix` to handle multiple event handlers</summary>

```typescript
import { defineConfig } from "cypress";
// @ts-expect-error No types
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import { addCypressLoadBalancerPlugin } from "./";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/dist/subpath-entrypoints/esbuild";
import cypressOnFix from "cypress-on-fix";

defineConfig({
  e2e: {
    async setupNodeEvents(originalOn, config) {
      const on = cypressOnFix(originalOn);
      on(
        "file:preprocessor",
        createBundler({
          plugins: [createEsbuildPlugin(config)]
        })
      );
      await addCucumberPreprocessorPlugin(on, config);
      addCypressLoadBalancerPlugin(on, config, "e2e");
      return config;
    }
  },
  env: {
    stepDefinitions: "...",
    filterSpecs: true
  }
});
```

</details>

<details>
<summary>2. Individually override the event handlers from the Cucumber plugin (Not recommended)</summary>

Note: If you have even more plugins with event handlers, you may need to register their methods in each `on` event here
as well!

```typescript
import { defineConfig } from "cypress";
// @ts-expect-error No types
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import { addCypressLoadBalancerPlugin } from "./";
import createEsbuildPlugin from "@badeball/cypress-cucumber-preprocessor/dist/subpath-entrypoints/esbuild";

defineConfig({
  e2e: {
    async setupNodeEvents(on, config) {
      on(
        "file:preprocessor",
        createBundler({
          plugins: [createEsbuildPlugin(config)]
        })
      );

      await cucumberPreprocessor.addCucumberPreprocessorPlugin(on, config, {
        omitBeforeRunHandler: true,
        omitBeforeSpecHandler: true,
        omitAfterSpecHandler: true,
        omitAfterRunHandler: true,
        omitAfterScreenshotHandler: true
      });

      on("before:run", async () => {
        await cucumberPreprocessor.beforeRunHandler(config);
        //Put any additional handlers as needed
      });

      on("before:spec", async (spec) => {
        await cucumberPreprocessor.beforeSpecHandler(config, spec);
        //Put any additional handlers as needed
      });

      on("after:spec", async (spec, results) => {
        /*
        Needed so it does not fail on CI/CD. There's some issues with memory leakages
        and the after:spec handler for the Cucumber reporter will cause errors when the Chromium process crashes
         */
        try {
          await cucumberPreprocessor.afterSpecHandler(config, spec, results);
          //Put any additional handlers as needed
        } catch (e) {
          console.error(`Error in "after:spec" hook`, e);
        }
      });

      on("after:run", async function () {
        //@see https://github.com/badeball/cypress-cucumber-preprocessor/blob/master/docs/event-handlers.md
        try {
          await cucumberPreprocessor.afterRunHandler(config);
          //Put any additional handlers as needed
        } catch (e) {
          console.error(`Error in "after:run" hook`, e);
        }
      });

      on("after:screenshot", async function (details) {
        await cucumberPreprocessor.afterScreenshotHandler(config, details);
        //Put any additional handlers as needed
      });

      addCypressLoadBalancerPlugin(on, config, "e2e");
      return config;
    }
  },
  env: {
    stepDefinitions: "...",
    filterSpecs: true
  }
});
```

</details>

## Command-line interface commands

[//]: <> "ALWAYS UPDATE THIS WHEN THE COMMAND LINE INTERFACE NEEDS UPDATED"

This package also includes a command line interface for some additional helpers.

_Note: The CLI may have issues with `tsx` or `ts-node` as it has not been tested with those tools._

```
cypress-load-balancer <command>

Commands:
  cypress-load-balancer initialize          Initializes the load balancing map
                                            file and directory.
  cypress-load-balancer merge               Merges load balancing map files
                                            together back to an original map.
  cypress-load-balancer generate-runners    Creates an array of runner patterns
  <count>                                   to pass to `--env runners` in a
                                            CI/CD workflow.
```

### `initialize`

```
cypress-load-balancer initialize

Initializes the load balancing map file and directory.

Options:
  --help       Show help                                               [boolean]
  --version    Show version number                                     [boolean]
  --force      Forces re-initialization of file even if existing
                                                      [boolean] [default: false]
  --force-dir  Forces re-initialization of directory even if existing
                                                      [boolean] [default: false]
```

### `merge`

```
cypress-load-balancer merge

Merges load balancing map files together back to an original map.

Options:
      --help                       Show help                           [boolean]
      --version                    Show version number                 [boolean]
      --original, --og             The JSON file path of the original load
                                   balancing map into which to merge other
                                   files.
                                   Defaulted to exist within the current working
                                   directory at
                                   "./cypress_load_balancer/spec-map.json"
  [string] [default: "/Users/hammzj/Documents/GitHub/hammzj/cypress-load-balance
                                        r/.cypress_load_balancer/spec-map.json"]
  -F, --files                      A list of other files to load and merge back
                                   to the original         [array] [default: []]
  -G, --glob                       One or more glob patterns to match for load
                                   balancing maps to merge.Make sure to wrap in
                                   quotes for the glob to work correctly.
                                   NOTE: If merging maps from multiple runners,
                                   use the pattern
                                   ".cypress_load_balancer/**/spec-map-*.json"
                                                           [array] [default: []]
      --handle-empty-files, --hef  What should the script do when it has no
                                   files to merge?
                 [string] [choices: "ignore", "warn", "error"] [default: "warn"]
      --removeExtraMaps, --rm      If true, it will delete all input files while
                                   keeping the original map. This only works if
                                   in the default ".cypress_load_balancer"
                                   directory.         [boolean] [default: false]
  -o, --output                     An output file path to which to save. If not
                                   provided, uses the original file path[string]
```

### `generate-runners`

```
cypress-load-balancer generate-runners <count>

Creates an array of runner patterns to pass to `--env runners` in a CI/CD
workflow.

Positionals:
  count  The count of runners to use                         [number] [required]

Options:
  --help     Show help                                                 [boolean]
  --version  Show version number                                       [boolean]

Examples:
  npx cypress-load-balancer                 Returns [ "1/4", "2/4", "3/4", "4/4"
  generate-runners 4                        ]. For example, in a GitHub Actions
                                            workflow job, this can be passed to
                                            `strategy.matrix.runner` and then to
                                            either ENV.CYPRESS_runner or to
                                            `cypress run --env
                                            runner="${{matrix.runner}}"`
```

## Configuring for CI/CD

### General instructions

For more complete instructions, see [USING_WIH_WORKFLOWS.md](./docs/USING_WITH_WORKFLOWS.md).

This is the basic idea of steps that need to occur in order to use load balancing properly. The load balancing map file
needs to saved and persisted throughout all runs in a stable, base location. After all parallel test runs complete,
their results can be merged back to the main file, which can be consumed on the next test runs, and so on.

1. **Set a number of runners in `X/Y` format.** For example, 2 runners would mean saving `"1/2"`, `"2/2"`, for later.
2. **Restore the load balancer main map file from a persisted location.**
3. **Execute each Cypress `run` process in parallel using the `runner` variables.**
4. **Wait for each Cypress process to fully complete.**
5. **Collect the load balancing maps from each completed runner process.**
6. **Merge the temporary maps back to the original load balancing map.**
7. **Save the updated main load balancing map back to its persisted location.**

#### GitHub Actions

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

## Development

### Debugging

Debug logs can be enabled for the plugin and CLI commands with the Node environment variable of
`DEBUG=cypress-load-balancer`.

You can run Cypress example scripts in mocha with `RUN_CYPRESS_EXAMPLES=true yarn run test:mocha`.

## Publishing

### On GitHub

This should activate a GitHub Actions workflow when publishing a new version on the repository, but if it fails, try
manually.

### Manually

- Increment the version in the `package.json` according to [semantic versions](https://semver.org/).
- Run `yarn run build`
- Run `npm publish`
- Login to NPM with an OTP and it should complete!

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
