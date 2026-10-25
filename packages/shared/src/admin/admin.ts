import { z } from "zod";
import { PROXY_MODELS_ERROR_TEXT } from "../proxies/index.js";

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

/** The number of rows on one page of the problems and the reports. */
export const ADMIN_PAGE_SIZE = 20;

/** The query of a list with pages. The cursor comes from the `nextCursor` of the page before. */
export const overviewPageQuerySchema = overviewQuerySchema.extend({
  cursor: z.string().max(200).optional(),
});

export type OverviewPageQuery = z.infer<typeof overviewPageQuerySchema>;

/** The number of characters on one page of a top-characters list. */
export const TOP_PAGE_SIZE = 10;

/** The two top-characters lists: by new chats and by new likes. */
export const TOP_CHARACTER_LISTS = ["chats", "likes"] as const;
export type TopCharacterListName = (typeof TOP_CHARACTER_LISTS)[number];

export const topCharactersQuerySchema = overviewPageQuerySchema.extend({
  by: z.enum(TOP_CHARACTER_LISTS),
});

export type TopCharactersQuery = z.infer<typeof topCharactersQuerySchema>;

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
  {
    key: "freeModelBusy",
    kind: "failure",
    label: "Free model busy",
    help: "Times OpenRouter answered 429 to a free model call, or the daily cap of free model calls was full.",
  },
  {
    key: "freeReplies",
    kind: "energy",
    label: "Free model replies",
    help: "AI replies on a free model. A failed reply that gave its energy back is not in this number.",
  },
  { key: "freeUsers", kind: "energy", label: "Free model users", help: "People who got a reply on a free model. Each person counts one time." },
  { key: "energyReply", kind: "energy", label: "Energy on replies", help: "The energy that people spent on free model replies, after refunds." },
  { key: "energyChoices", kind: "energy", label: "Energy on reply choices", help: "The energy that people spent on reply choices, after refunds." },
  { key: "energyMemory", kind: "energy", label: "Energy on memory drafts", help: "The energy that people spent on memory drafts, after refunds." },
  { key: "energyScene", kind: "energy", label: "Energy on scene images", help: "The energy that people spent on scene images, after refunds." },
  { key: "energyTooLow", kind: "energy", label: "Too little energy", help: "Times a person had too little energy for an action." },
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

/** The kinds of problems. Each is an app event type, except login. */
export const OVERVIEW_PROBLEM_TYPES = [
  "ai_reply_failed",
  "choices_failed",
  "summary_failed",
  "proxy_test_failed",
  "model_list_failed",
] as const;
export type OverviewProblemType = (typeof OVERVIEW_PROBLEM_TYPES)[number];

export const OVERVIEW_PROBLEM_LABELS: Record<OverviewProblemType, string> = {
  ai_reply_failed: "Failed AI reply",
  choices_failed: "Failed reply choices",
  summary_failed: "Failed memory summary",
  proxy_test_failed: "Failed proxy test",
  model_list_failed: "Failed model list",
};

/** The reasons that only an app event has. The AI error codes have their text in PROXY_MODELS_ERROR_TEXT. */
const EVENT_REASON_TEXT: Record<string, string> = {
  internal_error: "Wanderer had an internal error.",
  bad_choices: "The AI did not give four choices.",
  empty_summary: "The AI gave an empty summary.",
};

/** The plain-language reason of a problem, such as "The proxy did not answer in time." */
export function problemReasonText(reason: string): string {
  return (PROXY_MODELS_ERROR_TEXT as Record<string, string>)[reason] ?? EVENT_REASON_TEXT[reason] ?? "Unknown reason.";
}

/** One failure. It holds ids and codes only, never chat text, keys or URLs. A null user or character was deleted. */
export interface OverviewProblem {
  id: string;
  type: OverviewProblemType;
  reason: string;
  createdAt: string;
  user: { id: string; handle: string | null } | null;
  character: { id: string; title: string } | null;
}

/** GET /admin/overview/problems: one page of the problems of the period, the newest first. */
export interface OverviewProblemList {
  problems: OverviewProblem[];
  /** Null when no more problems exist. */
  nextCursor: string | null;
}

export interface TopCharacter {
  id: string;
  title: string;
  /** The number of new chats or new likes in the period. */
  count: number;
}

/** GET /admin/overview/top-characters: one page of one list, the highest count first. */
export interface TopCharacterPage {
  characters: TopCharacter[];
  /** Null when no more characters exist. */
  nextCursor: string | null;
  /** The count of the first character of the period, so each page can draw its bars against it. 0 for an empty list. */
  maxCount: number;
}

export const OVERVIEW_HEALTH_LABELS = { ok: "OK", some_problems: "Some problems", down: "Down" } as const;
export type OverviewHealthStatus = keyof typeof OVERVIEW_HEALTH_LABELS;

/** GET /admin/overview/health: the AI replies of the last 60 minutes. */
export interface OverviewHealth {
  status: OverviewHealthStatus;
  replies: number;
  failedReplies: number;
  /** The replies on a free model that kept their energy. */
  freeReplies: number;
  /** The free model calls that OpenRouter answered with 429, or that the daily cap stopped. */
  freeModelBusy: number;
}
