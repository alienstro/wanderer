import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type {
  ChatDetail,
  ChatListResponse,
  ChatMemory,
  ChoicesResponse,
  MemoryDraftResponse,
  MessageView,
} from "@wanderer/shared";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { perUserLimit, UserThrottlerGuard } from "../security/user-throttler.guard.js";
import { ChatsService } from "./chats.service.js";
import { ChoicesService } from "./choices.service.js";
import { MemoryService } from "./memory.service.js";
import { ReplyService } from "./reply.service.js";

/** The limit of proxy calls for each user and route. */
const CALLS_EACH_MINUTE = 30;

@Controller("chats")
@UseGuards(SessionGuard)
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly replies: ReplyService,
    private readonly choices: ChoicesService,
    private readonly memory: MemoryService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query("characterId") characterId?: string,
    @Query("latestPerCharacter") latestPerCharacter?: string,
  ): Promise<ChatListResponse> {
    return this.chats.list(user, characterId, latestPerCharacter);
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

  @Patch(":id/opening")
  setOpening(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<ChatDetail> {
    return this.chats.setOpening(user, id, body);
  }

  @Patch(":id/memory")
  updateMemory(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<ChatMemory> {
    return this.chats.updateMemory(user, id, body);
  }

  /** A memory draft from the old messages that left the history window. It saves nothing. */
  @Post(":id/memory/summarize")
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(CALLS_EACH_MINUTE))
  @HttpCode(200)
  summarizeMemory(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<MemoryDraftResponse> {
    return this.memory.draft(user, id, body);
  }

  /** Saves the user message and streams the AI reply as Server-Sent Events. */
  @Post(":id/messages")
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(CALLS_EACH_MINUTE))
  send(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    return this.replies.stream({ user, chatId: id, res, mode: { kind: "send", body } });
  }

  /** Streams a new AI reply in place of the last reply, or a reply after a user message with no reply. */
  @Post(":id/regenerate")
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(CALLS_EACH_MINUTE))
  regenerate(@CurrentUser() user: User, @Param("id") id: string, @Res() res: Response): Promise<void> {
    return this.replies.stream({ user, chatId: id, res, mode: { kind: "regenerate" } });
  }

  /** Four short replies that the user can send. The web asks only when the "Reply choices" switch is on. */
  @Post(":id/choices")
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(CALLS_EACH_MINUTE))
  @HttpCode(200)
  makeChoices(@CurrentUser() user: User, @Param("id") id: string): Promise<ChoicesResponse> {
    return this.choices.make(user, id);
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
