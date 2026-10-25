import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Persona, PersonaListResponse } from "@wanderer/shared";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PersonasSection } from "./personas-section";

function persona(id: string, name: string, isDefault = false): Persona {
  return {
    id,
    name,
    description: "",
    isDefault,
    createdAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:00.000Z",
  };
}

const ARIA = persona("p1", "Aria", true);
const SAM = persona("p2", "Sam");
const KAI = persona("p3", "Kai");

type Reply = { status?: number; body?: unknown };

/** Answers GET /personas with the list, and each other request with the next reply. */
function stubFetch(personas: Persona[], ...replies: Reply[]) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const reply: Reply = !init?.method || init.method === "GET" ? { body: { personas } } : (replies.shift() ?? {});
    const status = reply.status ?? 200;
    return status === 204 ? new Response(null, { status }) : Response.json(reply.body ?? {}, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function writes(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => ({
      url: String(url),
      method: init?.method,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PersonasSection />
    </QueryClientProvider>,
  );
}

describe("PersonasSection", () => {
  beforeAll(() => {
    // jsdom has no modal dialog. The stubs only open and close the element.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows each persona with a Default badge", async () => {
    stubFetch([ARIA, SAM]);
    renderSection();
    const aria = await screen.findByRole("listitem", { name: "Aria" });
    expect(within(aria).getByText("Default")).toBeInTheDocument();
    expect(within(aria).queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
    const sam = screen.getByRole("listitem", { name: "Sam" });
    expect(within(sam).queryByText("Default")).not.toBeInTheDocument();
  });

  it("shows Personas (2 of 3)", async () => {
    stubFetch([ARIA, SAM]);
    renderSection();
    expect(await screen.findByRole("heading", { name: "Personas (2 of 3)" })).toBeInTheDocument();
  });

  it("makes a persona the default", async () => {
    const after: PersonaListResponse = { personas: [{ ...ARIA, isDefault: false }, { ...SAM, isDefault: true }] };
    const fetchMock = stubFetch([ARIA, SAM], { body: after });
    renderSection();
    const sam = await screen.findByRole("listitem", { name: "Sam" });
    await userEvent.click(within(sam).getByRole("button", { name: "Make default" }));
    expect(writes(fetchMock)).toEqual([{ url: "/personas/p2/default", method: "POST", body: undefined }]);
    expect(await within(screen.getByRole("listitem", { name: "Sam" })).findByText("Default")).toBeInTheDocument();
  });

  it("deletes a persona after a confirmation", async () => {
    const fetchMock = stubFetch([ARIA, SAM], { status: 204 });
    renderSection();
    const sam = await screen.findByRole("listitem", { name: "Sam" });
    await userEvent.click(within(sam).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Sam?" });
    expect(within(dialog).getByText("Old chats keep this persona.")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(writes(fetchMock)).toEqual([{ url: "/personas/p2", method: "DELETE", body: undefined }]);
  });

  it("disables Add persona at 3 personas with the limit text", async () => {
    stubFetch([ARIA, SAM, KAI]);
    renderSection();
    expect(await screen.findByText("You can save up to 3 personas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add persona" })).toBeDisabled();
  });

  it("adds a persona from the dialog", async () => {
    const fetchMock = stubFetch([ARIA], { status: 201, body: SAM });
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add persona" }));
    const dialog = screen.getByRole("dialog", { name: "Add persona" });
    await userEvent.type(within(dialog).getByLabelText(/Name/), "Sam");
    await userEvent.type(within(dialog).getByLabelText(/Description/), "A student.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(writes(fetchMock)).toEqual([
      { url: "/personas", method: "POST", body: { name: "Sam", description: "A student." } },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a persona from the dialog", async () => {
    const fetchMock = stubFetch([{ ...ARIA, description: "A knight." }], { body: ARIA });
    renderSection();
    const aria = await screen.findByRole("listitem", { name: "Aria" });
    await userEvent.click(within(aria).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Edit persona" });
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue("A knight.");
    const name = within(dialog).getByLabelText(/Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Ari");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(writes(fetchMock)).toEqual([
      { url: "/personas/p1", method: "PATCH", body: { name: "Ari", description: "A knight." } },
    ]);
  });

  it("shows the counter 0 / 1,000", async () => {
    stubFetch([]);
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add persona" }));
    const dialog = screen.getByRole("dialog", { name: "Add persona" });
    expect(within(dialog).getByText("0 / 1,000")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Description/), "Shy");
    expect(within(dialog).getByText("3 / 1,000")).toBeInTheDocument();
  });

  it("asks for a name before it sends", async () => {
    const fetchMock = stubFetch([]);
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add persona" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a name of 50 characters or less.")).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
  });

  it("shows the limit text on a 409 persona_limit", async () => {
    stubFetch([ARIA, SAM], { status: 409, body: { error: "persona_limit" } });
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add persona" }));
    const dialog = screen.getByRole("dialog", { name: "Add persona" });
    await userEvent.type(within(dialog).getByLabelText(/Name/), "Kai");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You can save up to 3 personas.");
  });

  it("closes on Cancel", async () => {
    const fetchMock = stubFetch([]);
    renderSection();
    await userEvent.click(await screen.findByRole("button", { name: "Add persona" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([]);
  });
});
