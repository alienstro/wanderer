import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import type { AdminEnergyEntry, AdminUserEnergy, AdminUserEnergyPage } from "@wanderer/shared";
import { AdminGuard } from "../auth/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { UserEnergyAdminService } from "./user-energy-admin.service.js";

/** The admin tab "User energy". */
@Controller("admin/energy/users")
@UseGuards(SessionGuard, AdminGuard)
export class UserEnergyAdminController {
  constructor(private readonly users: UserEnergyAdminService) {}

  @Get()
  list(@Query() query: unknown): Promise<AdminUserEnergyPage> {
    return this.users.list(query);
  }

  @Post(":id/adjust")
  @HttpCode(200)
  adjust(@CurrentUser() admin: User, @Param("id") id: string, @Body() body: unknown): Promise<AdminUserEnergy> {
    return this.users.adjust(admin, id, body);
  }

  @Put(":id/daily")
  setDaily(@CurrentUser() admin: User, @Param("id") id: string, @Body() body: unknown): Promise<AdminUserEnergy> {
    return this.users.setDaily(admin, id, body);
  }

  @Get(":id/history")
  history(@Param("id") id: string): Promise<AdminEnergyEntry[]> {
    return this.users.history(id);
  }
}
