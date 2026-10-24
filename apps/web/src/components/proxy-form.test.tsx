import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProxyView } from "@wanderer/shared";
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
  keyLast4: "3f9a",
  isActive: true,
  createdAt: "2026-10-21T00:00:00.000Z",
};

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
    render(<ProxyForm onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://api.example.com/v1");
    expect(screen.getByText("https://api.example.com/v1/chat/completions")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Add /chat/completions"));
    expect(screen.getByText("https://api.example.com/v1")).toBeInTheDocument();
  });

  it("Show changes the key field type from password to text", async () => {
    render(<ProxyForm onSaved={vi.fn()} />);
    const key = screen.getByLabelText(/^API key/);
    expect(key).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(key).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("a submit on edit with an empty key sends no apiKey field", async () => {
    const fetchMock = stubFetch();
    const onSaved = vi.fn();
    render(<ProxyForm initial={saved} onSaved={onSaved} />);
    expect(screen.getByLabelText(/^API key/)).toHaveAttribute("placeholder", "••••3f9a (leave empty to keep)");
    await userEvent.clear(screen.getByLabelText(/^Model/));
    await userEvent.type(screen.getByLabelText(/^Model/), "other-model");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/proxies/p1");
    expect(init?.method).toBe("PATCH");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("apiKey");
    expect(body.model).toBe("other-model");
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it("the context size field shows the saved value, and a submit sends the new value as a number", async () => {
    const fetchMock = stubFetch();
    render(<ProxyForm initial={saved} onSaved={vi.fn()} />);
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
    render(<ProxyForm initial={saved} onSaved={vi.fn()} />);
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
    render(<ProxyForm onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/^Name/), "Home");
    await userEvent.type(screen.getByLabelText(/^Proxy URL/), "https://10.0.0.5/v1");
    await userEvent.type(screen.getByLabelText(/^API key/), "sk-1234");
    await userEvent.type(screen.getByLabelText(/^Model/), "m");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This proxy URL is not allowed.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Proxy URL/)).toHaveAttribute("aria-invalid", "true");
  });
});
