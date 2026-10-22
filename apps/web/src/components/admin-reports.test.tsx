import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminReport } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminReports } from "./admin-reports";

const minors: AdminReport = {
  id: "r1",
  reason: "minors",
  note: "The bio says 15.",
  createdAt: "2026-10-21T10:00:00.000Z",
  characterTitle: "Mira",
  character: { id: "c1", creatorId: "u2", creatorHandle: "tian", status: "published" },
  reporterHandle: "lee",
};

const gone: AdminReport = {
  id: "r2",
  reason: "copied",
  note: "",
  createdAt: "2026-10-21T11:00:00.000Z",
  characterTitle: "Old one",
  character: null,
  reporterHandle: null,
};

/** Answers the list with the reports, and each resolve with 200. */
function stubApi(reports: AdminReport[] = [minors, gone], listStatus = 200) {
  let current = reports;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/admin/reports")) {
      return listStatus === 200 ? Response.json({ reports: current }) : Response.json({ error: "forbidden" }, { status: listStatus });
    }
    const id = /\/admin\/reports\/(\w+)\/resolve$/.exec(url)?.[1];
    current = current.filter((report) => report.id !== id);
    return Response.json({ ...reports[0], id, method: init?.method });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminReports />
    </QueryClientProvider>,
  );
}

function resolveCalls(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([url]) => url.endsWith("/resolve"))
    .map(([url, init]) => ({ url, body: JSON.parse(String(init?.body)) as unknown }));
}

describe("AdminReports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the reason, the note, the character link, the creator, the reporter, and a Minors badge", async () => {
    stubApi();
    renderView();
    const row = await screen.findByRole("article", { name: "Report about Mira" });
    expect(within(row).getByText("Sexual content with minors")).toBeTruthy();
    expect(within(row).getByText("Minors")).toBeTruthy();
    expect(within(row).getByText("The bio says 15.")).toBeTruthy();
    expect(within(row).getByRole("link", { name: "Mira" }).getAttribute("href")).toBe("/characters/c1");
    expect(within(row).getByText(/@tian/)).toBeTruthy();
    expect(within(row).getByText(/@lee/)).toBeTruthy();
  });

  it("a report about a deleted character shows Character deleted and Deleted account, and only Close", async () => {
    stubApi();
    renderView();
    const row = await screen.findByRole("article", { name: "Report about Old one" });
    expect(within(row).getByText("Character deleted")).toBeTruthy();
    expect(within(row).getByText(/Deleted account/)).toBeTruthy();
    expect(within(row).queryByText("Minors")).toBeNull();
    expect(within(row).getByRole("button", { name: "Close" })).toBeTruthy();
    for (const name of ["Hide", "Delete", "Ban creator"]) {
      expect(within(row).queryByRole("button", { name })).toBeNull();
    }
  });

  it("Close and Hide send the action at once, and the row goes from the list", async () => {
    const fetchMock = stubApi();
    renderView();
    const row = await screen.findByRole("article", { name: "Report about Mira" });
    await userEvent.click(within(row).getByRole("button", { name: "Hide" }));
    expect(resolveCalls(fetchMock)).toEqual([{ url: "/admin/reports/r1/resolve", body: { action: "hidden" } }]);
    await vi.waitFor(() => expect(screen.queryByRole("article", { name: "Report about Mira" })).toBeNull());
  });

  it("Delete and Ban creator ask Are you sure first, in the page", async () => {
    const fetchMock = stubApi();
    renderView();
    const row = await screen.findByRole("article", { name: "Report about Mira" });
    await userEvent.click(within(row).getByRole("button", { name: "Ban creator" }));
    expect(resolveCalls(fetchMock)).toEqual([]);
    expect(within(row).getByText("Are you sure?")).toBeTruthy();
    await userEvent.click(within(row).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(row).getByRole("button", { name: "Yes, delete" }));
    expect(resolveCalls(fetchMock)).toEqual([{ url: "/admin/reports/r1/resolve", body: { action: "deleted" } }]);
  });

  it("shows This page is for the admin. for a 403", async () => {
    stubApi([], 403);
    renderView();
    expect(await screen.findByText("This page is for the admin.")).toBeTruthy();
  });

  it("shows No open reports. for an empty list", async () => {
    stubApi([]);
    renderView();
    expect(await screen.findByText("No open reports.")).toBeTruthy();
  });
});
