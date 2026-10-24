import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { MeResponse, ProxyModelsResult, ProxyTestResult, ProxyView } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { perUserLimit, UserThrottlerGuard } from "../security/user-throttler.guard.js";
import { ProxiesService } from "./proxies.service.js";

/** The proxies of the user. Each query filters by the user ID, so another user gets 404. */
@Controller("proxies")
@UseGuards(SessionGuard)
export class ProxiesController {
  constructor(private readonly proxies: ProxiesService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<ProxyView[]> {
    return this.proxies.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: unknown): Promise<ProxyView> {
    return this.proxies.create(user, body);
  }

  /** POST, so the key is in the body and not in a URL that goes into logs and browser history. */
  @Post("models")
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(10))
  models(@CurrentUser() user: User, @Body() body: unknown): Promise<ProxyModelsResult> {
    return this.proxies.models(user, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: User, @Param("id") id: string, @Body() body: unknown): Promise<ProxyView> {
    return this.proxies.update(user, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param("id") id: string): Promise<void> {
    return this.proxies.remove(user, id);
  }

  @Post(":id/activate")
  activate(@CurrentUser() user: User, @Param("id") id: string): Promise<MeResponse> {
    return this.proxies.activate(user, id);
  }

  @Post(":id/test")
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(10))
  test(@CurrentUser() user: User, @Param("id") id: string): Promise<ProxyTestResult> {
    return this.proxies.test(user, id);
  }
}
