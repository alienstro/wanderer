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
