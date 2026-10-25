import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MeModule } from "../me/me.module.js";
import { EnergyController, FreeModelsController } from "./free-models.controller.js";
import { FreeModelsService } from "./free-models.service.js";

@Module({
  imports: [AuthModule, MeModule],
  controllers: [FreeModelsController, EnergyController],
  providers: [FreeModelsService],
  exports: [FreeModelsService],
})
export class FreeModelsModule {}
