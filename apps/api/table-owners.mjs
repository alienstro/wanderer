// The owner modules of each table: only these modules write to the table. docs/architecture.md explains the rule.
// The keys are the Prisma model names. Keep this map and the table owners in docs/architecture.md the same.
export const TABLE_OWNERS = {
  // users: auth owns the sign-in columns, me the profile columns, energy the energy columns.
  user: ["auth", "me", "energy"],
  session: ["auth"],
  termsAcceptance: ["auth"],
  // characters: chats owns chat_count, and comments owns comment_count, because they count their own rows.
  character: ["characters", "chats", "comments"],
  characterOpening: ["characters"],
  characterTag: ["characters"],
  characterLike: ["characters"],
  tag: ["characters"],
  characterComment: ["comments"],
  chat: ["chats"],
  message: ["chats"],
  file: ["files"],
  proxy: ["proxies"],
  apiKey: ["api-keys"],
  report: ["reports"],
  sceneImage: ["scenes"],
  energyEntry: ["energy"],
  energySettings: ["admin"],
  freeModel: ["admin"],
  sceneModel: ["admin"],
  appEvent: ["events"],
};

const WRITES = "create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany";

/** The ESLint rule that stops a Prisma write, such as `tx.user.update()`, to a table that the module does not own. */
function restrictWrites(tables) {
  if (tables.length === 0) {
    return "off";
  }
  return [
    "error",
    {
      selector: `CallExpression[callee.property.name=/^(${WRITES})$/][callee.object.property.name=/^(${tables.join("|")})$/]`,
      message: "This module does not own this table. Call a method of the owner module (docs/architecture.md, table owners).",
    },
  ];
}

/** One ESLint config for each API module folder, plus a default for a new folder that owns no table. */
export function tableOwnerConfigs(apiSrc) {
  const tables = Object.keys(TABLE_OWNERS);
  const modules = [...new Set(Object.values(TABLE_OWNERS).flat())];
  return [
    { files: [`${apiSrc}/**/*.ts`], ignores: ["**/*.test.ts"], rules: { "no-restricted-syntax": restrictWrites(tables) } },
    ...modules.map((module) => ({
      files: [`${apiSrc}/${module}/**/*.ts`],
      ignores: ["**/*.test.ts"],
      rules: { "no-restricted-syntax": restrictWrites(tables.filter((table) => !TABLE_OWNERS[table].includes(module))) },
    })),
  ];
}
