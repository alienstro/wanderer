import { Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import type { EnergyView, FreeModelView } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { FreeModelsService } from "./free-models.service.js";

@Controller("free-models")
@UseGuards(SessionGuard)
export class FreeModelsController {
  constructor(private readonly freeModels: FreeModelsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<FreeModelView[]> {
    return this.freeModels.list(user);
  }

  @Post(":id/activate")
  @HttpCode(200)
  activate(@CurrentUser() user: User, @Param("id") id: string): Promise<FreeModelView[]> {
    return this.freeModels.activate(user, id);
  }
}

/** The energy balance of the user, for the model card and the "Generate scene" button. */
@Controller("energy")
@UseGuards(SessionGuard)
export class EnergyController {
  constructor(private readonly freeModels: FreeModelsService) {}

  @Get()
  view(@CurrentUser() user: User): Promise<EnergyView> {
    return this.freeModels.energyView(user);
  }
}
