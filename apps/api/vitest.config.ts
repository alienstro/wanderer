import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Vitest uses SWC, because esbuild does not emit the decorator metadata that NestJS needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["reflect-metadata"],
  },
});
