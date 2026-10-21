import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsController, MessagesController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ChatsController, MessagesController],
  providers: [ChatsService],
})
export class ChatsModule {}
