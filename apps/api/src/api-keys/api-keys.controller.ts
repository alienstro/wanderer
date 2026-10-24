import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { ApiKeyView } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { ApiKeysService } from "./api-keys.service.js";

/** The saved API keys of the user. Each query filters by the user ID, so another user gets 404. */
@Controller("api-keys")
@UseGuards(SessionGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<ApiKeyView[]> {
    return this.apiKeys.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<ApiKeyView> {
    return this.apiKeys.create(user, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<ApiKeyView> {
    return this.apiKeys.update(user, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.apiKeys.remove(user, id);
  }
}
