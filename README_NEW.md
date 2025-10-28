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

```js
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

**Warning: do not use `cypress run --spec "{FILE_PATTERN}` as it may produce Cypress errors with an empty fileset!
Use `--config specPattern` instead.**

### Result collection

Results are only collected in `cypress run` mode. They are not collected when using the interactive testrunner from
`cypress open`.

Each separate runner will create its own load balancing map in the format of `spec-map-{index}-{total}.json`. For
example, `runner=2/4` will create a spec-map of `spec-map-2-4.json`. When tests have finished, they will update that
runner's load balancing map with statistics on the total file run. These statistics are used for the load balancing
algorithms.

### Merging results

When all tests have completed, you will need to use `npx cypress-load-balancer merge` to merge the results. In MOST cases, you should use this command to correctly get all parallelized maps and then delete them:

```
npx cypress-load-balancer -G "/.cypress_load_balancer/spec-map-*-*.json --rm"
```

## Command-line interface commands

[//]: # "ALWAYS UPDATE THIS WHEN THE COMMAND LINE INTERFACE NEEDS UPDATED "

This package also includes a command line interface for some additional helpers.

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
      --help                   Show help                               [boolean]
      --version                Show version number                     [boolean]
      --original, --og         The JSON file path of the original load balancing
                               map into which to merge other files.
                               Defaulted to exist within the current working
                               directory at
                               "./cypress_load_balancer/spec-map.json"
  [string] [default: "/Users/hammzj/Documents/GitHub/hammzj/cypress-load-balance
                                        r/.cypress_load_balancer/spec-map.json"]
  -F, --files                  A list of other files to load and merge back to
                               the original                [array] [default: []]
  -G, --glob                   One or more glob patterns to match for load
                               balancing maps to merge.Make sure to wrap in
                               quotes for the glob to work correctly.
                               NOTE: If merging maps from multiple runners, use
                               the pattern
                               ".cypress_load_balancer/spec-map-*-*.json"
                                                           [array] [default: []]
      --removeExtraMaps, --rm  If true, it will delete all input files while
                               keeping the original map. This only works if in
                               the default ".cypress_load_balancer" directory.
                                                      [boolean] [default: false]
  -o, --output                 An output file path to which to save. If not
                               provided, uses the original file path    [string]
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

### Debugging

Debug logs can be enabled for the plugin and CLI commands with the Node environment variable of
`DEBUG=cypress-load-balancer`.
