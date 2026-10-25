/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  extends: "../../.dependency-cruiser.cjs",
  forbidden: [
    {
      name: "shared-no-framework",
      comment: "packages/shared holds only schemas, types and error codes. Both apps use it, so it imports no framework.",
      severity: "error",
      from: { path: "^src/" },
      // An import of a package that shared does not install stays unresolved, so match the bare name too.
      to: { path: "(^|/node_modules/)(react|react-dom|next|@nestjs/[^/]+|@prisma/[^/]+)(/|$)" },
    },
    {
      name: "shared-feature-public-only",
      comment: "A shared feature imports another shared feature only through its index.ts.",
      severity: "warn",
      from: { path: "^src/([^/]+)/" },
      to: {
        path: "^src/[^/]+/",
        pathNot: ["^src/$1/", "^src/[^/]+/index\\.ts$"],
      },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
  },
};
