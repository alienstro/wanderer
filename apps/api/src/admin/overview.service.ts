import { BadRequestException, Injectable } from "@nestjs/common";
import {
  ADMIN_PAGE_SIZE,
  OVERVIEW_METRICS,
  OVERVIEW_PERIOD_DAYS,
  OVERVIEW_PROBLEM_TYPES,
  type OverviewHealth,
  type OverviewHealthStatus,
  type OverviewMetric,
  type OverviewPageQuery,
  type OverviewProblemList,
  type OverviewProblemType,
  type OverviewQuery,
  overviewPageQuerySchema,
  overviewQuerySchema,
  type OverviewSeries,
  type OverviewStats,
  TOP_PAGE_SIZE,
  type TopCharacterListName,
  type TopCharacterPage,
  type TopCharactersQuery,
  topCharactersQuerySchema,
} from "@wanderer/shared";
import { decodeCountCursor, decodeTimeCursor, encodeCountCursor, encodeTimeCursor } from "../characters/cursor.js";
import { type AppEventType, Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The table of each top-characters list. */
const TOP_SOURCES: Record<TopCharacterListName, Prisma.Sql> = {
  chats: Prisma.sql`chats`,
  likes: Prisma.sql`character_likes`,
};
/** The health status looks at the AI replies of this time. */
const HEALTH_WINDOW_MS = 60 * 60 * 1000;
/** With fewer tries, a few failures of one user do not make the status "down". */
const DOWN_MIN_TRIES = 5;

/** The metric of each app event type. */
const EVENT_METRIC: Record<AppEventType, OverviewMetric> = {
  login: "logins",
  ai_reply_failed: "failedReplies",
  choices_failed: "failedChoices",
  summary_failed: "failedSummaries",
  proxy_test_failed: "failedProxyTests",
  model_list_failed: "failedModelLists",
};

/**
 * The rows that one metric counts. `key` splits one query into many metrics. `at` is the time column. The table
 * names are fixed in this file, so no user value goes into the SQL text.
 */
interface CountSource {
  key: Prisma.Sql;
  value: Prisma.Sql;
  from: Prisma.Sql;
  at: Prisma.Sql;
  where: Prisma.Sql;
}

/** One count. A null day is the total of the full period. */
interface CountRow {
  key: string;
  day: string | null;
  n: number;
}

const COUNT_ALL = Prisma.sql`count(*)`;
const NO_KEY = Prisma.sql`''`;

/** The metrics that count the rows of a table. The app events give the other metrics. */
const TABLE_METRICS = ["newUsers", "activeUsers", "newChats", "newMessages", "newCharacters"] as const;

const TABLE_SOURCES: Record<(typeof TABLE_METRICS)[number], CountSource> = {
  newUsers: { key: NO_KEY, value: COUNT_ALL, from: Prisma.sql`users t`, at: Prisma.sql`t.created_at`, where: Prisma.empty },
  activeUsers: {
    key: NO_KEY,
    value: Prisma.sql`count(DISTINCT c.user_id)`,
    from: Prisma.sql`messages t JOIN chats c ON c.id = t.chat_id`,
    at: Prisma.sql`t.created_at`,
    where: Prisma.sql`AND t.role = 'user'`,
  },
  newChats: { key: NO_KEY, value: COUNT_ALL, from: Prisma.sql`chats t`, at: Prisma.sql`t.created_at`, where: Prisma.empty },
  newMessages: {
    key: NO_KEY,
    value: COUNT_ALL,
    from: Prisma.sql`messages t`,
    at: Prisma.sql`t.created_at`,
    where: Prisma.sql`AND t.role = 'user'`,
  },
  newCharacters: { key: NO_KEY, value: COUNT_ALL, from: Prisma.sql`characters t`, at: Prisma.sql`t.created_at`, where: Prisma.empty },
};

const EVENTS_SOURCE: CountSource = {
  key: Prisma.sql`t.type::text`,
  value: COUNT_ALL,
  from: Prisma.sql`app_events t`,
  at: Prisma.sql`t.created_at`,
  where: Prisma.empty,
};

/** The start of the period: midnight in `tz`, as a UTC time with no zone, like the created_at columns. */
function periodStart({ period, tz }: OverviewQuery): Prisma.Sql {
  return Prisma.sql`(date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${OVERVIEW_PERIOD_DAYS[period] - 1}::int))
    AT TIME ZONE ${tz} AT TIME ZONE 'UTC'`;
}

/** "down" when half or more of 5 or more tries failed. "some_problems" when 10% or more failed. */
function healthStatus(replies: number, failed: number): OverviewHealthStatus {
  const tries = replies + failed;
  if (tries >= DOWN_MIN_TRIES && failed * 2 >= tries) {
    return "down";
  }
  return failed > 0 && failed * 10 >= tries ? "some_problems" : "ok";
}

/** Gives the parsed query, or 400 invalid_period. */
export function parseOverviewQuery(query: unknown): OverviewQuery {
  const parsed = overviewQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new BadRequestException({ error: "invalid_period" });
  }
  return parsed.data;
}

