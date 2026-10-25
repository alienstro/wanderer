import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EnergyView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelCard } from "./model-card";
import { RecentChats } from "./recent-chats";
import { SidebarDrawer } from "./sidebar-drawer";
import { SidebarNav } from "./sidebar-nav";
import { UserRow } from "./user-row";

const replace = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));

const me = {
  id: "u1",
  name: "Tian",
  email: "tian@example.com",
  pictureUrl: null,
  handle: "tian",
  role: "user",
  showAdult: false,
  replyChoicesOn: true,
  activeProxy: { id: "p1", name: "OpenRouter", model: "deepseek/deepseek-chat" } as { id: string; name: string; model: string } | null,
  suggestedHandle: null,
};

const chats = {
  items: [
    {
      id: "chat1",
      title: "Onnit",
      character: { id: "c1", title: "Onnit", chatName: "", avatarUrl: null },
      lastMessage: "*waves*",
      lastMessageAt: "2026-10-21T10:00:00.000Z",
      messageCount: 1,
    },
  ],
};

/** 00:00 UTC is 8:00 AM in Manila. The tests set TZ to Asia/Manila. */
const REFILL = "2026-10-26T00:00:00.000Z";

const ownEnergy: EnergyView = {
  balance: 40,
  dailyEnergy: 50,
  nextRefillAt: REFILL,
  model: "own",
  freeModelName: null,
  prices: { reply: 0, choices: 0, memory: 0, scene: 5 },
};

const freeEnergy: EnergyView = {
  ...ownEnergy,
  balance: 12,
  model: "free",
  freeModelName: "Gemma",
  prices: { reply: 2, choices: 0.5, memory: 1, scene: 5 },
};

