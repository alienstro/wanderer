// Checks a deployed Wanderer after a deploy. Run: pnpm smoke [--web <url>] [--api <url>]
// It exits with 0 when every URL gives 200, else with 1.
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    web: { type: "string", default: "https://wanderer.alienstro.xyz" },
    api: { type: "string", default: "https://wanderer-api.alienstro.xyz" },
  },
});

const TIMEOUT_MS = 10_000;
const urls = [
  `${values.api}/health`,
  `${values.api}/health/ready`,
  `${values.web}/health`,
  `${values.web}/login`,
  `${values.web}/`,
];

let failed = false;
// One request at a time, so the output order is the order of the list.
for (const url of urls) {
  const start = performance.now();
  let result;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    result = String(res.status);
    failed ||= res.status !== 200;
  } catch (error) {
    result = `ERROR ${error instanceof Error ? error.message : String(error)}`;
    failed = true;
  }
  console.log(`${result.padEnd(5)} ${String(Math.round(performance.now() - start)).padStart(5)} ms  ${url}`);
}
process.exit(failed ? 1 : 0);
