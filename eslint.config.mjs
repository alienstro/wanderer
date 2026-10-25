import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import tseslint from "typescript-eslint";

// The import rules of the web app. docs/architecture.md explains them: app → features → components/ui, lib.
const webBoundaries = {
  files: ["apps/web/src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "boundaries/elements": [
      { type: "app", pattern: "src/app" },
      { type: "feature", pattern: "src/features/*", capture: ["featureName"] },
      { type: "ui", pattern: "src/components/ui" },
      // The flat components folder before the moves of issue #60. Remove it when it is empty.
      { type: "legacy", pattern: "src/components" },
      { type: "lib", pattern: "src/lib" },
    ],
    // ESLint runs in each package folder, so the path to the tsconfig is absolute.
    "import/resolver": { typescript: { project: `${import.meta.dirname}/apps/web/tsconfig.json` } },
  },
  rules: {
    "boundaries/dependencies": [
      "warn",
      {
        default: "disallow",
        message: "{{from.element.types.[0]}} must not import {{to.element.types.[0]}} (docs/architecture.md, import rules)",
        policies: [
          { from: { element: { type: "app" } }, allow: { to: { element: { types: { anyOf: ["app", "ui", "lib", "legacy"] } } } } },
          // A route imports a feature only through its index.ts.
          { from: { element: { type: "app" } }, allow: { to: { element: { type: "feature", fileInternalPath: "index.ts" } } } },
          { from: { element: { type: "feature" } }, allow: { to: { element: { types: { anyOf: ["ui", "lib", "legacy"] } } } } },
          // A feature imports its own files, and only the index.ts of another feature.
          {
            from: { element: { type: "feature" } },
            allow: { to: { element: { type: "feature", captured: { featureName: "{{from.element.captured.featureName}}" } } } },
          },
          { from: { element: { type: "feature" } }, allow: { to: { element: { type: "feature", fileInternalPath: "index.ts" } } } },
          { from: { element: { type: "legacy" } }, allow: { to: { element: { types: { anyOf: ["legacy", "ui", "lib", "feature"] } } } } },
          { from: { element: { type: "ui" } }, allow: { to: { element: { types: { anyOf: ["ui", "lib"] } } } } },
          { from: { element: { type: "lib" } }, allow: { to: { element: { type: "lib" } } } },
        ],
      },
    ],
  },
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/.next-e2e/**", "**/node_modules/**", "**/generated/**", "**/next-env.d.ts", "e2e/.tmp/**", "e2e/test-results/**", "e2e/playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A name that starts with "_" is unused on purpose.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // A long source file does too many jobs. Split it. Test files are exempt.
  {
    files: ["**/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }] },
  },
  webBoundaries,
  // Plain .mjs scripts run in Node.
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  // The .cjs config files (dependency-cruiser) are CommonJS in Node.
  { files: ["**/*.cjs"], languageOptions: { globals: globals.node, sourceType: "commonjs" } },
);
