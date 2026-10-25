import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PersonasController } from "./personas.controller.js";
import { PersonasService } from "./personas.service.js";

@Module({
  imports: [AuthModule],
  controllers: [PersonasController],
  providers: [PersonasService],
  // Export a provider here only when another module must call this module.
  exports: [],
})
export class PersonasModule {}
