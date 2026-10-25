import { Module } from "@nestjs/common";
import { FetchOpenRouterPricesClient, OPENROUTER_PRICES_CLIENT } from "../ai/openrouter-prices.js";
import { AuthModule } from "../auth/auth.module.js";
import { CharactersModule } from "../characters/characters.module.js";
import { ProxiesModule } from "../proxies/proxies.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { EnergyAdminController } from "./energy-admin.controller.js";
import { EnergyAdminService } from "./energy-admin.service.js";
import { OverviewController } from "./overview.controller.js";
import { OverviewService } from "./overview.service.js";

@Module({
  imports: [AuthModule, CharactersModule, ProxiesModule],
  controllers: [AdminController, OverviewController, EnergyAdminController],
  providers: [
    AdminService,
    OverviewService,
    EnergyAdminService,
    { provide: OPENROUTER_PRICES_CLIENT, useFactory: () => new FetchOpenRouterPricesClient() },
  ],
})
export class AdminModule {}
