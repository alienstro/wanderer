import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { CharactersService } from "../characters/characters.service.js";
import { loadEnv } from "../config/env.js";

/**
 * The one-time command that deletes the old 18+ characters, with their chats, scene images and avatars.
 * Run it in the API container: `node dist/scripts/delete-adult-characters.js --dry-run`, then without `--dry-run`.
 * Take a database backup first. The delete cannot be undone.
 */
const dryRun = process.argv.includes("--dry-run");
const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadEnv(process.env)), { logger: ["error", "warn"] });
try {
  const counts = await app.get(CharactersService).removeAdultCharacters({ dryRun });
  const verb = dryRun ? "would delete" : "deleted";
  console.log(`The command ${verb} ${counts.characters} characters, ${counts.chats} chats and ${counts.files} files.`);
} finally {
  await app.close();
}
