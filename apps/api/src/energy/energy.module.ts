import { Global, Module } from "@nestjs/common";
import { AiChargeService } from "./ai-charge.service.js";
import { EnergyService } from "./energy.service.js";

/** Global, because the chats, scenes, free models and admin modules all spend or read energy. */
@Global()
@Module({
  providers: [EnergyService, AiChargeService],
  exports: [EnergyService, AiChargeService],
})
export class EnergyModule {}
