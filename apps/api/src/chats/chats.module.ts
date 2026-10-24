import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ProxiesModule } from "../proxies/proxies.module.js";
import { ChatLocks } from "./chat-locks.js";
import { ChatsController, MessagesController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";
import { ChoicesService } from "./choices.service.js";
import { MemoryService } from "./memory.service.js";
import { DEFAULT_REPLY_TIMING, REPLY_TIMING, ReplyService } from "./reply.service.js";

@Module({
  imports: [AuthModule, ProxiesModule],
  controllers: [ChatsController, MessagesController],
  providers: [ChatLocks, ChatsService, ReplyService, ChoicesService, MemoryService, { provide: REPLY_TIMING, useValue: DEFAULT_REPLY_TIMING }],
})
export class ChatsModule {}
