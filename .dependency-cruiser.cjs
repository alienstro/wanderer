// The import rules that each package shares. docs/architecture.md explains them. Run: pnpm depcruise
// Each package has its own .dependency-cruiser.cjs that extends this file, because dependency-cruiser
// reads the "paths" of a tsconfig relative to the folder that it runs in. Paths in the rules are relative
// to the package folder.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-import-outside-package",
      comment: "A package uses another package only through its name, such as @wanderer/shared. The API and the web app share no code.",
      severity: "error",
      from: {},
      to: { path: "^\\.\\./", pathNot: "(^|/)node_modules/" },
    },
    {
      name: "no-source-to-test",
      comment: "Source code does not import test code.",
      severity: "error",
      from: { path: "^src/", pathNot: "\\.test\\.tsx?$" },
      to: { path: "(\\.test\\.tsx?$|^test/)" },
    },
    {
      name: "no-circular",
      comment: "A circular import makes the load order fragile.",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "(^|/)node_modules/" },
    exclude: { path: "(^|/)(dist|generated|\\.next|\\.next-e2e)/" },
    tsPreCompilationDeps: true,
    // A workspace package such as @wanderer/shared resolves to its node_modules link, not to its real folder.
    preserveSymlinks: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
