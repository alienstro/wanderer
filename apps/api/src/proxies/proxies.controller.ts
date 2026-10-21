import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { MeResponse, ProxyTestResult, ProxyView } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
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
  test(@CurrentUser() user: User, @Param("id") id: string): Promise<ProxyTestResult> {
    return this.proxies.test(user, id);
  }
}
