import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { ChatDetail, ChatListResponse, MessageView } from "@wanderer/shared";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { ChatsService } from "./chats.service.js";
import { ReplyService } from "./reply.service.js";

@Controller("chats")
@UseGuards(SessionGuard)
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly replies: ReplyService,
  ) {}

  @Get()
  list(@CurrentUser() user: User, @Query("characterId") characterId?: string): Promise<ChatListResponse> {
    return this.chats.list(user, characterId);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<ChatDetail> {
    return this.chats.create(user, body);
  }

  @Get(":id")
  get(@CurrentUser() user: User, @Param("id") id: string): Promise<ChatDetail> {
    return this.chats.get(user, id);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.chats.remove(user, id);
  }

  /** Saves the user message and streams the AI reply as Server-Sent Events. */
  @Post(":id/messages")
  send(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    return this.replies.stream({ user, chatId: id, res, mode: { kind: "send", body } });
  }
}

/** The edit and the delete of the user's own messages. */
@Controller("messages")
@UseGuards(SessionGuard)
export class MessagesController {
  constructor(private readonly chats: ChatsService) {}

  @Patch(":id")
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<MessageView> {
    return this.chats.updateMessage(user, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.chats.removeMessage(user, id);
  }
}
