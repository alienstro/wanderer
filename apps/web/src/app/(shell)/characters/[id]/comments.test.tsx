import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CharacterComment, CommentListResponse } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterComments } from "./comments";

const me = { id: "u1", name: "Tian", handle: "tian", activeProxy: null, replyChoicesOn: true };

function comment(overrides: Partial<CharacterComment> = {}): CharacterComment {
  return {
    id: "m1",
    body: "Great scenario!",
    createdAt: "2026-10-21T10:00:00.000Z",
    authorHandle: "mira_fan",
    isOwn: false,
    canDelete: false,
    ...overrides,
  };
}

interface StubOptions {
  user?: typeof me | null;
  pages?: CommentListResponse[];
  post?: { status: number; body: unknown };
}

function stubApi({ user = me, pages = [{ items: [comment()], nextCursor: null, count: 1 }], post }: StubOptions = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/me")) {
      return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (init?.method === "POST") {
      return Response.json(post?.body ?? comment({ id: "new", isOwn: true, canDelete: true }), { status: post?.status ?? 201 });
    }
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    const page = url.includes("cursor=") ? pages[1] : pages[0];
    return Response.json(page);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const calls = (fetchMock: ReturnType<typeof stubApi>, method: string) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === method);

describe("CharacterComments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the count, the handle, the date, and the body", async () => {
    stubApi();
    withClient(<CharacterComments characterId="c1" />);
    expect(await screen.findByText("Great scenario!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comments 1" })).toBeInTheDocument();
    expect(screen.getByText("@mira_fan")).toBeInTheDocument();
    expect(screen.getByText("Oct 21, 2026")).toBeInTheDocument();
  });

  it("shows markup in a comment as plain text", async () => {
    const body = "<script>alert(1)</script>";
    stubApi({ pages: [{ items: [comment({ body })], nextCursor: null, count: 1 }] });
    const { container } = withClient(<CharacterComments characterId="c1" />);
    expect(await screen.findByText(body)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("asks a visitor to log in, and shows no box and no Report button", async () => {
    stubApi({ user: null });
    withClient(<CharacterComments characterId="c1" />);
    expect(await screen.findByText("Great scenario!")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
  });

  it("posts the comment, clears the box, and loads the list again", async () => {
    const fetchMock = stubApi();
    withClient(<CharacterComments characterId="c1" />);
    const box = await screen.findByRole("textbox", { name: "Leave a comment or feedback for the creator" });
    await userEvent.type(box, "Great scenario!");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    const [url, init] = calls(fetchMock, "POST")[0] ?? [];
    expect(url).toBe("/characters/c1/comments");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "Great scenario!" });
    await vi.waitFor(() => expect(box).toHaveValue(""));
    const reads = fetchMock.mock.calls.filter(([url, init]) => url.includes("/comments") && !init?.method);
    expect(reads.length).toBeGreaterThan(1);
  });

  it("keeps the text and shows a message for 429", async () => {
    stubApi({ post: { status: 429, body: { statusCode: 429, message: "ThrottlerException: Too Many Requests" } } });
    withClient(<CharacterComments characterId="c1" />);
    const box = await screen.findByRole("textbox", { name: "Leave a comment or feedback for the creator" });
    await userEvent.type(box, "Sixth one");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You post too fast. Wait a minute and try again.");
    expect(box).toHaveValue("Sixth one");
  });

  it("keeps the text and shows a message for 400", async () => {
    stubApi({ post: { status: 400, body: { error: "invalid_request" } } });
    withClient(<CharacterComments characterId="c1" />);
    const box = await screen.findByRole("textbox", { name: "Leave a comment or feedback for the creator" });
    await userEvent.type(box, "Too long");
    await userEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The comment was not posted. It can have 1 to 1,000 characters.");
    expect(box).toHaveValue("Too long");
  });

  it("stops the box at 1,000 characters and counts them", async () => {
    stubApi();
    withClient(<CharacterComments characterId="c1" />);
    const box = await screen.findByRole("textbox", { name: "Leave a comment or feedback for the creator" });
    expect(box).toHaveAttribute("maxlength", "1000");
    expect(screen.getByText("0 / 1000")).toBeInTheDocument();
  });

  it("deletes a comment after the confirm when the viewer can delete it", async () => {
    const fetchMock = stubApi({ pages: [{ items: [comment({ isOwn: true, canDelete: true })], nextCursor: null, count: 1 }] });
    withClient(<CharacterComments characterId="c1" />);
    const item = (await screen.findByText("Great scenario!")).closest("li")!;
    expect(within(item).queryByRole("button", { name: "Report" })).toBeNull();
    await userEvent.click(within(item).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(item).getByRole("button", { name: "Yes, delete" }));
    await vi.waitFor(() => expect(calls(fetchMock, "DELETE")[0]?.[0]).toBe("/comments/m1"));
  });

  it("shows Report and no Delete on the comment of another user", async () => {
    stubApi();
    withClient(<CharacterComments characterId="c1" />);
    const item = (await screen.findByText("Great scenario!")).closest("li")!;
    expect(await within(item).findByRole("button", { name: "Report" })).toBeInTheDocument();
    expect(within(item).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("loads the next page with the cursor", async () => {
    const first = Array.from({ length: 20 }, (_, n) => comment({ id: `a${n}`, body: `Comment ${n}` }));
    const fetchMock = stubApi({
      pages: [
        { items: first, nextCursor: "next-key", count: 21 },
        { items: [comment({ id: "last", body: "The oldest one" })], nextCursor: null, count: 21 },
      ],
    });
    withClient(<CharacterComments characterId="c1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Load more comments" }));
    expect(await screen.findByText("The oldest one")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/characters/c1/comments?cursor=next-key")).toBe(true);
  });
});
