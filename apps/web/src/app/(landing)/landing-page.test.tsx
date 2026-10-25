import type { CharacterCard } from "@wanderer/shared";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGNED_IN_HINT_COOKIE } from "@/lib/signed-in-hint";
import { LANDING_DEFINITION } from "@/features/landing";
import LandingPage from "./page";

const serverApiFetch = vi.fn();
const cookieNames = new Set<string>();

vi.mock("@/lib/server-api", () => ({ serverApiFetch: (path: string) => serverApiFetch(path) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => cookieNames.has(name) }) }));
// The real redirect throws, so the page stops there.
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("@/lib/query-provider", () => ({ useMe: () => ({ data: undefined }) }));

function card(n: number, isAdult = false): CharacterCard {
  return { id: `c${n}`, title: `Character ${n}`, chatName: "", avatarUrl: null, isAdult, tags: [], chatCount: n, likeCount: 0, creatorHandle: "tian" };
}

async function renderPage(searchParams: Record<string, string> = {}) {
  render((await LandingPage({ searchParams: Promise.resolve(searchParams) })) as ReactElement);
}

describe("the landing page", () => {
  beforeEach(() => {
    serverApiFetch.mockReset();
    cookieNames.clear();
  });

  it("shows the headline, the definition, the two CTAs, 18+, and the Terms and Privacy links", async () => {
    serverApiFetch.mockResolvedValue({ items: [], nextCursor: null });
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Talk with characters. Write the story together." })).toBeInTheDocument();
    expect(screen.getByText(LANDING_DEFINITION)).toBeInTheDocument();
    const hero = screen.getByRole("region", { name: "Talk with characters. Write the story together." });
    expect(within(hero).getByRole("link", { name: "Log in with Google" })).toHaveAttribute("href", "/login");
    expect(within(hero).getByRole("link", { name: "Browse characters" })).toHaveAttribute("href", "/discover");
    expect(screen.getAllByText(/18\+ only/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Terms of Service" })[0]).toHaveAttribute("href", "/terms");
    expect(screen.getAllByRole("link", { name: "Privacy Policy" })[0]).toHaveAttribute("href", "/privacy");
  });

  it("shows every section of the issue in order", async () => {
    serverApiFetch.mockResolvedValue({ items: [], nextCursor: null });
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["How it works", "Built for long stories", "Made for adults, with clear rules", "Questions", "Start your first story"]);
    const features = screen.getByRole("region", { name: "Built for long stories" });
    expect(within(features).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Make your own character",
      "Reply choices after each reply",
      "Your model, your key",
    ]);
  });

  it("the hero shows the public characters from the API and no 18+ character", async () => {
    serverApiFetch.mockResolvedValue({ items: [card(1), card(2, true), card(3)], nextCursor: null });
    await renderPage();

    expect(serverApiFetch).toHaveBeenCalledWith("/characters?sort=most_chats");
    const row = screen.getByRole("region", { name: "Popular characters" });
    expect(within(row).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/characters/c1", "/characters/c3"]);
  });

  it("still renders, with no character row, when the API fails", async () => {
    serverApiFetch.mockRejectedValue(new Error("down"));
    await renderPage();

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Popular characters" })).not.toBeInTheDocument();
  });

  it("sends a browser with the signed-in hint to /discover", async () => {
    cookieNames.add(SIGNED_IN_HINT_COOKIE);
    await expect(renderPage()).rejects.toThrow("redirect:/discover");
    expect(serverApiFetch).not.toHaveBeenCalled();
  });

  it("sends an old Discover link with filters on / to /discover with the same filters", async () => {
    await expect(renderPage({ tag: "noir", q: "mira" })).rejects.toThrow("redirect:/discover?q=mira&tag=noir");
  });
});
