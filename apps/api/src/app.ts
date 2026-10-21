import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
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
  return app;
}