/** Gives the parsed query of a list with pages, or 400 invalid_period. The cursor is checked by the list. */
export function parseOverviewPageQuery(query: unknown): OverviewPageQuery {
  const parsed = overviewPageQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new BadRequestException({ error: "invalid_period" });
  }
  return parsed.data;
}

/** Gives the parsed query of a top-characters list, or 400 invalid_period. */
export function parseTopCharactersQuery(query: unknown): TopCharactersQuery {
  const parsed = topCharactersQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new BadRequestException({ error: "invalid_period" });
  }
  return parsed.data;
}

/** Counts the use and the failures of the app for the admin overview. It reads no chat text. */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(query: OverviewQuery): Promise<OverviewStats> {
    const days = await this.days(query);
    const [events, ...tables] = await Promise.all([
      this.count(query, EVENTS_SOURCE),
      ...TABLE_METRICS.map((metric) => this.count(query, TABLE_SOURCES[metric])),
    ]);
    const metrics = new Map<OverviewMetric, OverviewSeries>();
    TABLE_METRICS.forEach((metric, index) => metrics.set(metric, toSeries(tables[index] ?? [], "", days)));
    for (const [type, metric] of Object.entries(EVENT_METRIC)) {
      metrics.set(metric, toSeries(events, type, days));
    }
    // The order of OVERVIEW_METRICS is the order of the page.
    const ordered = Object.fromEntries(OVERVIEW_METRICS.map(({ key }) => [key, metrics.get(key)]));
    return { period: query.period, days, metrics: ordered as Record<OverviewMetric, OverviewSeries> };
  }

  /** One page of the failures of the period, the newest first. Logins are not problems. */
  async problems(query: OverviewPageQuery): Promise<OverviewProblemList> {
    const after = query.cursor === undefined ? null : decodeTimeCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new BadRequestException({ error: "invalid_cursor" });
    }
    const afterTime = after ? new Date(after.createdAt) : null;
    const rows = await this.prisma.appEvent.findMany({
      where: {
        type: { in: [...OVERVIEW_PROBLEM_TYPES] },
        createdAt: { gte: await this.start(query) },
        ...(after && afterTime
          ? { OR: [{ createdAt: { lt: afterTime } }, { createdAt: afterTime, id: { lt: after.id } }] }
          : {}),
      },
      select: {
        id: true,
        type: true,
        reason: true,
        createdAt: true,
        user: { select: { id: true, handle: true } },
        character: { select: { id: true, title: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: ADMIN_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, ADMIN_PAGE_SIZE);
    const last = page.at(-1);
    return {
      problems: page.map((row) => ({ ...row, type: row.type as OverviewProblemType, createdAt: row.createdAt.toISOString() })),
      nextCursor:
        rows.length > ADMIN_PAGE_SIZE && last ? encodeTimeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /** One page of the characters with the most new chats, or the most new likes, in the period. Ties sort by ID. */
  async topCharacters(query: TopCharactersQuery): Promise<TopCharacterPage> {
    const after = query.cursor === undefined ? null : decodeCountCursor(query.cursor);
    if (query.cursor !== undefined && after === null) {
      throw new BadRequestException({ error: "invalid_cursor" });
    }
    const afterRow = after
      ? Prisma.sql`c.count < ${after.count} OR (c.count = ${after.count} AND c.id > ${after.id}::uuid)`
      : Prisma.sql`TRUE`;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string; count: number; maxCount: number }>>`
      WITH counts AS (
        SELECT character_id AS id, count(*)::int AS count
        FROM ${TOP_SOURCES[query.by]}
        WHERE created_at >= ${periodStart(query)}
        GROUP BY character_id
      )
      SELECT c.id, ch.title, c.count, (SELECT max(count) FROM counts)::int AS "maxCount"
      FROM counts c JOIN characters ch ON ch.id = c.id
      WHERE ${afterRow}
      ORDER BY c.count DESC, c.id ASC
      LIMIT ${TOP_PAGE_SIZE + 1}`;
    const page = rows.slice(0, TOP_PAGE_SIZE);
    const last = page.at(-1);
    return {
      characters: page.map(({ id, title, count }) => ({ id, title, count })),
      nextCursor: rows.length > TOP_PAGE_SIZE && last ? encodeCountCursor({ count: last.count, id: last.id }) : null,
      maxCount: rows[0]?.maxCount ?? 0,
    };
  }

  /**
   * The status of the AI replies of the last 60 minutes. A saved reply after the opening counts as a reply. A failed
   * reply with some text also saves a message, so it can count in both numbers.
   */
  async health(): Promise<OverviewHealth> {
    const createdAt = { gte: new Date(Date.now() - HEALTH_WINDOW_MS) };
    const [replies, failedReplies] = await Promise.all([
      this.prisma.message.count({ where: { role: "assistant", position: { gt: 0 }, createdAt } }),
      this.prisma.appEvent.count({ where: { type: "ai_reply_failed", createdAt } }),
    ]);
    return { status: healthStatus(replies, failedReplies), replies, failedReplies };
  }

  private async start(query: OverviewQuery): Promise<Date> {
    const [row] = await this.prisma.$queryRaw<Array<{ start: string }>>`
      SELECT to_char(${periodStart(query)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS start`;
    return new Date(row?.start ?? 0);
  }

  /** The dates of the period in the time zone, the oldest first. The last date is today. */
  private async days({ period, tz }: OverviewQuery): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string }>>`
      SELECT to_char(d, 'YYYY-MM-DD') AS day
      FROM generate_series(
        date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${OVERVIEW_PERIOD_DAYS[period] - 1}::int),
        date_trunc('day', now() AT TIME ZONE ${tz}),
        interval '1 day'
      ) AS d`;
    return rows.map((row) => row.day);
  }

  /**
   * Counts the rows of the period for each key and day, plus a total for each key. The columns hold UTC times
   * with no zone, so the query changes them to the local day of `tz`. The start check can use the created_at index.
   */
  private count(query: OverviewQuery, source: CountSource): Promise<CountRow[]> {
    return this.prisma.$queryRaw<CountRow[]>`
      WITH bounds AS (SELECT ${periodStart(query)} AS start_at)
      SELECT ${source.key} AS key,
        to_char(date_trunc('day', (${source.at} AT TIME ZONE 'UTC') AT TIME ZONE ${query.tz}), 'YYYY-MM-DD') AS day,
        ${source.value}::int AS n
      FROM ${source.from}, bounds
      WHERE ${source.at} >= bounds.start_at ${source.where}
      GROUP BY GROUPING SETS ((key, day), (key))`;
  }
}

/** Puts the counts of one key in the order of the days. A day with no row is 0. */
function toSeries(rows: CountRow[], key: string, days: string[]): OverviewSeries {
  const byDay = new Map<string | null, number>();
  for (const row of rows) {
    if (row.key === key) {
      byDay.set(row.day, row.n);
    }
  }
  return { total: byDay.get(null) ?? 0, series: days.map((day) => byDay.get(day) ?? 0) };
}
