"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  OVERVIEW_HEALTH_LABELS,
  OVERVIEW_METRICS,
  OVERVIEW_PERIOD_LABELS,
  OVERVIEW_PERIODS,
  OVERVIEW_PROBLEM_LABELS,
  type OverviewHealth,
  type OverviewHealthStatus,
  type OverviewPeriod,
  type OverviewProblem,
  type OverviewProblemList,
  type OverviewStats,
  problemReasonText,
  TOP_PAGE_SIZE,
  type TopCharacterListName,
  type TopCharacterPage,
} from "@wanderer/shared";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Pager, usePager } from "./pager";
import { TrendLine } from "./trend-line";

const QUERY_KEY = "admin-overview";
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const fullNumber = new Intl.NumberFormat("en");
const shortNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

const HEALTH_STYLE: Record<OverviewHealthStatus, { box: string; badge: string }> = {
  ok: { box: "border-[rgba(34,197,94,0.35)]", badge: "bg-[rgba(34,197,94,0.16)] text-[#86efac]" },
  some_problems: { box: "border-[rgba(245,194,107,0.4)]", badge: "bg-[rgba(245,194,107,0.16)] text-gold" },
  down: { box: "border-[rgba(194,65,75,0.7)]", badge: "bg-[rgba(194,65,75,0.9)] text-white" },
};

/** The time zone of the browser. A day of the overview starts at midnight in this zone. */
function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** 2,614 in full. From 10,000 the short form, such as 12.4K, so the number fits in the cell. */
function formatTotal(value: number): string {
  return value >= 10_000 ? shortNumber.format(value) : fullNumber.format(value);
}

/** "12 minutes ago" for the last day, else the date and the time. */
function relativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  if (seconds > -60) {
    return "just now";
  }
  if (seconds > -3600) {
    return relativeFormat.format(Math.round(seconds / 60), "minute");
  }
  if (seconds > -86_400) {
    return relativeFormat.format(Math.round(seconds / 3600), "hour");
  }
  return dateFormat.format(new Date(iso));
}

