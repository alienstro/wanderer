import { Module } from "@nestjs/common";
import { AI_CLIENT_FACTORY, GuardedAiClientFactory } from "../ai/ai-client.js";
import { AuthModule } from "../auth/auth.module.js";
import { ENV, type Env } from "../config/env.js";
import { KEY_CIPHER, KeyCipher } from "./key-cipher.js";
import { ProxiesController } from "./proxies.controller.js";
import { ProxiesService } from "./proxies.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ProxiesController],
  providers: [
    ProxiesService,
    { provide: KEY_CIPHER, useFactory: (env: Env) => new KeyCipher(env.KEY_ENCRYPTION_KEY), inject: [ENV] },
    { provide: AI_CLIENT_FACTORY, useFactory: () => new GuardedAiClientFactory() },
  ],
  exports: [ProxiesService, AI_CLIENT_FACTORY],
})
export class ProxiesModule {}
