// Makes the files of a new feature in each layer, from scripts/templates/feature. Run: pnpm new:feature <name>
// It writes no file when the name is not kebab-case or when a file of the feature exists already.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const templates = join(root, "scripts/templates/feature");

const name = process.argv[2] ?? "";
if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
  console.error("Usage: pnpm new:feature <name>. The name is kebab-case, for example: saved-scenes");
  process.exit(1);
}

const words = name.split("-");
const pascal = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
const values = {
  __nameCamel__: pascal[0].toLowerCase() + pascal.slice(1),
  __name__: name,
  __Name__: pascal,
  __NAME__: words.join("_").toUpperCase(),
  __label__: words.join(" "),
};
const fill = (text) => Object.entries(values).reduce((out, [token, value]) => out.replaceAll(token, value), text);

function templateFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? templateFiles(path) : [path];
  });
}

const files = templateFiles(templates).map((source) => ({
  source,
  target: join(root, fill(relative(templates, source)).replace(/\.tmpl$/, "")),
}));
const folders = ["packages/shared/src", "apps/api/src", "apps/api/test", "apps/web/src/features"].map((dir) => join(root, dir, name));
const taken = [...folders, ...files.map((file) => file.target)].filter((path) => existsSync(path));
if (taken.length > 0) {
  console.error(`The feature "${name}" exists already:\n${taken.map((path) => `  ${relative(root, path)}`).join("\n")}`);
  process.exit(1);
}

for (const { source, target } of files) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, fill(readFileSync(source, "utf8")));
  console.log(`made     ${relative(root, target)}`);
}

/** Changes one file with a function. It gives false when the function finds no place for the change. */
function change(path, edit) {
  const before = readFileSync(join(root, path), "utf8");
  const after = edit(before);
  if (after === null || after === before) {
    return false;
  }
  writeFileSync(join(root, path), after);
  console.log(`changed  ${path}`);
  return true;
}

const manual = [];

// The shared index exports each feature, in name order.
const sharedIndex = "packages/shared/src/index.ts";
change(sharedIndex, (text) => {
  const lines = text.trim().split("\n");
  lines.push(`export * from "./${name}/index.js";`);
  return `${lines.sort().join("\n")}\n`;
});

// The API module goes into the imports of AppModule.
const appModule = "apps/api/src/app.module.ts";
const registered = change(appModule, (text) => {
  const moduleImports = [...text.matchAll(/^import \{ \w+Module \} from "\.\/[\w-]+\/[\w-]+\.module\.js";$/gm)];
  const lastImport = moduleImports.at(-1);
  const list = /^(\s+)\w+Module,\n(\s+)\],/m.exec(text);
  if (!lastImport || !list) {
    return null;
  }
  const importLine = `import { ${pascal}Module } from "./${name}/${name}.module.js";\n`;
  const withList = text.slice(0, list.index) + list[0].replace(/\n(\s+)\],$/, `\n${list[1]}${pascal}Module,\n$1],`) + text.slice(list.index + list[0].length);
  const at = lastImport.index + lastImport[0].length + 1;
  return withList.slice(0, at) + importLine + withList.slice(at);
});
if (!registered) {
  manual.push(`Add ${pascal}Module to the imports of AppModule in ${appModule}.`);
}

// Both apps read the types of @wanderer/shared from its build.
execFileSync("pnpm", ["--filter", "@wanderer/shared", "build"], { cwd: root, stdio: "inherit" });

console.log(`
The feature "${name}" is ready. Next steps:
${[
  ...manual,
  `Add a route that renders <${pascal}List />, for example apps/web/src/app/(shell)/${name}/page.tsx.`,
  "Add the tables of the feature to schema.prisma, apps/api/table-owners.mjs and docs/architecture.md.",
  `Remove "fixme" in e2e/tests/${name}.spec.ts when the page exists.`,
  "Run pnpm verify and pnpm depcruise.",
]
  .map((step, index) => `  ${index + 1}. ${step}`)
  .join("\n")}`);
