import { BadRequestException, HttpException, Injectable } from "@nestjs/common";
import { toEnergy } from "@wanderer/shared";
import { EventsService } from "../events/events.service.js";
import type { EnergyReason, EnergySettings, Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The reasons of a spend. A refund and a refill add energy. */
export type SpendReason = Extract<EnergyReason, "reply" | "choices" | "memory" | "scene">;

const SPEND_REASONS: SpendReason[] = ["reply", "choices", "memory", "scene"];

/** One spend that a failed call can give back. `amount` is the price in hundredths. */
export interface EnergySpend {
  id: string;
  userId: string;
  amount: number;
  chatId: string | null;
  freeModelId: string | null;
  createdAt: Date;
}

export interface EnergyBalance {
  /** In hundredths. */
  balance: number;
  /** The daily amount of this user: an own daily amount, or the daily energy of the settings. */
  dailyEnergy: number;
  nextRefillAt: Date;
}

/** An admin change of a balance in hundredths: add an amount (below 0 takes energy away), or set an exact balance. */
export type EnergyAdjustment = { mode: "add" | "set"; amount: number };

/** 00:00 UTC of the day of `now`. The balance refills at this time each day. */
export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextRefill(now: Date): Date {
  return new Date(dayStart(now).getTime() + DAY_MS);
}

/**
 * Keeps the energy balance of each user and its ledger. Each change of `users.energy` and its `energy_entries` row
 * go in one transaction. The transaction locks the user row first, so two actions at the same time cannot both
 * spend the last energy.
 */
@Injectable()
export class EnergyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  /** The admin values. The API reads the row at each action, so a change needs no restart. */
  settings(): Promise<EnergySettings> {
    return this.prisma.energySettings.findUniqueOrThrow({ where: { id: 1 } });
  }

  /** The balance after a refill that is due. */
  async balance(userId: string): Promise<EnergyBalance> {
    const now = new Date();
    const { dailyEnergy } = await this.settings();
    const result = await this.prisma.$transaction((tx) => this.lockAndRefill(tx, userId, dailyEnergy, now));
    return { ...result, nextRefillAt: nextRefill(now) };
  }

  /**
   * An admin change of the balance of a user. A due refill comes first, so the next action of the user does not
   * replace the change. The change lasts until the next refill. A result below 0 gives 400 energy_below_zero.
   */
  async adjust(userId: string, change: EnergyAdjustment): Promise<{ before: number; after: number }> {
    const now = new Date();
    const { dailyEnergy } = await this.settings();
    return this.prisma.$transaction(async (tx) => {
      const { balance: before } = await this.lockAndRefill(tx, userId, dailyEnergy, now);
      const after = change.mode === "add" ? before + change.amount : change.amount;
      if (after < 0) {
        throw new BadRequestException({ error: "energy_below_zero" });
      }
      await tx.user.update({ where: { id: userId }, data: { energy: after } });
      await tx.energyEntry.create({ data: { userId, amount: after - before, reason: "admin", createdAt: now } });
      return { before, after };
    });
  }

  /** Sets the own daily amount of a user, in hundredths. Null uses the daily energy of the settings again. */
  async setDailyEnergy(userId: string, dailyEnergy: number | null): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { dailyEnergy } });
  }

  /**
   * Takes the price before the model call. A balance below the price gives 429 `energy_low` with the balance, the
   * price and the next refill time, and records an `energy_too_low` event. A price of 0 also saves a row, so the
   * admin overview counts each free model call.
   */
  async spend(
    userId: string,
    price: number,
    reason: SpendReason,
    links: { chatId?: string; freeModelId?: string } = {},
  ): Promise<EnergySpend> {
    const now = new Date();
    const { dailyEnergy } = await this.settings();
    const result = await this.prisma.$transaction(async (tx) => {
      const { balance } = await this.lockAndRefill(tx, userId, dailyEnergy, now);
      if (balance < price) {
        return { ok: false as const, balance };
      }
      // The row lock already orders the spends. The condition is a second guard, next to the CHECK of the column.
      await tx.user.updateMany({ where: { id: userId, energy: { gte: price } }, data: { energy: { decrement: price } } });
      const entry = await tx.energyEntry.create({
        data: { userId, amount: -price, reason, chatId: links.chatId, freeModelId: links.freeModelId, createdAt: now },
      });
      return { ok: true as const, entry };
    });
    if (!result.ok) {
      await this.events.record("energy_too_low", { userId, reason });
      throw new HttpException(
        { error: "energy_low", balance: toEnergy(result.balance), price: toEnergy(price), nextRefillAt: nextRefill(now).toISOString() },
        429,
      );
    }
    const { entry } = result;
    return { id: entry.id, userId, amount: price, chatId: entry.chatId, freeModelId: entry.freeModelId, createdAt: now };
  }

  /**
   * Gives a spend back when the call gave the user no result. A second refund of one spend does nothing. After a
   * refill, the balance is already full, so the refund row has the amount 0.
   */
  async refund(spend: EnergySpend): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await this.lock(tx, spend.userId);
      if (!user || (await tx.energyEntry.findUnique({ where: { refundOfId: spend.id }, select: { id: true } }))) {
        return;
      }
      const refilledAfter = user.energy_refilled_at !== null && user.energy_refilled_at > spend.createdAt;
      const amount = refilledAfter ? 0 : spend.amount;
      if (amount > 0) {
        await tx.user.update({ where: { id: spend.userId }, data: { energy: { increment: amount } } });
      }
      await tx.energyEntry.create({
        data: {
          userId: spend.userId,
          amount,
          reason: "refund",
          chatId: spend.chatId,
          freeModelId: spend.freeModelId,
          refundOfId: spend.id,
        },
      });
    });
  }

  /** The free model calls of all users since 00:00 UTC, for the global daily cap. */
  freeRequestsToday(): Promise<number> {
    return this.prisma.energyEntry.count({
      where: { reason: { in: SPEND_REASONS }, freeModelId: { not: null }, createdAt: { gte: dayStart(new Date()) } },
    });
  }

  private async lock(tx: Prisma.TransactionClient, userId: string) {
    const [row] = await tx.$queryRaw<Array<{ energy: number; energy_refilled_at: Date | null; daily_energy: number | null }>>`
      SELECT energy, energy_refilled_at, daily_energy FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    return row ?? null;
  }

  /**
   * Locks the user row, refills the balance when the last refill was before 00:00 UTC, and gives the balance with the
   * daily amount of the user. An own daily amount of the user wins over the daily energy of the settings.
   */
  private async lockAndRefill(
    tx: Prisma.TransactionClient,
    userId: string,
    globalDaily: number,
    now: Date,
  ): Promise<{ balance: number; dailyEnergy: number }> {
    const user = await this.lock(tx, userId);
    if (!user) {
      throw new HttpException({ error: "unauthorized" }, 401);
    }
    const dailyEnergy = user.daily_energy ?? globalDaily;
    if (user.energy_refilled_at !== null && user.energy_refilled_at >= dayStart(now)) {
      return { balance: user.energy, dailyEnergy };
    }
    await tx.user.update({ where: { id: userId }, data: { energy: dailyEnergy, energyRefilledAt: now } });
    await tx.energyEntry.create({ data: { userId, amount: dailyEnergy - user.energy, reason: "refill", createdAt: now } });
    return { balance: dailyEnergy, dailyEnergy };
  }
}
