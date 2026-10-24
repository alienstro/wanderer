import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CommentReportsController, ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ReportsController, CommentReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
