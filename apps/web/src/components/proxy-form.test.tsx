import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiKeyView, ProxyView } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProxyForm } from "./proxy-form";

const saved: ProxyView = {
  id: "p1",
  name: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  appendPath: true,
  model: "deepseek/deepseek-chat",
  customPrompt: "",
  contextTokens: 16_000,
  savedKey: { id: "1a2b3c4d-0000-4000-8000-000000000001", name: "OpenRouter", keyLast4: "3f9a" },
  isActive: true,
  createdAt: "2026-10-21T00:00:00.000Z",
};

const keys: ApiKeyView[] = [
  { id: "1a2b3c4d-0000-4000-8000-000000000001", name: "OpenRouter", keyLast4: "3f9a", modelCount: 1, createdAt: "2026-10-21T00:00:00.000Z" },
  { id: "1a2b3c4d-0000-4000-8000-000000000002", name: "Work", keyLast4: "77bb", modelCount: 0, createdAt: "2026-10-22T00:00:00.000Z" },
];

const newKeyId = "0b6f3c2e-1d7a-4f6e-8a51-3c9d2e7f4a10";

/** Answers POST /api-keys with a new key, and each other call with the next proxy answer. */
function stubRoutes(...proxyAnswers: Array<{ status: number; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/api-keys")) {
      return Response.json({ ...keys[0], id: newKeyId, name: "Fresh" }, { status: 201 });
    }
    const answer = proxyAnswers.shift() ?? { status: 201, body: saved };
    return Response.json(answer.body, { status: answer.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return JSON.parse(String((fetchMock.mock.calls[call] as [string, RequestInit])[1].body)) as Record<string, unknown>;
}

async function fillModel() {
  await userEvent.type(screen.getByLabelText(/^Name/), "Home");
  await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://api.example.com/v1");
  await userEvent.type(screen.getByLabelText(/^Model/), "m");
}

function stubFetch(status = 200, body: unknown = saved) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ProxyForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("the endpoint line shows /chat/completions only when the checkbox is on", async () => {
    render(<ProxyForm apiKeys={keys} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://api.example.com/v1");
    expect(screen.getByText("https://api.example.com/v1/chat/completions")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Add /chat/completions"));
    expect(screen.getByText("https://api.example.com/v1")).toBeInTheDocument();
  });

  it("Show changes the new key field type from password to text", async () => {
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    const key = screen.getByLabelText(/^New API key/);
    expect(key).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(key).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("edit shows the current key, and a submit with no key change sends no apiKeyId", async () => {
    const fetchMock = stubFetch();
    const onSaved = vi.fn();
    render(<ProxyForm apiKeys={keys} initial={saved} onSaved={onSaved} />);
    expect(screen.getByLabelText(/^API key/)).toHaveValue("1a2b3c4d-0000-4000-8000-000000000001");
    await userEvent.clear(screen.getByLabelText(/^Model/));
    await userEvent.type(screen.getByLabelText(/^Model/), "other-model");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/proxies/p1");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("apiKeyId");
    expect(body).not.toHaveProperty("apiKey");
    expect(body.model).toBe("other-model");
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it("the context size field shows the saved value, and a submit sends the new value as a number", async () => {
    const fetchMock = stubFetch();
    render(<ProxyForm apiKeys={keys} initial={saved} onSaved={vi.fn()} />);
    const size = screen.getByLabelText(/^Context size/);
    expect(size).toHaveValue(16_000);
    await userEvent.clear(size);
    await userEvent.type(size, "32000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as Record<string, unknown>;
    expect(body.contextTokens).toBe(32_000);
  });

  it("a context size of 1999 shows an error and sends no request", async () => {
    const fetchMock = stubFetch();
    render(<ProxyForm apiKeys={keys} initial={saved} onSaved={vi.fn()} />);
    const size = screen.getByLabelText(/^Context size/);
    await userEvent.clear(size);
    await userEvent.type(size, "1999");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a whole number from 2,000 to 200,000.")).toBeInTheDocument();
    expect(size).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a blocked_url answer shows "This proxy URL is not allowed." at the URL field', async () => {
    stubFetch(400, { error: "blocked_url", fields: ["baseUrl"] });
    render(<ProxyForm apiKeys={keys} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Name/), "Home");
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://10.0.0.5/v1");
    await userEvent.type(screen.getByLabelText(/^Model/), "m");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This proxy URL is not allowed.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Proxy URL/)).toHaveAttribute("aria-invalid", "true");
  });

  it("picks a saved key and sends its apiKeyId, with no key text", async () => {
    const fetchMock = stubRoutes();
    render(<ProxyForm apiKeys={keys} onSaved={vi.fn()} />);
    expect(screen.getByRole("option", { name: "OpenRouter (••••3f9a)" })).toBeInTheDocument();
    await fillModel();
    await userEvent.selectOptions(screen.getByLabelText(/^API key/), "1a2b3c4d-0000-4000-8000-000000000002");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock, 0)).toMatchObject({ apiKeyId: "1a2b3c4d-0000-4000-8000-000000000002" });
    expect(bodyOf(fetchMock, 0)).not.toHaveProperty("apiKey");
  });

  it("Add a new key posts the key first, and then the model with the new key id", async () => {
    const fetchMock = stubRoutes();
    const onKeyAdded = vi.fn();
    render(<ProxyForm apiKeys={keys} onSaved={vi.fn()} onKeyAdded={onKeyAdded} />);
    await fillModel();
    await userEvent.selectOptions(screen.getByLabelText(/^API key/), "new");
    await userEvent.type(screen.getByLabelText(/^Key name/), "Fresh");
    await userEvent.type(screen.getByLabelText(/^New API key/), "sk-fresh-1234");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/api-keys$/);
    expect(bodyOf(fetchMock, 0)).toEqual({ name: "Fresh", apiKey: "sk-fresh-1234" });
    expect(fetchMock.mock.calls[1]![0]).toMatch(/\/proxies$/);
    expect(bodyOf(fetchMock, 1)).toMatchObject({ apiKeyId: newKeyId });
    expect(onKeyAdded).toHaveBeenCalled();
  });

  it("with no saved keys, the form starts on Add a new key, and a new key needs a name and a key", async () => {
    const fetchMock = stubRoutes();
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/^API key/)).toHaveValue("new");
    await fillModel();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter a key name of 60 characters or less.")).toBeInTheDocument();
    expect(screen.getByText("Enter the API key.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a retry after a failed model save does not add the new key again", async () => {
    const fetchMock = stubRoutes({ status: 500, body: { error: "internal" } });
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    await fillModel();
    await userEvent.type(screen.getByLabelText(/^Key name/), "Fresh");
    await userEvent.type(screen.getByLabelText(/^New API key/), "sk-fresh-1234");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The proxy did not save. Check the fields and try again.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const keyCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/api-keys"));
    expect(keyCalls).toHaveLength(1);
    expect(bodyOf(fetchMock, 2)).toMatchObject({ apiKeyId: newKeyId });
  });

  it("Load models sends the URL and the picked saved key id, and a click on a found model fills the Model field", async () => {
    const fetchMock = stubFetch(200, { ok: true, models: ["deepseek/deepseek-chat", "oc/deepseek-v4.1-flash-free", "qwen/qwen3"] });
    render(<ProxyForm apiKeys={keys} initial={saved} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Load models" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/proxies/models");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      appendPath: true,
      apiKeyId: keys[0]!.id,
    });
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search models" }), "flash");
    expect(screen.queryByRole("button", { name: "qwen/qwen3" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "oc/deepseek-v4.1-flash-free" }));
    expect(screen.getByLabelText(/^Model/)).toHaveValue("oc/deepseek-v4.1-flash-free");
    expect(screen.queryByRole("searchbox", { name: "Search models" })).not.toBeInTheDocument();
  });

  it("Load models with Add a new key sends the typed key and no key id", async () => {
    const fetchMock = stubFetch(200, { ok: true, models: ["m"] });
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://openrouter.ai/api/v1");
    await userEvent.type(screen.getByLabelText(/^New API key/), "sk-typed-1234");
    await userEvent.click(screen.getByRole("button", { name: "Load models" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      baseUrl: "https://openrouter.ai/api/v1",
      appendPath: true,
      apiKey: "sk-typed-1234",
    });
  });

  it("a failed model list shows the message, and the form keeps its values", async () => {
    stubFetch(200, { ok: false, error: "invalid_key", message: "The proxy refused the API key." });
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://openrouter.ai/api/v1");
    await userEvent.type(screen.getByLabelText(/^New API key/), "sk-wrong");
    await userEvent.type(screen.getByLabelText(/^Model/), "my-model");
    await userEvent.click(screen.getByRole("button", { name: "Load models" }));
    expect(await screen.findByText("The proxy refused the API key.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Model/)).toHaveValue("my-model");
    expect(screen.getByLabelText(/^New API key/)).toHaveValue("sk-wrong");
  });

  it("Load models with Add a new key and no key shows the key error and sends no request", async () => {
    const fetchMock = stubFetch();
    render(<ProxyForm apiKeys={[]} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://openrouter.ai/api/v1");
    await userEvent.click(screen.getByRole("button", { name: "Load models" }));
    expect(screen.getByText("Enter the API key.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
