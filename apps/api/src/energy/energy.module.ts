import { Global, Module } from "@nestjs/common";
import { EnergyService } from "./energy.service.js";

/** Global, because the chats, scenes, free models and admin modules all spend or read energy. */
@Global()
@Module({
  providers: [EnergyService],
  exports: [EnergyService],
})
export class EnergyModule {}
