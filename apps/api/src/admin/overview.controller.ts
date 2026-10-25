import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { OverviewHealth, OverviewProblemList, OverviewStats, TopCharacterPage } from "@wanderer/shared";
import { AdminGuard } from "../auth/admin.guard.js";
import { SessionGuard } from "../auth/session.guard.js";
import { OverviewService, parseOverviewPageQuery, parseOverviewQuery, parseTopCharactersQuery } from "./overview.service.js";

/** The numbers of the admin overview page. Each panel has its own endpoint. */
@Controller("admin/overview")
@UseGuards(SessionGuard, AdminGuard)
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get("stats")
  stats(@Query() query: unknown): Promise<OverviewStats> {
    return this.overview.stats(parseOverviewQuery(query));
  }

  @Get("problems")
  problems(@Query() query: unknown): Promise<OverviewProblemList> {
    return this.overview.problems(parseOverviewPageQuery(query));
  }

  @Get("top-characters")
  topCharacters(@Query() query: unknown): Promise<TopCharacterPage> {
    return this.overview.topCharacters(parseTopCharactersQuery(query));
  }

  @Get("health")
  health(): Promise<OverviewHealth> {
    return this.overview.health();
  }
}
