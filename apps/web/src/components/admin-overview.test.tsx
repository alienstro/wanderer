import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  OVERVIEW_METRICS,
  type OverviewHealth,
  type OverviewMetric,
  type OverviewProblem,
  type OverviewSeries,
  type OverviewStats,
  type TopCharacterList,
} from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminOverview } from "./admin-overview";

const days = ["2026-10-23", "2026-10-24", "2026-10-25"];

function makeStats(values: Partial<Record<OverviewMetric, OverviewSeries>> = {}): OverviewStats {
  const empty = { total: 0, series: [0, 0, 0] };
  const metrics = Object.fromEntries(OVERVIEW_METRICS.map(({ key }) => [key, values[key] ?? empty]));
  return { period: "7d", days, metrics: metrics as OverviewStats["metrics"] };
}

const timeout: OverviewProblem = {
  id: "e1",
  type: "ai_reply_failed",
  reason: "timeout",
  createdAt: "2026-10-25T10:00:00.000Z",
  user: null,
  character: { id: "c1", title: "Mira" },
};

const top: TopCharacterList = { byChats: [{ id: "c1", title: "Mira", count: 4 }], byLikes: [] };

interface StubOptions {
  status?: number;
  healthStatus?: number;
  health?: OverviewHealth;
}

/** Answers each overview endpoint. `status` applies to all, `healthStatus` only to the health endpoint. */
function stubApi({ status = 200, healthStatus = status, health = { status: "ok", replies: 10, failedReplies: 0 } }: StubOptions = {}) {
  const stats = makeStats({ newUsers: { total: 12, series: [2, 4, 6] }, failedReplies: { total: 3, series: [0, 1, 2] } });
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url, "http://test").pathname;
    const code = path.endsWith("/health") ? healthStatus : status;
    if (code !== 200) {
      return Response.json({ error: code === 403 ? "forbidden" : "internal" }, { status: code });
    }
    const bodies: Record<string, unknown> = {
      "/admin/overview/stats": stats,
      "/admin/overview/problems": { problems: [timeout] },
      "/admin/overview/top-characters": top,
      "/admin/overview/health": health,
    };
    return Response.json(bodies[path.replace(/^.*(\/admin\/)/, "$1")]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminOverview />
    </QueryClientProvider>,
  );
}

describe("AdminOverview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows "This page is for the admin." on 403', async () => {
    stubApi({ status: 403 });
    renderView();
    expect(await screen.findByText("This page is for the admin.")).toBeTruthy();
    expect(screen.queryByText("Recent problems")).toBeNull();
  });

  it("shows the health, the totals and the help texts", async () => {
    stubApi();
    renderView();
    const card = await screen.findByRole("group", { name: "New users" });
    expect(within(card).getByText("12")).toBeTruthy();
    expect(within(card).getByText("People who made an account.")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Failed AI replies" })).getByText("3")).toBeTruthy();
    expect(await screen.findByText("OK")).toBeTruthy();
  });

  it('shows the problem reason in plain words and a "Deleted account" user', async () => {
    stubApi();
    renderView();
    const list = await screen.findByRole("list", { name: "Recent problems" });
    const row = await within(list).findByRole("listitem");
    expect(within(row).getByText("Failed AI reply")).toBeTruthy();
    expect(within(row).getByText("The proxy did not answer in time.")).toBeTruthy();
    expect(within(row).getByText("Deleted account")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Mira" }).getAttribute("href")).toBe("/characters/c1");
  });

  it("shows the top characters", async () => {
    stubApi();
    renderView();
    const list = await screen.findByRole("list", { name: "Most new chats" });
    expect(within(list).getByRole("link", { name: "Mira" }).getAttribute("href")).toBe("/characters/c1");
    expect(within(list).getByText("4")).toBeTruthy();
  });

  it("changes the period, and sends the time zone", async () => {
    const fetchMock = stubApi();
    renderView();
    await screen.findByRole("group", { name: "New users" });
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(screen.getByRole("button", { name: "30 days" }).getAttribute("aria-pressed")).toBe("true");
    const statsUrls = fetchMock.mock.calls.map(([url]) => url).filter((url) => url.includes("/admin/overview/stats"));
    expect(statsUrls.at(-1)).toContain("period=30d");
    expect(statsUrls.at(-1)).toMatch(/tz=[\w%]+/);
  });

  it("shows Down when the health request fails", async () => {
    stubApi({ healthStatus: 500 });
    renderView();
    expect(await screen.findByText("Down")).toBeTruthy();
  });

  it("shows Some problems from the health endpoint", async () => {
    stubApi({ health: { status: "some_problems", replies: 9, failedReplies: 1 } });
    renderView();
    expect(await screen.findByText("Some problems")).toBeTruthy();
  });
});
