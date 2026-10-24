"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  type TopCharacter,
  type TopCharacterList,
} from "@wanderer/shared";
import Link from "next/link";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { TrendLine } from "./trend-line";

const QUERY_KEY = "admin-overview";
const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const HEALTH_STYLE: Record<OverviewHealthStatus, string> = {
  ok: "bg-[rgba(34,197,94,0.18)] text-[#86efac]",
  some_problems: "bg-[rgba(245,194,107,0.18)] text-gold",
  down: "bg-[rgba(194,65,75,0.9)] text-white",
};

/** The time zone of the browser. A day of the overview starts at midnight in this zone. */
function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** The admin overview: the health, the use and the failures of the app. It shows no chat text. */
export function AdminOverview() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<OverviewPeriod>("7d");
  const search = `?${new URLSearchParams({ period, tz: timeZone() })}`;
  const load = <T,>(panel: string) => ({
    queryKey: [QUERY_KEY, panel, period],
    queryFn: () => apiFetch<T>(`/admin/overview/${panel}${search}`),
  });
  const stats = useQuery(load<OverviewStats>("stats"));
  const problems = useQuery(load<OverviewProblemList>("problems"));
  const top = useQuery(load<TopCharacterList>("top-characters"));
  const health = useQuery({ queryKey: [QUERY_KEY, "health"], queryFn: () => apiFetch<OverviewHealth>("/admin/overview/health") });

  if (stats.error instanceof ApiError && stats.error.status === 403) {
    return <p className="m-0 text-muted">This page is for the admin.</p>;
  }
  const refreshing = stats.isFetching || problems.isFetching || top.isFetching || health.isFetching;
  // A failed health request means that the API or its database does not answer, so the app is down.
  const status: OverviewHealthStatus | undefined = health.isError ? "down" : health.data?.status;

  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
          {OVERVIEW_PERIODS.map((value) => (
            <button key={value} type="button" className="chip" aria-pressed={value === period} onClick={() => setPeriod(value)}>
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

      <section aria-label="Health" className="flex flex-col gap-2 panel p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="m-0 text-base">Health</h2>
          {status && <span className={`tag ${HEALTH_STYLE[status]}`}>{OVERVIEW_HEALTH_LABELS[status]}</span>}
          {health.data && (
            <span className="text-[13px] text-subtle">
              {health.data.failedReplies} of {health.data.replies + health.data.failedReplies} AI replies failed in the last hour
            </span>
          )}
        </div>
        <p className="m-0 text-[13px] text-muted">
          OK: few AI replies failed in the last hour. Some problems: 10% or more failed. Down: half or more of 5 or more
          replies failed, or the API does not answer.
        </p>
      </section>

      {stats.isError && <p className="m-0 text-muted">The numbers did not load. Try again.</p>}
      {stats.data && (
        <>
          <MetricGrid title="How people use the app" kind="use" stats={stats.data} />
          <MetricGrid title="What fails" kind="failure" stats={stats.data} />
        </>
      )}

      <section aria-labelledby="problems-title" className="flex flex-col gap-3 panel p-5">
        <h2 id="problems-title" className="m-0 text-base">
          Recent problems
        </h2>
        <p className="m-0 text-[13px] text-muted">The newest 50 failures of the period. It shows no chat text, keys or URLs.</p>
        {problems.isError && <p className="m-0 text-muted">The problems did not load. Try again.</p>}
        {problems.data?.problems.length === 0 && <p className="m-0 text-muted">No problems in this period.</p>}
        {problems.data && problems.data.problems.length > 0 && (
          <ul aria-label="Recent problems" className="m-0 flex list-none flex-col gap-2 p-0">
            {problems.data.problems.map((problem) => (
              <ProblemRow key={problem.id} problem={problem} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="top-title" className="flex flex-col gap-3 panel p-5">
        <h2 id="top-title" className="m-0 text-base">
          Top characters
        </h2>
        <p className="m-0 text-[13px] text-muted">The characters with the most new chats and the most new likes in the period.</p>
        {top.isError && <p className="m-0 text-muted">The top characters did not load. Try again.</p>}
        {top.data && (
          <div className="grid gap-5 sm:grid-cols-2">
            <TopList title="Most new chats" characters={top.data.byChats} />
            <TopList title="Most new likes" characters={top.data.byLikes} />
          </div>
        )}
      </section>
    </div>
  );
}

function MetricGrid({ title, kind, stats }: { title: string; kind: "use" | "failure"; stats: OverviewStats }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-base">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {OVERVIEW_METRICS.filter((metric) => metric.kind === kind).map(({ key, label, help }) => {
          const { total, series } = stats.metrics[key];
          const failing = kind === "failure" && total > 0;
          return (
            <div key={key} role="group" aria-label={label} className="flex flex-col gap-1.5 panel p-4">
              <span className="text-[13px] text-muted">{label}</span>
              <span className={`text-2xl font-semibold ${failing ? "text-error" : ""}`}>{total}</span>
              <TrendLine values={series} className={failing ? "text-error" : "text-link"} />
              <p className="m-0 text-[12px] text-subtle">{help}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProblemRow({ problem }: { problem: OverviewProblem }) {
  const { user, character } = problem;
  return (
    <li className="flex flex-col gap-1 rounded-[12px] border border-line px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="font-semibold">{OVERVIEW_PROBLEM_LABELS[problem.type]}</span>
        <span className="text-[13px] text-subtle">{dateFormat.format(new Date(problem.createdAt))}</span>
      </div>
      <span>{problemReasonText(problem.reason)}</span>
      <p className="m-0 flex flex-wrap gap-x-2 text-[13px] text-muted">
        <span>{user ? `@${user.handle ?? "no handle"}` : "Deleted account"}</span>
        {character && (
          <Link href={`/characters/${character.id}`} className="text-link">
            {character.title}
          </Link>
        )}
      </p>
    </li>
  );
}

function TopList({ title, characters }: { title: string; characters: TopCharacter[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[14px] text-muted">{title}</h3>
      {characters.length === 0 ? (
        <p className="m-0 text-[13px] text-subtle">None in this period.</p>
      ) : (
        <ol aria-label={title} className="m-0 flex list-none flex-col gap-1.5 p-0">
          {characters.map((character) => (
            <li key={character.id} className="flex items-center justify-between gap-3">
              <Link href={`/characters/${character.id}`} className="truncate text-link">
                {character.title}
              </Link>
              <span className="font-semibold">{character.count}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
