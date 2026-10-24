import { BadRequestException, Injectable } from "@nestjs/common";
import {
  OVERVIEW_METRICS,
  OVERVIEW_PERIOD_DAYS,
  type OverviewMetric,
  type OverviewQuery,
  overviewQuerySchema,
  type OverviewSeries,
  type OverviewStats,
} from "@wanderer/shared";
import { type AppEventType, Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

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

/** Gives the parsed query, or 400 invalid_period. */
export function parseOverviewQuery(query: unknown): OverviewQuery {
  const parsed = overviewQuerySchema.safeParse(query ?? {});
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
  private count({ period, tz }: OverviewQuery, source: CountSource): Promise<CountRow[]> {
    return this.prisma.$queryRaw<CountRow[]>`
      WITH bounds AS (
        SELECT (date_trunc('day', now() AT TIME ZONE ${tz}) - make_interval(days => ${OVERVIEW_PERIOD_DAYS[period] - 1}::int))
          AT TIME ZONE ${tz} AT TIME ZONE 'UTC' AS start_at
      )
      SELECT ${source.key} AS key,
        to_char(date_trunc('day', (${source.at} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS day,
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
