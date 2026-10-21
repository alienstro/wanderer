import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  suggestedHandle: null,
};

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
    render(<SidebarNav />);
    expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute("href", "/create");
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

  it("a visitor sees a Log in link to /login and no user row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "unauthorized" }, { status: 401 })));
    renderWithClient(<UserRow />);

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
  });
});
