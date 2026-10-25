import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/** Answers /me with the user and /chats with the chat list. */
function stubApi(user: typeof me | null = me) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/me")) {
        return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return url.includes("/chats") ? Response.json(chats) : Response.json({ error: "not_found" }, { status: 404 });
    }),
  );
}

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("sidebar", () => {
  beforeEach(() => {
    replace.mockReset();
    pathname = "/";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
