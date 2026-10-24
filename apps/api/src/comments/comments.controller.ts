import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { CharacterComment, CommentListResponse } from "@wanderer/shared";
import { CurrentUser, OptionalUser } from "../auth/current-user.decorator.js";
import { OptionalSessionGuard, SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { perUserLimit, UserThrottlerGuard } from "../security/user-throttler.guard.js";
import { CommentsService } from "./comments.service.js";

/** A user can post this number of comments each minute. */
export const COMMENTS_EACH_MINUTE = 5;

@Controller("characters/:id/comments")
export class CharacterCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @UseGuards(OptionalSessionGuard)
  list(
    @OptionalUser() viewer: User | null,
    @Param("id") id: string,
    @Query() query: unknown,
  ): Promise<CommentListResponse> {
    return this.comments.list(id, viewer, query);
  }

  @Post()
  @UseGuards(SessionGuard, UserThrottlerGuard)
  @Throttle(perUserLimit(COMMENTS_EACH_MINUTE))
  create(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<CharacterComment> {
    return this.comments.create(id, user, body);
  }
}

@Controller("comments")
@UseGuards(SessionGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.comments.remove(id, user);
  }
}
