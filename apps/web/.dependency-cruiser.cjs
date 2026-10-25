/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: "../../.dependency-cruiser.cjs",
  forbidden: [
    {
      name: "web-feature-public-only",
      comment: "A web feature imports another web feature only through its index.ts.",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: {
        path: "^src/features/[^/]+/",
        pathNot: ["^src/features/$1/", "^src/features/[^/]+/index\\.ts$"],
      },
    },
  ],
  options: {
    // The "@/" alias comes from this tsconfig.
    tsConfig: { fileName: "tsconfig.json" },
  },
};
