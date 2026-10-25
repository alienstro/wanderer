import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { AppEventType } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The API deletes app events that are older than this number of days. */
export const EVENT_KEEP_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EventFields {
  userId?: string;
  characterId?: string;
  /** A short, safe code, such as an AI error code. Never prompt text, message text, keys or URLs. */
  reason?: string;
}

/** Writes the app events that the admin overview counts, and deletes the old ones each day. */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // A deploy restarts the API, so the first prune runs at the start, not after one day.
    void this.pruneSafely();
    this.timer = setInterval(() => void this.pruneSafely(), DAY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Saves one event. A failed write goes to the log only, so it never stops the request of the user. */
  async record(type: AppEventType, fields: EventFields = {}): Promise<void> {
    try {
      await this.prisma.appEvent.create({ data: { type, ...fields } });
    } catch (error) {
      this.logger.warn({ msg: "App event not saved", type, name: error instanceof Error ? error.name : "unknown" });
    }
  }

  /** Deletes the events older than EVENT_KEEP_DAYS and gives the number of deleted rows. */
  async prune(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - EVENT_KEEP_DAYS * DAY_MS);
    const { count } = await this.prisma.appEvent.deleteMany({ where: { createdAt: { lt: before } } });
    return count;
  }

  private async pruneSafely(): Promise<void> {
    try {
      await this.prune();
    } catch (error) {
      this.logger.warn({ msg: "App event prune failed", name: error instanceof Error ? error.name : "unknown" });
    }
  }
}
