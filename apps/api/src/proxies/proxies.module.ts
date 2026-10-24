import { Module } from "@nestjs/common";
import { AI_CLIENT_FACTORY, GuardedAiClientFactory } from "../ai/ai-client.js";
import { ApiKeysModule } from "../api-keys/api-keys.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { MeModule } from "../me/me.module.js";
import { ProxiesController } from "./proxies.controller.js";
import { ProxiesService } from "./proxies.service.js";

@Module({
  imports: [AuthModule, MeModule, ApiKeysModule],
  controllers: [ProxiesController],
  providers: [
    ProxiesService,
    { provide: AI_CLIENT_FACTORY, useFactory: () => new GuardedAiClientFactory() },
  ],
  exports: [ProxiesService, AI_CLIENT_FACTORY],
})
export class ProxiesModule {}
