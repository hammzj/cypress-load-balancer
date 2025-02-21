# cypress-load-balancer

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
.cypress-load-balancer
```

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
