import { Injectable } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";

/** The name of the throttler that counts by user. The IP guard skips it. */
export const USER_THROTTLER = "user";

/** A per-user limit of `limit` calls each minute, for `@Throttle()`. Each route has its own count. */
export function perUserLimit(limit: number) {
  return { [USER_THROTTLER]: { limit, ttl: 60_000 } };
}

/**
 * A ThrottlerGuard that counts the requests of each user, so that users behind one IP do not share a limit.
 * Use it after SessionGuard, because it reads the user of the session.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { id: string } | undefined;
    return `user:${user?.id ?? "none"}`;
  }

  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== USER_THROTTLER) {
      return Promise.resolve(true);
    }
    return super.handleRequest(requestProps);
  }
}
