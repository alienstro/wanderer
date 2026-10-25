import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { ENV, type Env } from "../config/env.js";
import { FilesModule } from "../files/files.module.js";
import { ProxiesModule } from "../proxies/proxies.module.js";
import { RunPodClient, SCENE_IMAGE_CLIENT } from "./runpod-client.js";
import { ScenesController } from "./scenes.controller.js";
import { ScenesService } from "./scenes.service.js";

@Module({
  imports: [AuthModule, ChatsModule, FilesModule, ProxiesModule],
  controllers: [ScenesController],
  providers: [
    ScenesService,
    { provide: SCENE_IMAGE_CLIENT, useFactory: (env: Env) => new RunPodClient(env.RUNPOD_API_KEY), inject: [ENV] },
  ],
})
export class ScenesModule {}
