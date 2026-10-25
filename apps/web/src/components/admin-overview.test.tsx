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
  type TopCharacterPage,
} from "@wanderer/shared";
import { act } from "react";
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

const secondProblem: OverviewProblem = {
  id: "e2",
  type: "proxy_test_failed",
  reason: "invalid_key",
  createdAt: "2026-10-24T10:00:00.000Z",
  user: { id: "u2", handle: "night_owl" },
  character: null,
};

/** The pages of each list. The key is the list and the cursor, such as "chats:" for page 1 or "problems:p2". */
const pages: Record<string, unknown> = {
  "problems:": { problems: [timeout], nextCursor: "p2" },
  "problems:p2": { problems: [secondProblem], nextCursor: null },
  "chats:": {
    characters: [
      { id: "c1", title: "Mira", count: 4 },
      { id: "c2", title: "Onnit", count: 1 },
    ],
    nextCursor: "t2",
    maxCount: 4,
  } satisfies TopCharacterPage,
  "chats:t2": { characters: [{ id: "c11", title: "Vale", count: 1 }], nextCursor: null, maxCount: 4 } satisfies TopCharacterPage,
  "likes:": { characters: [], nextCursor: null, maxCount: 0 } satisfies TopCharacterPage,
};

interface StubOptions {
  status?: number;
  healthStatus?: number;
  health?: OverviewHealth;
  metrics?: Partial<Record<OverviewMetric, OverviewSeries>>;
}

/** Answers each overview endpoint. `status` applies to all, `healthStatus` only to the health endpoint. */
function stubApi({
  status = 200,
  healthStatus = status,
  health = { status: "ok", replies: 10, failedReplies: 0, freeReplies: 0, freeModelBusy: 0 },
  metrics = {},
}: StubOptions = {}) {
  const stats = makeStats({
    newUsers: { total: 12, series: [2, 4, 6] },
    failedReplies: { total: 3, series: [0, 1, 2] },
    ...metrics,
  });
  const fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url, "http://test").pathname;
    const code = path.endsWith("/health") ? healthStatus : status;
    if (code !== 200) {
      return Response.json({ error: code === 403 ? "forbidden" : "internal" }, { status: code });
    }
    const { searchParams } = new URL(url, "http://test");
    const cursor = searchParams.get("cursor") ?? "";
    const bodies: Record<string, unknown> = {
      "/admin/overview/stats": stats,
      "/admin/overview/problems": pages[`problems:${cursor}`],
      "/admin/overview/top-characters": pages[`${searchParams.get("by")}:${cursor}`],
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
    vi.useRealTimers();
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
    stubApi({ health: { status: "some_problems", replies: 9, failedReplies: 1, freeReplies: 0, freeModelBusy: 0 } });
    renderView();
    expect(await screen.findByText("Some problems")).toBeTruthy();
  });

  it("shows totals below 10,000 in full and larger totals in short form", async () => {
    stubApi({ metrics: { newMessages: { total: 2614, series: [0, 0, 2614] }, logins: { total: 12_400, series: [0, 0, 12_400] } } });
    renderView();
    expect(within(await screen.findByRole("group", { name: "Messages sent" })).getByText("2,614")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Logins" })).getByText("12.4K")).toBeTruthy();
  });

  it("names each day of the trend line, and shows the day under the keyboard focus", async () => {
    stubApi();
    renderView();
    const card = await screen.findByRole("group", { name: "New users" });
    const trend = within(card).getByRole("img", { name: "New users each day: Oct 23: 2, Oct 24: 4, Oct 25: 6" });
    act(() => trend.focus());
    expect(within(card).getByText("Oct 25: 6")).toBeTruthy();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(card).getByText("Oct 24: 4")).toBeTruthy();
  });

  it("shows the time of a problem relative to now, with the full date on hover", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T10:12:00.000Z"));
    stubApi();
    renderView();
    const list = await screen.findByRole("list", { name: "Recent problems" });
    const time = within(list).getByText("12 minutes ago");
    expect(time.getAttribute("dateTime")).toBe("2026-10-25T10:00:00.000Z");
    expect(time.getAttribute("title")).toBeTruthy();
  });

  it("draws the bar of each top character against the first one", async () => {
    stubApi();
    renderView();
    const list = await screen.findByRole("list", { name: "Most new chats" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first?.querySelector<HTMLElement>("[data-bar]")?.style.width).toBe("100%");
    expect(second?.querySelector<HTMLElement>("[data-bar]")?.style.width).toBe("25%");
  });

  it("Next shows page 2 of the problems, and Previous goes back", async () => {
    const fetchMock = stubApi();
    renderView();
    const pager = await screen.findByRole("navigation", { name: "Recent problems pages" });
    await userEvent.click(within(pager).getByRole("button", { name: "Next" }));
    const list = await screen.findByRole("list", { name: "Recent problems" });
    expect(await within(list).findByText("@night_owl")).toBeTruthy();
    expect(within(pager).getByText("Page 2")).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => url).some((url) => url.includes("/problems") && url.includes("cursor=p2"))).toBe(true);
    await userEvent.click(within(pager).getByRole("button", { name: "Previous" }));
    expect(await within(list).findByText("Deleted account")).toBeTruthy();
    expect(within(pager).getByText("Page 1")).toBeTruthy();
  });

  it("the top characters rank continues on page 2, and the bar compares with the first one of the period", async () => {
    stubApi();
    renderView();
    const pager = await screen.findByRole("navigation", { name: "Most new chats pages" });
    await userEvent.click(within(pager).getByRole("button", { name: "Next" }));
    const list = screen.getByRole("list", { name: "Most new chats" });
    const row = await within(list).findByRole("listitem");
    await within(row).findByText("Vale");
    expect(within(row).getByText("11")).toBeTruthy();
    expect(row.querySelector<HTMLElement>("[data-bar]")?.style.width).toBe("25%");
  });

  it("a new period goes back to page 1", async () => {
    const fetchMock = stubApi();
    renderView();
    const pager = await screen.findByRole("navigation", { name: "Recent problems pages" });
    await userEvent.click(within(pager).getByRole("button", { name: "Next" }));
    expect(await within(pager).findByText("Page 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    // The pager shows again when page 1 of the new period has loaded.
    expect(await within(await screen.findByRole("navigation", { name: "Recent problems pages" })).findByText("Page 1")).toBeTruthy();
    const problemUrls = fetchMock.mock.calls.map(([url]) => url).filter((url) => url.includes("/problems"));
    expect(problemUrls.at(-1)).toContain("period=30d");
    expect(problemUrls.at(-1)).not.toContain("cursor=");
  });

  it("a new period does not show the numbers of the old period while it loads", async () => {
    const fetchMock = stubApi();
    const answer = fetchMock.getMockImplementation();
    renderView();
    await screen.findByRole("group", { name: "New users" });
    // The 30-day numbers do not come back, so the page stays in the loading state.
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("period=30d") ? new Promise<Response>(() => {}) : (answer?.(url) ?? Response.json({})),
    );
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(await screen.findByText("Loading the numbers…")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "New users" })).toBeNull();
  });
});
