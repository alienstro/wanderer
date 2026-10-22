import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The e2e build uses its own folder, so it does not overwrite the .next folder of a dev server.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The Docker image copies the standalone output from the monorepo root.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
};

export default nextConfig;
