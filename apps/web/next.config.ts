import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The Docker image copies the standalone output from the monorepo root.
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
};

export default nextConfig;
