import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import type { AdminEnergyView, AdminFreeModel, AdminSceneModel, ProxyTestResult } from "@wanderer/shared";
import { AdminGuard } from "../auth/admin.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { EnergyAdminService } from "./energy-admin.service.js";

/** The admin page "Energy and models". */
@Controller("admin/energy")
@UseGuards(SessionGuard, AdminGuard)
export class EnergyAdminController {
  constructor(private readonly energy: EnergyAdminService) {}

  @Get()
  view(): Promise<AdminEnergyView> {
    return this.energy.view();
  }

  @Put("settings")
  updateSettings(@CurrentUser() admin: User, @Body() body: unknown): Promise<AdminEnergyView> {
    return this.energy.updateSettings(admin, body);
  }

  @Post("free-models")
  createFreeModel(@CurrentUser() admin: User, @Body() body: unknown): Promise<AdminFreeModel> {
    return this.energy.createFreeModel(admin, body);
  }

  @Post("free-models/test")
  @HttpCode(200)
  testFreeModel(@Body() body: unknown): Promise<ProxyTestResult> {
    return this.energy.testFreeModel(body);
  }

  @Patch("free-models/:id")
  updateFreeModel(@CurrentUser() admin: User, @Param("id") id: string, @Body() body: unknown): Promise<AdminFreeModel> {
    return this.energy.updateFreeModel(admin, id, body);
  }

  @Delete("free-models/:id")
  @HttpCode(204)
  removeFreeModel(@CurrentUser() admin: User, @Param("id") id: string): Promise<void> {
    return this.energy.removeFreeModel(admin, id);
  }

  @Post("prices/refresh")
  @HttpCode(200)
  refreshPrices(): Promise<AdminEnergyView> {
    return this.energy.refreshPrices();
  }

  @Put("scene-models/:key")
  updateSceneModel(@CurrentUser() admin: User, @Param("key") key: string, @Body() body: unknown): Promise<AdminSceneModel> {
    return this.energy.updateSceneModel(admin, key, body);
  }
}
