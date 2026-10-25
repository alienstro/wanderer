import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMemory, EnergyView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEnergy } from "@/features/energy";
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

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Loads the energy as the sidebar card does, so a refresh of the panel sends a new /energy request. */
function EnergyProbe() {
  useEnergy();
  return null;
}

async function openPanel(memory: ChatMemory = saved, onSaved = vi.fn(), extra: ReactNode = null) {
  withClient(
    <>
      <MemoryButton chatId="c1" memory={memory} onSaved={onSaved} />
      {extra}
    </>,
  );
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

  it("Save closes the panel and gives the focus back to the Memory button", async () => {
    stubFetch({ body: { text: "New fact.", throughPosition: null } });
    await openPanel();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Memory" })).toHaveFocus();
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

  it("Summarize sends the unsaved text, and a second Summarize also sends the draft marker", async () => {
    const fetchMock = stubFetch({ body: { memory: "Draft.", throughPosition: 12 } }, { body: { memory: "Draft 2.", throughPosition: 20 } });
    const { box } = await openPanel();
    await userEvent.clear(box);
    await userEvent.type(box, "Typed fact.");
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await screen.findByText("Draft, not saved");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ memory: "Typed fact." });
    await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
    await vi.waitFor(() => expect(box.value).toBe("Draft 2."));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ memory: "Draft.", throughPosition: 12 });
  });

  describe("energy", () => {
    /** 00:00 UTC is 8:00 AM in Manila. */
    const REFILL = "2026-10-26T00:00:00.000Z";
    const energy: EnergyView = {
      balance: 0.5,
      dailyEnergy: 50,
      nextRefillAt: REFILL,
      model: "free",
      freeModelName: "Gemma",
      prices: { reply: 2, choices: 0.5, memory: 1, scene: 5 },
    };

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    /** Answers /me, /energy, and the summary with the given answer. */
    function stubEnergy(summary: Answer) {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.endsWith("/me")) {
          return Response.json({ id: "u1", activeProxy: null });
        }
        if (url.endsWith("/energy")) {
          return Response.json(energy);
        }
        return Response.json(summary.body, { status: summary.status ?? 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    const energyCalls = (fetchMock: ReturnType<typeof stubEnergy>) =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/energy")).length;

    it("a summary with too little energy shows the price, the balance and the refill time", async () => {
      vi.stubEnv("TZ", "Asia/Manila");
      stubEnergy({ status: 429, body: { error: "energy_low", balance: 0.5, price: 1, nextRefillAt: REFILL } });
      await openPanel();
      await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
      expect(await screen.findByText("A memory summary costs 1 energy. You have 0.5. Your energy refills at 8:00 AM.")).toBeTruthy();
    });

    it("after a summary ends, the energy loads again", async () => {
      const fetchMock = stubEnergy({ body: { memory: "Draft.", throughPosition: 12 } });
      await openPanel(saved, vi.fn(), <EnergyProbe />);
      await waitFor(() => expect(energyCalls(fetchMock)).toBe(1));
      await userEvent.click(screen.getByRole("button", { name: "Summarize" }));
      await screen.findByText("Draft, not saved");
      await waitFor(() => expect(energyCalls(fetchMock)).toBe(2));
    });
  });
});
