import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { SceneView } from "@wanderer/shared";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { User } from "../generated/prisma/client.js";
import { perUserLimit, UserThrottlerGuard } from "../security/user-throttler.guard.js";
import { ScenesService } from "./scenes.service.js";

/** A short limit stops a burst of clicks. The daily limit of the service stops the cost. */
const SCENES_EACH_MINUTE = 5;

@Controller("chats")
@UseGuards(SessionGuard)
export class ScenesController {
  constructor(private readonly scenes: ScenesService) {}

  /** Makes one image of the current scene and adds it to the chat. Only the "Generate scene" button calls it. */
  @Post(":id/scenes")
  @UseGuards(UserThrottlerGuard)
  @Throttle(perUserLimit(SCENES_EACH_MINUTE))
  generate(@CurrentUser() user: User, @Param("id") id: string): Promise<SceneView> {
    return this.scenes.generate(user, id);
  }
}
