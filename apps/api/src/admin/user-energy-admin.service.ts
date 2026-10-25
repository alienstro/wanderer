import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type AdminEnergyEntry,
  type AdminUserEnergy,
  type AdminUserEnergyPage,
  type EnergyReasonName,
  toEnergy,
  USER_ENERGY_PAGE_SIZE,
  userDailyEnergySchema,
  userEnergyAdjustSchema,
  userEnergyQuerySchema,
} from "@wanderer/shared";
import type { z } from "zod";
import { isUuid } from "../common/uuid.js";
import { dayStart, EnergyService } from "../energy/energy.service.js";
import { EventsService } from "../events/events.service.js";
import type { EnergySettings, Prisma, User } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const NOT_FOUND = { error: "not_found" };
/** The number of balance changes that the history shows. */
const HISTORY_SIZE = 20;

const USER_FIELDS = {
  id: true,
  name: true,
  handle: true,
  email: true,
  role: true,
  energy: true,
  energyRefilledAt: true,
  dailyEnergy: true,
  createdAt: true,
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_FIELDS }>;

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))];
    throw new BadRequestException({ error: "invalid_energy", fields });
  }
  return parsed.data;
}

/**
 * The view of one user. The page reads no balance with a write, so a due refill shows as the daily amount here, and
 * the next action of the user saves it.
 */
function toView(row: UserRow, settings: EnergySettings, now = new Date()): AdminUserEnergy {
  const dailyEnergy = row.dailyEnergy ?? settings.dailyEnergy;
  const refillDue = row.energyRefilledAt === null || row.energyRefilledAt < dayStart(now);
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    email: row.email,
    role: row.role,
    balance: toEnergy(refillDue ? dailyEnergy : row.energy),
    dailyEnergy: toEnergy(dailyEnergy),
    ownDailyEnergy: row.dailyEnergy === null ? null : toEnergy(row.dailyEnergy),
  };
}

/**
 * The admin tab "User energy": the balance and the own daily amount of each user. Each change saves a ledger row (for
 * the balance) and an `admin_change` event with the admin, the old value and the new value.
 */
@Injectable()
export class UserEnergyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly energy: EnergyService,
    private readonly events: EventsService,
  ) {}

  /**
   * One page of users, the newest first, with the page count for the page numbers. The search looks in the name,
   * the handle and the email. The admin list is short, so the page number skips rows (an offset).
   */
  async list(query: unknown): Promise<AdminUserEnergyPage> {
    const { q, page } = parse(userEnergyQuerySchema, query);
    const where = q
      ? { OR: (["name", "handle", "email"] as const).map((field) => ({ [field]: { contains: q, mode: "insensitive" as const } })) }
      : {};
    const [rows, total, settings] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_FIELDS,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * USER_ENERGY_PAGE_SIZE,
        take: USER_ENERGY_PAGE_SIZE,
      }),
      this.prisma.user.count({ where }),
      this.energy.settings(),
    ]);
    return {
      users: rows.map((row) => toView(row, settings)),
      page,
      pageCount: Math.max(1, Math.ceil(total / USER_ENERGY_PAGE_SIZE)),
      total,
    };
  }

  /** Adds energy to the balance, takes it away, or sets it. The change lasts until the next refill. */
  async adjust(admin: User, id: string, body: unknown): Promise<AdminUserEnergy> {
    await this.find(id);
    const change = parse(userEnergyAdjustSchema, body);
    const { before, after } = await this.energy.adjust(id, change);
    await this.audit(admin, id, { balance: toEnergy(before) }, { balance: toEnergy(after) });
    return this.view(id);
  }

  /** Sets the own daily amount of a user. Null uses the daily energy of the settings again. */
  async setDaily(admin: User, id: string, body: unknown): Promise<AdminUserEnergy> {
    const current = await this.find(id);
    const { dailyEnergy } = parse(userDailyEnergySchema, body);
    await this.prisma.user.update({ where: { id }, data: { dailyEnergy } });
    await this.audit(
      admin,
      id,
      { dailyEnergy: current.dailyEnergy === null ? null : toEnergy(current.dailyEnergy) },
      { dailyEnergy: dailyEnergy === null ? null : toEnergy(dailyEnergy) },
    );
    return this.view(id);
  }

  /** The last changes of the balance of a user, the newest first. */
  async history(id: string): Promise<AdminEnergyEntry[]> {
    await this.find(id);
    const rows = await this.prisma.energyEntry.findMany({
      where: { userId: id },
      orderBy: { seq: "desc" },
      take: HISTORY_SIZE,
    });
    return rows.map((row) => ({
      id: row.id,
      amount: toEnergy(row.amount),
      reason: row.reason as EnergyReasonName,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async view(id: string): Promise<AdminUserEnergy> {
    const [row, settings] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id }, select: USER_FIELDS }),
      this.energy.settings(),
    ]);
    return toView(row, settings);
  }

  private async find(id: string): Promise<UserRow> {
    const row = isUuid(id) ? await this.prisma.user.findUnique({ where: { id }, select: USER_FIELDS }) : null;
    if (!row) {
      throw new NotFoundException(NOT_FOUND);
    }
    return row;
  }

  private audit(admin: User, userId: string, old: object, next: object): Promise<void> {
    return this.events.record("admin_change", { userId: admin.id, reason: "user_energy", details: { userId, old, new: next } as Prisma.InputJsonObject });
  }
}
