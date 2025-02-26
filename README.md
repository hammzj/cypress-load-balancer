TODO

# cypress-load-balancer

Environment Variables:
`CYPRESS_LOAD_BALANCING_MAX_DURATIONS_ALLOWED`: Determines how many durations are saved per file. Deletes oldest
durations once the maximum limit has been reached. **Defaulted to 10**.

## Setup

Install the package to your project:

```shell
npm install --save-dev cypress-load-balancer
```

```shell
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
$: npx cypress-load-balancer

Options:
      --version          Show version number                           [boolean]
  -r, --runners          The count of executable runners to use
                                                             [number] [required]
  -t, --testingType      The testing type to use for load balancing
                               [string] [required] [choices: "e2e", "component"]
  -F, --filePaths        An array of file paths relative to the current working
                         directory to use for load balancing. Overrides finding
                         Cypress specs by configuration file.
                         If left empty, it will utilize a Cypress configuration
                         file to find test files to use for load balancing.
                         The Cypress configuration file is implied to exist at
                         the base of the directory unless set by
                         "process.env.CYPRESS_CONFIG_FILE" [array] [default: []]
      --getSpecsOptions  Options to pass to getSpecs (See "find-cypress-specs"
                         package)                                       [string]
  -s, --specPattern      Converts the output of the load balancer to be as an
                         array of "--spec {file}" formats              [boolean]
  -h, --help             Show help                                     [boolean]

Examples:
  Load balancing for 6 runners against      cypressLoadBalancer -r 6 -t
  "component" testing with implied Cypress  component
  configuration of `./cypress.config.js`
  Load balancing for 3 runners against      cypressLoadBalancer -r 3 -t e2e -F
  "e2e" testing with specified file paths   cypress/e2e/foo.cy.js
                                            cypress/e2e/bar.cy.js
                                            cypress/e2e/wee.cy.js

Missing required arguments: runners, testingType
```

_This probably will not work with `tsx` or `ts-node` -- I need to figure out why._

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
