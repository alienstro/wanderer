import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterCard, MyCharacterCard } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyCharactersView } from "./my-characters-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), usePathname: () => "/my-characters" }));

const me = { id: "u1", name: "Tian", email: "t@example.com", pictureUrl: null, handle: "tian", role: "user", showAdult: false, suggestedHandle: null };

function card(title: string, status: MyCharacterCard["status"], isPublic = true): MyCharacterCard {
  return { id: title, title, chatName: "", avatarUrl: null, isAdult: false, tags: [], chatCount: 0, likeCount: 0, creatorHandle: "tian", bioPreview: "", status, isPublic };
}

function renderWith(list: MyCharacterCard[], liked: CharacterCard[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/me/characters/liked")) {
        return Response.json({ items: liked });
      }
      return url.endsWith("/me/characters") ? Response.json(list) : Response.json(me);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MyCharactersView />
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

  it("the Liked tab shows the characters that you like, with their count in the tab", async () => {
    renderWith([card("Alpha", "draft")], [{ ...card("Ilse", "published"), creatorHandle: "mira" }]);
    const likedTab = await screen.findByRole("tab", { name: /Liked/ });
    await waitFor(() => expect(likedTab).toHaveTextContent("Liked1"));
    await userEvent.click(likedTab);
    expect(likedTab).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: /^Liked/ });
    expect(within(panel).getByText("Ilse")).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: /^Created/ })).not.toBeInTheDocument();
  });

  it('no characters shows "You have no characters yet." and a link to /create', async () => {
    renderWith([]);
    expect(await screen.findByText("You have no characters yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a character" })).toHaveAttribute("href", "/create");
  });
});
