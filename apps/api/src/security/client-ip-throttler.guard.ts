import { Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";
import type { Request } from "express";
import { clientIp } from "./client-ip.js";
import { USER_THROTTLER } from "./user-throttler.guard.js";

/** A ThrottlerGuard that counts requests for each client IP that Cloudflare gives. */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientIp(req as unknown as Request);
  }

  /** The per-user throttler runs in UserThrottlerGuard, after the session guard. */
  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name === USER_THROTTLER) {
      return Promise.resolve(true);
    }
    return super.handleRequest(requestProps);
  }
}
