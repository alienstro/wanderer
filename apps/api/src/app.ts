import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { CARD_JSON_MAX_BYTES } from "@wanderer/shared";
import cookieParser from "cookie-parser";
import { json } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.js";

/** Makes the Nest app. main.ts uses it. */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  return configureApp(app, env);
}

/** Applies the app settings. createApp and the tests both use it, so that both get the same settings. */
export function configureApp(app: NestExpressApplication, env: Env): NestExpressApplication {
  app.useLogger(app.get(Logger));
  // Traefik is the proxy hop in front of the API. Rate limits use clientIp(), not req.ip.
  app.set("trust proxy", 1);
  // The secret signs the short OAuth cookie. The session cookie is a random token and needs no signature.
  app.use(cookieParser(env.COOKIE_SECRET));
  // A list makes cors compare the Origin header. A plain string goes to every caller.
  app.enableCors({ origin: [env.WEB_ORIGIN], credentials: true });
  // A card JSON can be larger than the 100 KB default. This parser reads it first, so the global parser skips it.
  app.use("/characters/import-json", json({ limit: CARD_JSON_MAX_BYTES }));
  // Nest skips its own JSON parser when it finds one already, so this call adds the global parser again.
  app.useBodyParser("json");
  return app;
}
