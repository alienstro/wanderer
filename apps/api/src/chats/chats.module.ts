import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProxiesModule } from "../proxies/proxies.module.js";
import { ChatsController, MessagesController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";
import { DEFAULT_REPLY_TIMING, REPLY_TIMING, ReplyService } from "./reply.service.js";

@Module({
  imports: [AuthModule, ProxiesModule],
  controllers: [ChatsController, MessagesController],
  providers: [ChatsService, ReplyService, { provide: REPLY_TIMING, useValue: DEFAULT_REPLY_TIMING }],
})
export class ChatsModule {}
