// Starts the Next.js standalone server, as the web Docker image does. The standalone folder does
// not have the static files and the public folder, so this script copies them first.
import { cpSync } from "node:fs";

const web = new URL("../../apps/web/", import.meta.url);
const standalone = new URL(".next/standalone/apps/web/", web);
cpSync(new URL(".next/static/", web), new URL(".next/static/", standalone), { recursive: true });
cpSync(new URL("public/", web), new URL("public/", standalone), { recursive: true });
await import(new URL("server.js", standalone).href);
