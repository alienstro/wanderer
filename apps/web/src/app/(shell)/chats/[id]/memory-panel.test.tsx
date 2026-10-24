import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMemory } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryButton } from "./memory-panel";

type Answer = { status?: number; body: unknown };

/** Answers each request in order. */
function stubFetch(...answers: Answer[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const answer = answers.shift() ?? { body: {} };
    return Response.json(answer.body, { status: answer.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const saved: ChatMemory = { text: "Mira owes {{user}} a sword.", throughPosition: null };

async function openPanel(memory: ChatMemory = saved, onSaved = vi.fn()) {
  render(<MemoryButton chatId="c1" memory={memory} onSaved={onSaved} />);
  await userEvent.click(screen.getByRole("button", { name: "Memory" }));
  return { box: screen.getByLabelText("Memory text") as HTMLTextAreaElement, onSaved };
}

describe("MemoryButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a panel that shows the saved memory and the counter", async () => {
    stubFetch();
    const { box } = await openPanel();
    expect(screen.getByRole("dialog", { name: "Memory" })).toBeTruthy();
    expect(box.value).toBe("Mira owes {{user}} a sword.");
    expect(screen.getByText("27 / 2000")).toBeTruthy();
  });

  it("Summarize puts the draft in the box and does not save it", async () => {
    const fetchMock = stubFetch({ body: { memory: "Mira owes {{user}} a sword.\nThe ship is in Port Vel.", throughPosition: 12 } });
    const { box, onSaved } = await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    expect(await screen.findByText("Draft, not saved")).toBeTruthy();
    expect(box.value).toBe("Mira owes {{user}} a sword.\nThe ship is in Port Vel.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/chats/c1/memory/summarize");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("Save after a draft sends the text and the draft marker, then gives the saved memory to the page", async () => {
    const after = { text: "Edited draft.", throughPosition: 12 };
    const fetchMock = stubFetch({ body: { memory: "Draft.", throughPosition: 12 } }, { body: after });
    const { box, onSaved } = await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await screen.findByText("Draft, not saved");
    await userEvent.clear(box);
    await userEvent.type(box, "Edited draft.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toContain("/chats/c1/memory");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ memory: "Edited draft.", throughPosition: 12 });
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(after));
  });

  it("Save without a draft sends only the text", async () => {
    const fetchMock = stubFetch({ body: { text: "New fact.", throughPosition: null } });
    const { box } = await openPanel();
    await userEvent.clear(box);
    await userEvent.type(box, "New fact.");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ memory: "New fact." });
  });

  it("a text over 2,000 characters shows an alert and turns Save off", async () => {
    stubFetch();
    const { box } = await openPanel();
    fireEvent.change(box, { target: { value: "x".repeat(2001) } });
    expect(screen.getByRole("alert").textContent).toContain("2001 / 2000");
    expect(screen.getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(true);
  });

  it("a draft equal to the saved memory says that no new messages need a summary", async () => {
    stubFetch({ body: { memory: saved.text, throughPosition: null } });
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    expect(await screen.findByText("No new messages to summarize.")).toBeTruthy();
  });

  it("a proxy error shows the error text", async () => {
    stubFetch({ status: 502, body: { error: "invalid_key" } });
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    expect(await screen.findByText("The proxy refused the API key.")).toBeTruthy();
  });
});
