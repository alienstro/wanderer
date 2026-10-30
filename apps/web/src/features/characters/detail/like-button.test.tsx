import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LikeButton } from "./like-button";

const me = { id: "u1", name: "Tian", handle: "tian", activeProxy: null, replyChoicesOn: true };

/** The like request waits until the test calls `finish`, so the test can see the state before the answer. */
function stubApi({ user = me, fail = false }: { user?: typeof me | null; fail?: boolean } = {}) {
  let finish = () => {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) {
      return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
    }
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    if (fail) {
      return Response.json({ error: "server_error" }, { status: 500 });
    }
    return Response.json(init?.method === "PUT" ? { likeCount: 4, likedByMe: true } : { likeCount: 3, likedByMe: false });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, finish: () => finish() };
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("the like button", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a tap fills the heart and adds one before the answer comes", async () => {
    const api = stubApi();
    withClient(<LikeButton characterId="c1" likeCount={3} likedByMe={false} isOwner={false} />);

    const button = await screen.findByRole("button", { name: /like/i });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("4 likes");
    const call = api.fetchMock.mock.calls.find(([url]) => String(url).endsWith("/characters/c1/like"));
    expect(call?.[1]?.method).toBe("PUT");
    api.finish();
    await vi.waitFor(() => expect(button).toHaveAttribute("aria-busy", "false"));
    expect(button).toHaveTextContent("4 likes");
  });

  it("a second tap removes the like", async () => {
    const api = stubApi();
    withClient(<LikeButton characterId="c1" likeCount={4} likedByMe={true} isOwner={false} />);

    const button = await screen.findByRole("button", { name: /like/i });
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("3 likes");
    const call = api.fetchMock.mock.calls.find(([url]) => String(url).endsWith("/characters/c1/like"));
    expect(call?.[1]?.method).toBe("DELETE");
    api.finish();
  });

  it("a tap while the request runs does nothing", async () => {
    const api = stubApi();
    withClient(<LikeButton characterId="c1" likeCount={3} likedByMe={false} isOwner={false} />);

    const button = await screen.findByRole("button", { name: /like/i });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(api.fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/like"))).toHaveLength(1);
    api.finish();
  });

  it("an error puts the heart and the count back", async () => {
    const api = stubApi({ fail: true });
    withClient(<LikeButton characterId="c1" likeCount={3} likedByMe={false} isOwner={false} />);

    const button = await screen.findByRole("button", { name: /like/i });
    await userEvent.click(button);
    api.finish();

    await vi.waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(button).toHaveTextContent("3 likes");
  });

  it("a visitor gets a link to /login with the count", async () => {
    stubApi({ user: null });
    withClient(<LikeButton characterId="c1" likeCount={1} likedByMe={false} isOwner={false} />);

    const link = await screen.findByRole("link", { name: /like/i });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveTextContent("1 like");
  });

  it("the owner sees no like control, because the Likes count above already shows the number", () => {
    stubApi();
    const { container } = withClient(<LikeButton characterId="c1" likeCount={2} likedByMe={false} isOwner={true} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("while the user loads, the count has the pill shape, so the row does not move", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    withClient(<LikeButton characterId="c1" likeCount={3} likedByMe={false} isOwner={false} />);

    expect(screen.getByText("3 likes")).toHaveClass("pill");
  });
});
