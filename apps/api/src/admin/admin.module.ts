import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CharactersModule } from "../characters/characters.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { OverviewController } from "./overview.controller.js";
import { OverviewService } from "./overview.service.js";

@Module({
  imports: [AuthModule, CharactersModule],
  controllers: [AdminController, OverviewController],
  providers: [AdminService, OverviewService],
})
export class AdminModule {}
