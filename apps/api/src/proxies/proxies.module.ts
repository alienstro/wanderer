import { Module } from "@nestjs/common";
import { AI_CLIENT_FACTORY, GuardedAiClientFactory } from "../ai/ai-client.js";
import { GuardedModelListClient, MODEL_LIST_CLIENT } from "../ai/model-list.js";
import { AuthModule } from "../auth/auth.module.js";
import { MeModule } from "../me/me.module.js";
import { ENV, type Env } from "../config/env.js";
import { KEY_CIPHER, KeyCipher } from "./key-cipher.js";
import { ProxiesController } from "./proxies.controller.js";
import { ProxiesService } from "./proxies.service.js";

@Module({
  imports: [AuthModule, MeModule],
  controllers: [ProxiesController],
  providers: [
    ProxiesService,
    { provide: KEY_CIPHER, useFactory: (env: Env) => new KeyCipher(env.KEY_ENCRYPTION_KEY), inject: [ENV] },
    { provide: AI_CLIENT_FACTORY, useFactory: () => new GuardedAiClientFactory() },
    { provide: MODEL_LIST_CLIENT, useFactory: () => new GuardedModelListClient() },
  ],
  exports: [ProxiesService, AI_CLIENT_FACTORY],
})
export class ProxiesModule {}
