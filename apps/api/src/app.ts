import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.js";

/** Makes the Nest app. Tests and main.ts both use it, so that both get the same settings. */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // The Cloudflare tunnel and Traefik are one proxy hop in front of the API.
  app.set("trust proxy", 1);
  // A list makes cors compare the Origin header. A plain string goes to every caller.
  app.enableCors({ origin: [env.WEB_ORIGIN], credentials: true });
  return app;
}
