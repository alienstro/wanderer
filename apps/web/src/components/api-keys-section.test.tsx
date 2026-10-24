import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKeyView } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeysSection } from "./api-keys-section";

const saved: ApiKeyView = {
  id: "k1",
  name: "OpenRouter",
  keyLast4: "3f9a",
  modelCount: 2,
  createdAt: "2026-10-24T00:00:00.000Z",
};

function stubFetch(status = 200, body: unknown = saved) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    status === 204 ? new Response(null, { status }) : Response.json(body, { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchMock.mock.calls[0]!;
  return { url, method: init?.method, body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined };
}

describe("ApiKeysSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the name, the last 4 characters and the model count of each key", () => {
    render(<ApiKeysSection apiKeys={[saved]} onChanged={vi.fn()} />);
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getByText("••••3f9a · Used by 2 models")).toBeInTheDocument();
  });

  it("shows a line when there are no keys", () => {
    render(<ApiKeysSection apiKeys={[]} onChanged={vi.fn()} />);
    expect(screen.getByText("You have no saved keys yet.")).toBeInTheDocument();
  });

  it("add sends the name and the key", async () => {
    const fetchMock = stubFetch(201);
    const onChanged = vi.fn();
    render(<ApiKeysSection apiKeys={[]} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    expect(screen.getByLabelText(/^API key\b/)).toHaveAttribute("type", "password");
    await userEvent.type(screen.getByLabelText(/^Name/), "OpenRouter");
    await userEvent.type(screen.getByLabelText(/^API key\b/), "sk-live-3f9a");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent(fetchMock)).toMatchObject({
      url: expect.stringContaining("/api-keys"),
      method: "POST",
      body: { name: "OpenRouter", apiKey: "sk-live-3f9a" },
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("add with an empty name and key shows the field errors and sends no request", async () => {
    const fetchMock = stubFetch();
    render(<ApiKeysSection apiKeys={[]} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a name of 60 characters or less.")).toBeInTheDocument();
    expect(screen.getByText("Enter the API key.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rename sends only the name", async () => {
    const fetchMock = stubFetch();
    render(<ApiKeysSection apiKeys={[saved]} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    await userEvent.clear(screen.getByLabelText(/^Name/));
    await userEvent.type(screen.getByLabelText(/^Name/), "Work");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent(fetchMock)).toMatchObject({ url: expect.stringContaining("/api-keys/k1"), method: "PATCH", body: { name: "Work" } });
  });

  it("replace sends only the new key", async () => {
    const fetchMock = stubFetch();
    render(<ApiKeysSection apiKeys={[saved]} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Replace" }));
    await userEvent.type(screen.getByLabelText(/^New API key/), "sk-new-77bb");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(sent(fetchMock)).toMatchObject({ method: "PATCH", body: { apiKey: "sk-new-77bb" } });
  });

  it("delete of a key in use shows the model names", async () => {
    stubFetch(409, { error: "api_key_in_use", models: ["DeepSeek", "Claude"] });
    const onChanged = vi.fn();
    render(<ApiKeysSection apiKeys={[saved]} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText("Change these models first: DeepSeek, Claude.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("delete of a free key sends DELETE", async () => {
    const fetchMock = stubFetch(204);
    const onChanged = vi.fn();
    render(<ApiKeysSection apiKeys={[{ ...saved, modelCount: 0 }]} onChanged={onChanged} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(sent(fetchMock)).toMatchObject({ url: expect.stringContaining("/api-keys/k1"), method: "DELETE" });
    expect(onChanged).toHaveBeenCalled();
  });

  it("the key limit shows the limit message", async () => {
    stubFetch(409, { error: "api_key_limit" });
    render(<ApiKeysSection apiKeys={[saved]} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a key" }));
    await userEvent.type(screen.getByLabelText(/^Name/), "One more");
    await userEvent.type(screen.getByLabelText(/^API key\b/), "sk-1234");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("You can save 20 API keys. Delete a key to add a new one.")).toBeInTheDocument();
  });
});
