import type { Linter } from "eslint";

import stylistic from "@stylistic/eslint-plugin";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

export const customEslintRules = {
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    parser: typescriptParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  plugins: {
    "@typescript-eslint": typescriptEslint,
  },
  rules: {
    "array-callback-return": ["error", { checkForEach: true }],
    eqeqeq: ["error", "always", { null: "ignore" }],
    curly: "error",
    "import/order": "off",
    "no-console": "warn",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-extraneous-class": "off",
    "@typescript-eslint/no-namespace": "off",
  },
};

export const customIgnores = {
  ignores: [
    "**/node_modules",
    "**/lib",
    "dist/",
    "coverage/",
    "*.js",
    "*.d.ts",
    "bun.lock",
  ],
};

const configUnicornRecommended = eslintPluginUnicorn.configs.recommended;

const customUnicornRules = {
  rules: {
    "unicorn/consistent-function-scoping": "off",
    "unicorn/filename-case": "off",
    "unicorn/prefer-module": "off",
    "unicorn/prevent-abbreviations": "off",
    "unicorn/no-null": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/no-useless-fallbacks": "off",
  },
};

const customStylisticRules = {
  plugins: {
    "@stylistic": stylistic,
  },
  rules: {
    "@stylistic/array-bracket-newline": "off",
    "@stylistic/array-element-newline": "off",
    "@stylistic/function-call-argument-newline": "off",
    "@stylistic/function-call-spacing": ["error", "never"],
    "@stylistic/function-paren-newline": "off",
    "@stylistic/nonblock-statement-body-position": ["error", "below"],
    "@stylistic/object-curly-newline": "off",
    "@stylistic/object-curly-spacing": ["error", "always"],
    "@stylistic/switch-colon-spacing": "error",
    "@stylistic/quotes": ["error", "double"],
  },
};

export default [
  customEslintRules as unknown as Linter.Config,
  customIgnores,
  configUnicornRecommended,
  customUnicornRules as unknown as Linter.Config,
  customStylisticRules as unknown as Linter.Config,
  eslintConfigPrettier,
];
