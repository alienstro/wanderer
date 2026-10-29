import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeResponse } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./settings-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const me: MeResponse = {
  id: "u1",
  name: "Tian",
  email: "tian@example.com",
  pictureUrl: null,
  handle: "tian",
  role: "user",
  showAdult: false,
  replyChoicesOn: true,
  replyChoicesPrompt: "",
  activeProxy: null,
  suggestedHandle: null,
};

/** The lists that the Model and Personas boxes load for themselves. They answer an empty list. */
const LIST_URLS = ["/personas", "/proxies", "/free-models"];

/** Answers each call with the status and body, and keeps the calls. The box lists answer an empty list. */
function stubFetch(status = 200, body: unknown = me) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (LIST_URLS.includes(url)) {
      return Response.json([]);
    }
    return status === 204 ? new Response(null, { status }) : Response.json(body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The calls of the profile forms. The Model and Personas boxes load their own lists, so those calls are left out. */
function meCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([url]) => !LIST_URLS.includes(url));
}

function lastCall(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = meCalls(fetchMock).at(-1) ?? [];
  return { url, method: init?.method, body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined };
}

function renderView(user: MeResponse = me) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <SettingsView me={user} />
    </QueryClientProvider>,
  );
}

describe("SettingsView", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    replace.mockReset();
  });

  it("saves the handle with PATCH /me, and a 409 shows that the handle is taken", async () => {
    const fetchMock = stubFetch(409, { error: "handle_taken" });
    renderView();
    const input = screen.getByLabelText("Handle");
    await userEvent.clear(input);
    await userEvent.type(input, "tian_two");
    await userEvent.click(screen.getByRole("button", { name: "Save handle" }));
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me", method: "PATCH", body: { handle: "tian_two" } });
    expect(await screen.findByText("This handle is taken.")).toBeTruthy();
  });

  it("asks for the age confirm before Show 18+ turns on, then sends POST /me/adult-confirm", async () => {
    const fetchMock = stubFetch(200, { ...me, showAdult: true });
    renderView();
    await userEvent.click(screen.getByRole("switch", { name: "Show 18+" }));
    expect(meCalls(fetchMock)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "I am 18 or older. Show 18+ content." }));
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me/adult-confirm", method: "POST" });
  });

  it("turns Show 18+ off with PATCH /me", async () => {
    const fetchMock = stubFetch(200, { ...me, showAdult: false });
    renderView({ ...me, showAdult: true });
    await userEvent.click(screen.getByRole("switch", { name: "Show 18+" }));
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me", method: "PATCH", body: { showAdult: false } });
  });

  it("turns Reply choices off with PATCH /me", async () => {
    const fetchMock = stubFetch(200, { ...me, replyChoicesOn: false });
    renderView();
    await userEvent.click(screen.getByRole("switch", { name: "Reply choices" }));
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me", method: "PATCH", body: { replyChoicesOn: false } });
  });

  it("shows the saved reply choices instructions with a count, and saves new text with PATCH /me", async () => {
    const fetchMock = stubFetch(200, { ...me, replyChoicesPrompt: "Use *asterisks*." });
    renderView({ ...me, replyChoicesPrompt: "Be brief." });
    const input = screen.getByLabelText("Reply choices instructions");
    expect((input as HTMLTextAreaElement).value).toBe("Be brief.");
    expect(screen.getByText("9/500")).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, "Use *asterisks*.");
    await userEvent.click(screen.getByRole("button", { name: "Save instructions" }));
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me", method: "PATCH", body: { replyChoicesPrompt: "Use *asterisks*." } });
    expect(await screen.findByText("Saved.")).toBeTruthy();
  });

  it("links to the Models page", () => {
    stubFetch();
    renderView();
    expect(screen.getByRole("link", { name: "Manage models" }).getAttribute("href")).toBe("/settings/models");
  });

  it("deletes the account only after the user types DELETE, then goes to /login", async () => {
    const fetchMock = stubFetch(204);
    renderView();
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(button.hasAttribute("disabled")).toBe(false);
    await userEvent.click(button);
    expect(lastCall(fetchMock)).toMatchObject({ url: "/me", method: "DELETE" });
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
