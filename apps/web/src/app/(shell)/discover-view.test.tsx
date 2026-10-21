import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterCard, CharacterListResponse, TagSlug } from "@wanderer/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscoverView } from "./discover-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/" }));

function card(n: number): CharacterCard {
  return {
    id: `c${n}`,
    title: `Character ${n}`,
    chatName: "",
    avatarUrl: null,
    isAdult: false,
    tags: [],
    chatCount: 0,
    creatorHandle: "tian",
  };
}

/** A visitor: /me gives 401. Other calls give the next answer of the list. */
function stubFetch(lists: CharacterListResponse[] = []) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json(lists.shift() ?? { items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView(initial: CharacterListResponse, query: { q?: string; tag?: TagSlug; sort?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DiscoverView initial={initial} q={query.q ?? ""} tag={query.tag ?? null} sort={query.sort === "newest" ? "newest" : "most_chats"} />
    </QueryClientProvider>,
  );
}

describe("DiscoverView", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a click on the Noir chip puts tag=noir in the URL", async () => {
    stubFetch();
    renderView({ items: [card(1)], nextCursor: null });
    await userEvent.click(screen.getByRole("button", { name: "Noir" }));
    expect(replace).toHaveBeenCalledWith("/?tag=noir", { scroll: false });
  });

  it("a second click goes back to All", async () => {
    stubFetch();
    renderView({ items: [card(1)], nextCursor: null }, { tag: "noir" });
    expect(screen.getByRole("button", { name: "Noir" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Noir" }));
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("a search text puts q in the URL after a 300 ms pause", async () => {
    stubFetch();
    renderView({ items: [card(1)], nextCursor: null });
    await userEvent.type(screen.getByRole("searchbox", { name: "Search characters" }), "mira");
    expect(replace).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/?q=mira", { scroll: false }), { timeout: 1000 });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("a new q from outside, such as the Discover link, replaces the search text and does not put the old q back", async () => {
    stubFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (q: string) => (
      <QueryClientProvider client={client}>
        <DiscoverView initial={{ items: [card(1)], nextCursor: null }} q={q} tag={null} sort="most_chats" />
      </QueryClientProvider>
    );
    const { rerender } = render(view("noir"));
    expect(screen.getByRole("searchbox", { name: "Search characters" })).toHaveValue("noir");

    rerender(view(""));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(screen.getByRole("searchbox", { name: "Search characters" })).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });

  it("a late server answer for an earlier search does not overwrite the text that the user still types", async () => {
    stubFetch();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (q: string) => (
      <QueryClientProvider client={client}>
        <DiscoverView initial={{ items: [card(1)], nextCursor: null }} q={q} tag={null} sort="most_chats" />
      </QueryClientProvider>
    );
    const { rerender } = render(view(""));
    const box = screen.getByRole("searchbox", { name: "Search characters" });
    await userEvent.type(box, "ab");
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/?q=ab", { scroll: false }), { timeout: 1000 });
    await userEvent.type(box, "c");
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/?q=abc", { scroll: false }), { timeout: 1000 });

    rerender(view("ab"));
    expect(box).toHaveValue("abc");
    rerender(view("abc"));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(box).toHaveValue("abc");
    expect(replace).toHaveBeenCalledTimes(2);
  });

  it("a failed list fetch for a logged-in user shows an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/me")
          ? Response.json({ id: "u1", name: "Tian", email: "t@e.com", pictureUrl: null, handle: "tian", role: "user", showAdult: false, suggestedHandle: null })
          : Response.json({ error: "server_error" }, { status: 500 }),
      ),
    );
    renderView({ items: [card(1)], nextCursor: null });
    expect(await screen.findByText("The characters did not load. Reload the page to try again.")).toBeInTheDocument();
    expect(screen.queryByText("Character 1")).not.toBeInTheDocument();
  });

  it("Load more asks for the next cursor and adds the cards", async () => {
    const fetchMock = stubFetch([{ items: [card(2)], nextCursor: null }]);
    renderView({ items: [card(1)], nextCursor: "cursor-1" });

    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Character 2")).toBeInTheDocument();
    expect(screen.getByText("Character 1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("cursor=cursor-1"), expect.anything());
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it('an empty list shows "No characters match your search."', () => {
    stubFetch();
    renderView({ items: [], nextCursor: null }, { q: "zzz" });
    expect(screen.getByText("No characters match your search.")).toBeInTheDocument();
  });
});