/** The admin overview: the health, the use and the failures of the app. It shows no chat text. */
export function AdminOverview() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<OverviewPeriod>("7d");
  const problemsPager = usePager();
  const chatsPager = usePager();
  const likesPager = usePager();
  const tz = timeZone();
  // A list with pages keeps the old page on the screen while the next one loads, so the list does not jump.
  const load = <T,>(panel: string, params: Record<string, string> = {}) => ({
    queryKey: [QUERY_KEY, panel, period, params],
    queryFn: () => apiFetch<T>(`/admin/overview/${panel}?${new URLSearchParams({ period, tz, ...params })}`),
    placeholderData: keepPreviousData,
  });
  const page = (cursor: string | undefined): Record<string, string> => (cursor === undefined ? {} : { cursor });
  const stats = useQuery(load<OverviewStats>("stats"));
  const problems = useQuery(load<OverviewProblemList>("problems", page(problemsPager.cursor)));
  const topChats = useQuery(load<TopCharacterPage>("top-characters", { by: "chats", ...page(chatsPager.cursor) }));
  const topLikes = useQuery(load<TopCharacterPage>("top-characters", { by: "likes", ...page(likesPager.cursor) }));
  const health = useQuery({ queryKey: [QUERY_KEY, "health"], queryFn: () => apiFetch<OverviewHealth>("/admin/overview/health") });

  if (stats.error instanceof ApiError && stats.error.status === 403) {
    return <p className="m-0 text-muted">This page is for the admin.</p>;
  }
  const refreshing = stats.isFetching || problems.isFetching || topChats.isFetching || topLikes.isFetching || health.isFetching;
  const changePeriod = (value: OverviewPeriod) => {
    setPeriod(value);
    // A cursor belongs to one period, so each list starts again at page 1.
    problemsPager.reset();
    chatsPager.reset();
    likesPager.reset();
  };
  // A failed health request means that the API or its database does not answer, so the app is down.
  const status: OverviewHealthStatus | undefined = health.isError ? "down" : health.data?.status;

  return (
    <div className="flex flex-col gap-8">
      <HealthStrip status={status} health={health.data} />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {OVERVIEW_PERIODS.map((value) => (
            <button key={value} type="button" className="chip" aria-pressed={value === period} onClick={() => changePeriod(value)}>
              {OVERVIEW_PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pill pill-soft ml-auto"
          disabled={refreshing}
          onClick={() => void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })}
        >
          {refreshing ? "Loading…" : "Refresh"}
        </button>
      </div>

      {stats.isPending && <p className="m-0 text-muted">Loading the numbers…</p>}
      {stats.isError && <p className="m-0 text-muted">The numbers did not load. Select Refresh to try again.</p>}
      {stats.data && (
        <>
          <MetricGrid title="How people use the app" kind="use" stats={stats.data} />
          <MetricGrid title="What fails" kind="failure" stats={stats.data} />
        </>
      )}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section aria-labelledby="problems-title" className="flex flex-col gap-3">
          <PanelHeading id="problems-title" title="Recent problems">
            The failures of the period, the newest first. It shows no chat text, keys or URLs.
          </PanelHeading>
          <div className="panel overflow-hidden">
            {problems.isError && <p className="m-0 px-5 py-4 text-muted">The problems did not load. Select Refresh to try again.</p>}
            {problems.data?.problems.length === 0 && <p className="m-0 px-5 py-4 text-muted">No problems in this period.</p>}
            {problems.data && problems.data.problems.length > 0 && (
              <ul aria-label="Recent problems" className="m-0 list-none divide-y divide-line p-0">
                {problems.data.problems.map((problem) => (
                  <ProblemRow key={problem.id} problem={problem} />
                ))}
              </ul>
            )}
          </div>
          <Pager label="Recent problems pages" pager={problemsPager} nextCursor={problems.data?.nextCursor} />
        </section>

        <section aria-labelledby="top-title" className="flex flex-col gap-3">
          <PanelHeading id="top-title" title="Top characters">
            The characters with the most new chats and the most new likes in the period.
          </PanelHeading>
          <div className="panel flex flex-col gap-6 p-5">
            <TopList list="chats" query={topChats} pager={chatsPager} />
            <TopList list="likes" query={topLikes} pager={likesPager} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** The state of the AI replies of the last hour. It is the first thing an admin reads. */
function HealthStrip({ status, health }: { status: OverviewHealthStatus | undefined; health: OverviewHealth | undefined }) {
  const style = status ? HEALTH_STYLE[status] : undefined;
  const tries = health ? health.replies + health.failedReplies : 0;
  return (
    <section aria-label="Health" className={`panel flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4 ${style?.box ?? ""}`}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-full ${style?.badge ?? "bg-surface-2 text-subtle"}`}>
          <StatusIcon status={status} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] text-muted">Health</span>
          <strong className="text-[22px] leading-tight font-semibold">{status ? OVERVIEW_HEALTH_LABELS[status] : "Checking…"}</strong>
          {health && (
            <span className="text-[13px] text-muted">
              {tries === 0
                ? "No AI replies in the last hour."
                : `${health.failedReplies} of ${tries} AI replies failed in the last hour.`}
            </span>
          )}
        </div>
      </div>
      <p className="m-0 max-w-[64ch] flex-1 basis-[320px] text-[12px] leading-relaxed text-subtle">
        OK: few AI replies failed in the last hour. Some problems: 10% or more failed. Down: half or more of 5 or more
        replies failed, or the API does not answer.
      </p>
    </section>
  );
}

/** A check, a warning sign or a cross. The label next to it gives the name, so screen readers skip it. */
function StatusIcon({ status }: { status: OverviewHealthStatus | undefined }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  if (status === "ok") {
    return (
      <svg {...common}>
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
    );
  }
  if (status === "some_problems") {
    return (
      <svg {...common}>
        <path d="M12 8v5" />
        <path d="M12 16.5h.01" />
        <path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  if (status === "down") {
    return (
      <svg {...common}>
        <path d="m7 7 10 10" />
        <path d="m17 7-10 10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

function PanelHeading({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="m-0 text-base">
        {title}
      </h2>
      <p className="m-0 max-w-[64ch] text-[13px] text-muted">{children}</p>
    </div>
  );
}

function MetricGrid({ title, kind, stats }: { title: string; kind: "use" | "failure"; stats: OverviewStats }) {
  const metrics = OVERVIEW_METRICS.filter((metric) => metric.kind === kind);
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="m-0 text-base">{title}</h2>
      {kind === "use" ? (
        // The six cells share one panel in 2, 3 or 6 columns, so each row is full. Each cell draws its right and bottom
        // line, and the negative margin hides the outer ones.
        <div className="panel @container overflow-hidden">
          <div className="-mr-px -mb-px grid grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-6">
            {metrics.map(({ key, label, help }) => (
              <div key={key} role="group" aria-label={label} className="flex flex-col gap-2 border-r border-b border-line p-4">
                <span className="text-[13px] text-muted">{label}</span>
                <span className="text-[28px] leading-none font-semibold tabular-nums">{formatTotal(stats.metrics[key].total)}</span>
                <TrendLine label={label} days={stats.days} values={stats.metrics[key].series} accent="text-link" />
                <p className="m-0 text-[12px] leading-snug text-subtle">{help}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // The failures are rows: most are 0 on a good day, so a list reads faster than a grid of cells.
        <div className="panel @container divide-y divide-line overflow-hidden">
          {metrics.map(({ key, label, help }) => {
            const { total, series } = stats.metrics[key];
            return (
              <div
                key={key}
                role="group"
                aria-label={label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-3.5 @2xl:grid-cols-[minmax(0,1fr)_minmax(160px,1.4fr)_64px]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{label}</span>
                  <p className="m-0 text-[12px] leading-snug text-subtle">{help}</p>
                </div>
                <span
                  className={`text-right text-[24px] leading-none font-semibold tabular-nums @2xl:order-last ${total > 0 ? "text-error" : "text-subtle"}`}
                >
                  {formatTotal(total)}
                </span>
                <div className="col-span-2 @2xl:col-span-1">
                  <TrendLine label={label} days={stats.days} values={series} accent={total > 0 ? "text-error" : "text-subtle"} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProblemRow({ problem }: { problem: OverviewProblem }) {
  const { user, character } = problem;
  return (
    <li className="grid gap-x-6 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold">{OVERVIEW_PROBLEM_LABELS[problem.type]}</span>
        <span className="text-[14px]">{problemReasonText(problem.reason)}</span>
        <p className="m-0 flex flex-wrap gap-x-3 text-[13px] text-muted">
          <span>{user ? `@${user.handle ?? "no handle"}` : "Deleted account"}</span>
          {character && (
            <Link href={`/characters/${character.id}`} className="text-link">
              {character.title}
            </Link>
          )}
        </p>
      </div>
      <time
        dateTime={problem.createdAt}
        title={dateFormat.format(new Date(problem.createdAt))}
        className="text-[13px] whitespace-nowrap text-subtle tabular-nums sm:text-right"
      >
        {relativeTime(problem.createdAt)}
      </time>
    </li>
  );
}

const TOP_LIST_TITLES: Record<TopCharacterListName, string> = { chats: "Most new chats", likes: "Most new likes" };

interface TopListProps {
  list: TopCharacterListName;
  query: { data?: TopCharacterPage; isError: boolean };
  pager: Pager;
}

function TopList({ list, query, pager }: TopListProps) {
  const title = TOP_LIST_TITLES[list];
  const characters = query.data?.characters;
  // The rank goes on from the page before, and each bar compares with the first character of the period.
  const firstRank = (pager.page - 1) * TOP_PAGE_SIZE + 1;
  const max = Math.max(query.data?.maxCount ?? 0, 1);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="m-0 text-[14px] font-medium text-muted">{title}</h3>
      {query.isError && <p className="m-0 text-[13px] text-muted">The list did not load. Select Refresh to try again.</p>}
      {characters?.length === 0 && <p className="m-0 text-[13px] text-subtle">None in this period.</p>}
      {characters && characters.length > 0 && (
        <ol aria-label={title} className="m-0 flex list-none flex-col gap-3 p-0">
          {characters.map((character, index) => (
            <li key={character.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
              <span className="text-[13px] text-subtle tabular-nums">{firstRank + index}</span>
              <Link href={`/characters/${character.id}`} className="truncate text-link">
                {character.title}
              </Link>
              <span className="font-semibold tabular-nums">{character.count}</span>
              <span aria-hidden="true" className="col-start-2 col-end-4 h-1 rounded-full bg-surface-2">
                <span
                  data-bar
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.round((character.count / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
      <Pager label={`${title} pages`} pager={pager} nextCursor={query.data?.nextCursor} />
    </div>
  );
}
