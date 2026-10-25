import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminReport } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminReports } from "@/features/admin/reports/admin-reports";

const minors: AdminReport = {
  id: "r1",
  reason: "minors",
  note: "The bio says 15.",
  createdAt: "2026-10-21T10:00:00.000Z",
  characterTitle: "Mira",
  character: { id: "c1", creatorId: "u2", creatorHandle: "tian", status: "published" },
  reporterHandle: "lee",
  target: "character",
  comment: null,
};

const gone: AdminReport = {
  id: "r2",
  reason: "copied",
  note: "",
  createdAt: "2026-10-21T11:00:00.000Z",
  characterTitle: "Old one",
  character: null,
  reporterHandle: null,
  target: "character",
  comment: null,
};

const rude: AdminReport = {
  id: "r3",
  reason: "hate",
  note: "",
  createdAt: "2026-10-21T12:00:00.000Z",
  characterTitle: "Mira",
  character: { id: "c1", creatorId: "u2", creatorHandle: "tian", status: "published" },
  reporterHandle: "lee",
  target: "comment",
  comment: { id: "m1", body: "You are all fools.", authorId: "u3", authorHandle: "troll", deleted: false },
};

/**
 * Answers the list with the reports, and each resolve with 200. With `pageSize`, the list has pages, and the
 * cursor is the number of the page, such as "2".
 */
function stubApi(reports: AdminReport[] = [minors, gone], listStatus = 200, pageSize = Number.POSITIVE_INFINITY) {
  let current = reports;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname, searchParams } = new URL(url, "http://test");
    if (pathname.endsWith("/admin/reports")) {
      if (listStatus !== 200) {
        return Response.json({ error: "forbidden" }, { status: listStatus });
      }
      const page = Number(searchParams.get("cursor") ?? "1");
      const start = page === 1 ? 0 : (page - 1) * pageSize;
      const nextCursor = start + pageSize < current.length ? String(page + 1) : null;
      return Response.json({ reports: current.slice(start, start + pageSize), nextCursor });
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

describe("AdminReports for a comment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the comment, its author, and only the comment actions", async () => {
    stubApi([rude]);
    renderView();
    const card = await screen.findByRole("article", { name: "Report about a comment on Mira" });
    expect(within(card).getByText("You are all fools.")).toBeInTheDocument();
    expect(within(card).getByText("Comment by @troll")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Hide" })).toBeNull();
    expect(within(card).queryByRole("button", { name: "Ban creator" })).toBeNull();
    expect(within(card).getByRole("button", { name: "Delete comment" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Ban author" })).toBeInTheDocument();
  });

  it("sends hidden for Delete comment, with no confirm", async () => {
    const fetchMock = stubApi([rude]);
    renderView();
    const card = await screen.findByRole("article", { name: "Report about a comment on Mira" });
    await userEvent.click(within(card).getByRole("button", { name: "Delete comment" }));
    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/admin/reports/r3/resolve"));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ action: "hidden" });
    });
  });

  it("asks before Ban author, then sends banned", async () => {
    const fetchMock = stubApi([rude]);
    renderView();
    const card = await screen.findByRole("article", { name: "Report about a comment on Mira" });
    await userEvent.click(within(card).getByRole("button", { name: "Ban author" }));
    await userEvent.click(within(card).getByRole("button", { name: "Yes, ban" }));
    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/admin/reports/r3/resolve"));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ action: "banned" });
    });
  });

  it("says when the comment is already deleted", async () => {
    stubApi([{ ...rude, comment: { ...rude.comment!, deleted: true } }]);
    renderView();
    const card = await screen.findByRole("article", { name: "Report about a comment on Mira" });
    expect(within(card).getByText("Comment by @troll · deleted")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Delete comment" })).toBeNull();
  });

  it("shows only Close when the comment is gone with its author", async () => {
    stubApi([{ ...rude, comment: null }]);
    renderView();
    const card = await screen.findByRole("article", { name: "Report about a comment on Mira" });
    expect(within(card).getByText("Comment deleted with the account of its author")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Close" })).toBeInTheDocument();
    for (const name of ["Hide", "Delete", "Ban creator", "Delete comment", "Ban author"]) {
      expect(within(card).queryByRole("button", { name })).toBeNull();
    }
  });

  it("Next shows page 2 of the reports", async () => {
    stubApi([minors, gone], 200, 1);
    renderView();
    await screen.findByRole("article", { name: "Report about Mira" });
    const pager = screen.getByRole("navigation", { name: "Reports pages" });
    await userEvent.click(within(pager).getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("article", { name: "Report about Old one" })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Report about Mira" })).toBeNull();
    expect(within(pager).getByText("Page 2")).toBeTruthy();
  });

  it("resolving the last report of page 2 goes back to page 1", async () => {
    stubApi([minors, gone], 200, 1);
    renderView();
    await userEvent.click(within(await screen.findByRole("navigation", { name: "Reports pages" })).getByRole("button", { name: "Next" }));
    const row = await screen.findByRole("article", { name: "Report about Old one" });
    await userEvent.click(within(row).getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("article", { name: "Report about Mira" })).toBeTruthy();
    expect(screen.queryByText("No open reports.")).toBeNull();
  });
});