/** Answers /me with the user, /energy with the energy (or a 500 for null), and /chats with the chat list. */
function stubApi(user: typeof me | null = me, energy: EnergyView | null = ownEnergy) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) {
      return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (url.endsWith("/energy")) {
      return energy ? Response.json(energy) : Response.json({ error: "internal" }, { status: 500 });
    }
    return url.includes("/chats") ? Response.json(chats) : Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("sidebar", () => {
  beforeEach(() => {
    replace.mockReset();
    pathname = "/";
    vi.stubEnv("TZ", "Asia/Manila");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("the sidebar shows Create, Discover, and My characters, and marks the current page", () => {
    pathname = "/my-characters";
    stubApi(null);
    renderWithClient(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(screen.getByRole("link", { name: "Discover" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "My characters" })).toHaveAttribute("aria-current", "page");
  });

  it("a logged-in user sees their @handle, and Log out calls POST /auth/logout and goes to /login", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/auth/logout") && init?.method === "POST" ? new Response(null, { status: 204 }) : Response.json(me),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<UserRow />);

    expect(await screen.findByText("@tian")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Account menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/auth\/logout$/), expect.objectContaining({ method: "POST" }));
  });

  it("the account menu links to Settings, and shows Admin only to the admin", async () => {
    stubApi();
    renderWithClient(<UserRow />);
    await userEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("menuitem", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("the account menu shows Admin with a link to /admin to the admin", async () => {
    stubApi({ ...me, role: "admin" });
    renderWithClient(<UserRow />);
    await userEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menuitem", { name: "Admin" })).toHaveAttribute("href", "/admin");
  });

  it("Escape in the account menu closes only the menu, and the phone drawer stays open", async () => {
    stubApi();
    renderWithClient(
      <SidebarDrawer>
        <UserRow />
      </SidebarDrawer>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await userEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary")).toHaveAttribute("data-open", "true");
  });

  it("a visitor sees a Log in link to /login and no user row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 })));
    renderWithClient(<UserRow />);

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });

  it("Recent lists the chats with links to /chats/<id>", async () => {
    stubApi();
    renderWithClient(<RecentChats />);
    expect(await screen.findByRole("link", { name: /Onnit/ })).toHaveAttribute("href", "/chats/chat1");
    expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
  });

  it("Recent shows one row for each character, which opens the newest chat with that character", async () => {
    const chat = (id: string, characterId: string, title: string) => ({
      id,
      title,
      character: { id: characterId, title, chatName: "", avatarUrl: null },
      lastMessage: "Hi",
      lastMessageAt: "2026-10-25T10:00:00.000Z",
      messageCount: 2,
    });
    const newest = chat("chat3", "c2", "Isekai RPG");
    const onnit = chat("chat1", "c1", "Onnit");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/me")) {
          return Response.json(me);
        }
        const items = url.includes("latestPerCharacter=true")
          ? [newest, onnit]
          : [newest, chat("chat2", "c2", "Isekai RPG"), onnit];
        return Response.json({ items });
      }),
    );
    renderWithClient(<RecentChats />);
    expect(await screen.findByRole("link", { name: /Onnit/ })).toBeInTheDocument();
    const rows = screen.getAllByRole("link", { name: /Isekai RPG/ });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/chats/chat3");
  });

  it("the model card shows the active proxy name and model, and For you shows for a user", async () => {
    stubApi();
    renderWithClient(
      <>
        <SidebarNav />
        <ModelCard />
      </>,
    );
    const card = await screen.findByRole("link", { name: /OpenRouter/ });
    expect(card).toHaveAttribute("href", "/settings/models");
    expect(card).toHaveTextContent("deepseek/deepseek-chat");
    expect(screen.getByRole("link", { name: "For you" })).toHaveAttribute("href", "/discover#for-you");
  });

  it('the model card shows "Add a model" when activeProxy is null', async () => {
    stubApi({ ...me, activeProxy: null });
    renderWithClient(<ModelCard />);
    expect(await screen.findByRole("link", { name: /Add a model/ })).toHaveAttribute("href", "/settings/models");
  });

  it("a user on a free model sees the model name, the energy, a bar, and the refill time in local time", async () => {
    stubApi({ ...me, activeProxy: null }, freeEnergy);
    renderWithClient(<ModelCard />);
    const card = await screen.findByRole("link", { name: /Free · Gemma/ });
    expect(card).toHaveAttribute("href", "/settings/models");
    expect(card).toHaveTextContent("Energy12 / 50");
    expect(card).toHaveTextContent("Refills at 8:00 AM");
    expect(card).not.toHaveTextContent("Add a model");
    expect(screen.getByRole("meter", { name: "Energy" }).style.width).toBe("24%");
  });

  it('a user with an own API key sees the proxy and "Energy for scenes"', async () => {
    stubApi(me, ownEnergy);
    renderWithClient(<ModelCard />);
    const card = await screen.findByRole("link", { name: /OpenRouter.*Energy for scenes/ });
    expect(card).toHaveTextContent("40 / 50");
  });

  it("a balance above the daily amount fills the bar to 100%", async () => {
    stubApi(me, { ...ownEnergy, balance: 80 });
    renderWithClient(<ModelCard />);
    expect((await screen.findByRole("meter", { name: "Energy" })).style.width).toBe("100%");
  });

  it("the rail shows the energy with the full text on hover and on focus", async () => {
    stubApi({ ...me, activeProxy: null }, freeEnergy);
    renderWithClient(<ModelCard />);
    expect(await screen.findByRole("link", { name: "Energy 12 / 50. Refills at 8:00 AM." })).toHaveAttribute(
      "href",
      "/settings/models",
    );
  });

  it("when GET /energy fails, the card shows the model and no energy", async () => {
    const fetchMock = stubApi(me, null);
    renderWithClient(<ModelCard />);
    const card = await screen.findByRole("link", { name: /OpenRouter/ });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/energy"))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(card).not.toHaveTextContent("Energy");
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
  });

  it("a visitor sees no For you, no Recent, and no model card", async () => {
    stubApi(null);
    renderWithClient(
      <>
        <SidebarNav />
        <RecentChats />
        <ModelCard />
        <UserRow />
      </>,
    );
    await screen.findByRole("link", { name: "Log in" });
    expect(screen.queryByRole("link", { name: "For you" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Add a model/ })).not.toBeInTheDocument();
  });
});
