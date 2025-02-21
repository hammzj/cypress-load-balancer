import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import mochaPlugin from "eslint-plugin-mocha";
import cypressPlugin from "eslint-plugin-cypress";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  prettier,
  mochaPlugin.configs.flat.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    ignores: ["dist/"]
  },
  {
    rules: {
      "@typescript-eslint/no-unused-expressions": 1,
      "@typescript-eslint/no-namespace": 0
    }
  },
  {
    files: ["tests/**/*.test.ts"],
    rules: {
      "mocha/no-mocha-arrows": 0,
      "mocha/no-setup-in-describe": 0,
      "mocha/no-exclusive-tests": 2,
      "mocha/consistent-spacing-between-blocks": 0,
      "@typescript-eslint/no-unused-expressions": 0,
      "@typescript-eslint/no-namespace": 0
    }
  },
  { plugins: { cypress: cypressPlugin } }
];
