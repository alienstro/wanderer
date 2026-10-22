import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { MyCharacterCard } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyCharactersPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/my-characters" }));

const me = { id: "u1", name: "Tian", email: "t@example.com", pictureUrl: null, handle: "tian", role: "user", showAdult: false, suggestedHandle: null };

function card(title: string, status: MyCharacterCard["status"], isPublic = true): MyCharacterCard {
  return { id: title, title, chatName: "", avatarUrl: null, isAdult: false, tags: [], chatCount: 0, creatorHandle: "tian", status, isPublic };
}

function renderWith(list: MyCharacterCard[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (url.endsWith("/me/characters") ? Response.json(list) : Response.json(me))),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MyCharactersPage />
    </QueryClientProvider>,
  );
}

describe("My characters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("each card shows its status label", async () => {
    renderWith([card("Alpha", "draft"), card("Bravo", "published", false), card("Charlie", "published"), card("Delta", "hidden")]);

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => [within(item).getByText(/^(Alpha|Bravo|Charlie|Delta)$/).textContent, within(item).getByText(/^(Draft|Private|Published|Hidden)$/).textContent])).toEqual([
      ["Alpha", "Draft"],
      ["Bravo", "Private"],
      ["Charlie", "Published"],
      ["Delta", "Hidden"],
    ]);
  });

  it('no characters shows "You have no characters yet." and a link to /create', async () => {
    renderWith([]);
    expect(await screen.findByText("You have no characters yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a character" })).toHaveAttribute("href", "/create");
  });
});
