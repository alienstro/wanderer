import { z } from "zod";

export const OVERVIEW_PERIODS = ["today", "7d", "30d"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

/** The number of days in each period. The last day is today. */
export const OVERVIEW_PERIOD_DAYS: Record<OverviewPeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export const OVERVIEW_PERIOD_LABELS: Record<OverviewPeriod, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };

/** True when the value is an IANA time zone name, such as "Asia/Manila". */
function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The query of the admin overview endpoints. A day starts at midnight in `tz`. */
export const overviewQuerySchema = z.object({
  period: z.enum(OVERVIEW_PERIODS).default("7d"),
  tz: z.string().max(64).refine(isTimeZone).default("UTC"),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

/** The numbers of the overview. A "use" number shows how people use the app. A "failure" number shows what fails. */
export const OVERVIEW_METRICS = [
  { key: "newUsers", kind: "use", label: "New users", help: "People who made an account." },
  {
    key: "activeUsers",
    kind: "use",
    label: "Active users",
    help: "People who sent one or more chat messages. Each person counts one time.",
  },
  { key: "logins", kind: "use", label: "Logins", help: "Each time a person logged in with Google." },
  { key: "newChats", kind: "use", label: "New chats", help: "Chats that people started." },
  { key: "newMessages", kind: "use", label: "Messages sent", help: "Chat messages that people sent. AI replies are not in this number." },
  { key: "newCharacters", kind: "use", label: "New characters", help: "Characters that people made, drafts too." },
  {
    key: "failedReplies",
    kind: "failure",
    label: "Failed AI replies",
    help: "AI replies that stopped with an error or a time limit. A Stop of the user is not a failure.",
  },
  { key: "failedChoices", kind: "failure", label: "Failed reply choices", help: "Times the four reply choices did not load." },
  { key: "failedSummaries", kind: "failure", label: "Failed memory summaries", help: "Times the memory summary did not load." },
  { key: "failedProxyTests", kind: "failure", label: "Failed proxy tests", help: "Times the Test button of a proxy got an error." },
  { key: "failedModelLists", kind: "failure", label: "Failed model lists", help: "Times the model list of a proxy did not load." },
] as const;

export type OverviewMetric = (typeof OVERVIEW_METRICS)[number]["key"];

export interface OverviewSeries {
  /** The number for the full period. For active users, each person counts one time. */
  total: number;
  /** One number for each day of `days`. */
  series: number[];
}

/** GET /admin/overview/stats */
export interface OverviewStats {
  period: OverviewPeriod;
  /** One date for each day of the period, such as 2026-10-25, the oldest first. */
  days: string[];
  metrics: Record<OverviewMetric, OverviewSeries>;
}
