import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminEnergyEntry, AdminUserEnergy } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminUserEnergyList } from "./admin-user-energy";

const mira: AdminUserEnergy = {
  id: "u2",
  name: "Mira",
  handle: "mira",
  email: "mira@example.test",
  role: "user",
  balance: 12.5,
  dailyEnergy: 20,
  ownDailyEnergy: null,
};

const oren: AdminUserEnergy = { ...mira, id: "u3", name: "Oren", handle: "oren", email: "oren@example.test", balance: 50, dailyEnergy: 50, ownDailyEnergy: 50 };

const history: AdminEnergyEntry[] = [
  { id: "e2", amount: 10, reason: "admin", createdAt: "2026-10-25T09:00:00.000Z" },
  { id: "e1", amount: 20, reason: "refill", createdAt: "2026-10-25T08:00:00.000Z" },
];

type Answer = { status?: number; body?: unknown };

/** Answers the list and the history. A test sets the answer of each write by "METHOD path". */
function stubApi(answers: Record<string, Answer> = {}, listStatus = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url, "http://test");
    const method = init?.method ?? "GET";
    if (method === "GET" && pathname.endsWith("/admin/energy/users")) {
      if (listStatus !== 200) {
        return Response.json({ error: "forbidden" }, { status: listStatus });
      }
      const q = searchParams.get("q") ?? "";
      const page = Number(searchParams.get("page") ?? "1");
      const users = [mira, oren].filter((user) => user.handle?.includes(q));
      return Response.json({ users: page === 1 ? users : [], page, pageCount: 3, total: 25 });
    }
    if (method === "GET" && pathname.endsWith("/history")) {
      return Response.json(history);
    }
    const answer = answers[`${method} ${pathname}`] ?? {};
    return Response.json(answer.body ?? mira, { status: answer.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function writes(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET") !== "GET")
    .map(([url, init]) => ({ call: `${init?.method} ${new URL(url, "http://test").pathname}`, body: JSON.parse(String(init?.body)) as unknown }));
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminUserEnergyList />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.findByRole("row", { name: new RegExp(name) });

async function openManage(name: string) {
  await userEvent.click(within(await row(name)).getByRole("button", { name: "Manage" }));
  return screen.getByRole("region", { name: `Energy of ${name}` });
}

describe("AdminUserEnergyList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a user who is not an admin sees a short message", async () => {
    stubApi({}, 403);
    renderView();
    expect(await screen.findByText("This page is for the admin.")).toBeTruthy();
  });

  it("shows each user with the balance, the daily amount and where the daily amount comes from", async () => {
    stubApi();
    renderView();
    const first = await row("Mira");
    expect(within(first).getByText("@mira")).toBeTruthy();
    expect(within(first).getByText("12.5")).toBeTruthy();
    expect(within(first).getByText("20")).toBeTruthy();
    expect(within(first).getByText("global")).toBeTruthy();
    expect(within(await row("Oren")).getByText("own")).toBeTruthy();
  });

  it("Search sends the text and shows only the users that match", async () => {
    const fetchMock = stubApi();
    renderView();
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search users" }), "oren");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("q=oren"))).toBe(true);
    expect(await row("Oren")).toBeTruthy();
    expect(screen.queryByRole("row", { name: /Mira/ })).toBeNull();
  });

  it("the page numbers open another page of users", async () => {
    const fetchMock = stubApi();
    renderView();
    await row("Mira");
    await userEvent.click(screen.getByRole("button", { name: "Page 2" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
    expect((await screen.findByRole("button", { name: "Page 2" })).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("25 users")).toBeTruthy();
  });

  it("Add, Take away and Set balance send the amount, and a take-away below 0 explains the problem", async () => {
    const fetchMock = stubApi({ "POST /admin/energy/users/u2/adjust": { body: mira } });
    renderView();
    const panel = await openManage("Mira");
    const amount = within(panel).getByLabelText(/Amount/);
    await userEvent.type(amount, "10");
    await userEvent.click(within(panel).getByRole("button", { name: "Add" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Take away" }));
    await userEvent.click(within(panel).getByRole("button", { name: "Set balance" }));
    expect(writes(fetchMock)).toEqual([
      { call: "POST /admin/energy/users/u2/adjust", body: { mode: "add", amount: 10 } },
      { call: "POST /admin/energy/users/u2/adjust", body: { mode: "add", amount: -10 } },
      { call: "POST /admin/energy/users/u2/adjust", body: { mode: "set", amount: 10 } },
    ]);
  });

  it("a take-away below 0 shows what went wrong", async () => {
    stubApi({ "POST /admin/energy/users/u2/adjust": { status: 400, body: { error: "energy_below_zero" } } });
    renderView();
    const panel = await openManage("Mira");
    await userEvent.type(within(panel).getByLabelText(/Amount/), "99");
    await userEvent.click(within(panel).getByRole("button", { name: "Take away" }));
    expect(await within(panel).findByText(/below 0/)).toBeTruthy();
  });

  it("the own daily amount saves a number, and an empty field uses the global amount again", async () => {
    const fetchMock = stubApi({ "PUT /admin/energy/users/u3/daily": { body: oren } });
    renderView();
    const panel = await openManage("Oren");
    const daily = within(panel).getByLabelText(/Own daily amount/);
    expect((daily as HTMLInputElement).value).toBe("50");
    await userEvent.clear(daily);
    await userEvent.click(within(panel).getByRole("button", { name: "Save daily amount" }));
    await userEvent.type(daily, "75.5");
    await userEvent.click(within(panel).getByRole("button", { name: "Save daily amount" }));
    expect(writes(fetchMock)).toEqual([
      { call: "PUT /admin/energy/users/u3/daily", body: { dailyEnergy: null } },
      { call: "PUT /admin/energy/users/u3/daily", body: { dailyEnergy: 75.5 } },
    ]);
  });

  it("the history shows each change of the balance with its reason, the newest first", async () => {
    stubApi();
    renderView();
    const panel = await openManage("Mira");
    const items = await within(panel).findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([expect.stringMatching(/Admin change.*\+10/), expect.stringMatching(/Daily refill.*\+20/)]);
  });
});
