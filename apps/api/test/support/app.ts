import type { Provider, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { configureApp } from "../../src/app.js";
import { AppModule } from "../../src/app.module.js";
import type { Env } from "../../src/config/env.js";
import { testEnv } from "./env.js";

interface TestAppOptions {
  env?: Env;
  /** Controllers that exist only in tests. */
  controllers?: Type[];
  /** Providers that replace the real ones, such as a fake Google client. */
  overrides?: Array<{ token: unknown; useValue: unknown }>;
  providers?: Provider[];
}

/** Makes the real app with the real settings, plus test controllers and fakes. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const env = options.env ?? testEnv();
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(env)],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  });
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, env);
  await app.init();
  return app;
}
