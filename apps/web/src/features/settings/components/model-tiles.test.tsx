import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FreeModelView, ProxyView } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelTiles } from "./model-tiles";

const freeModels: FreeModelView[] = [{ id: "f1", displayName: "DeepSeek V3", energyPrice: 1, isDefault: true, isActive: false }];

const proxies: ProxyView[] = [
  {
    id: "p1",
    name: "My OpenRouter key",
    baseUrl: "https://openrouter.ai/api/v1",
    appendPath: true,
    model: "deepseek/deepseek-chat-v3",
    customPrompt: "",
    contextTokens: 16000,
    savedKey: { id: "k1", name: "OpenRouter", keyLast4: "4f2a" },
    isActive: true,
    createdAt: "2026-10-20T10:00:00.000Z",
  },
];

function stubApi() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/free-models/f1/activate") && init?.method === "POST") {
      return Response.json([{ ...freeModels[0], isActive: true }]);
    }
    if (url.endsWith("/free-models")) {
      return Response.json(freeModels);
    }
    if (url.endsWith("/proxies")) {
      return Response.json(proxies);
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderTiles() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ModelTiles />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ModelTiles", () => {
  it("shows a tile for each free model and each own model, with the active one checked, and an Add a model link", async () => {
    stubApi();
    renderTiles();
    const own = await screen.findByRole("radio", { name: /My OpenRouter key/ });
    expect(own).toBeChecked();
    expect(own.closest("label")).toHaveTextContent("Key ends in 4f2a");
    const free = await screen.findByRole("radio", { name: /DeepSeek V3/ });
    expect(free).not.toBeChecked();
    expect(free.closest("label")).toHaveTextContent("1 energy for each reply");
    expect(screen.getByRole("link", { name: "Add a model" })).toHaveAttribute("href", "/settings/models");
  });

  it("a click on a free model sends POST /free-models/<id>/activate", async () => {
    const fetchMock = stubApi();
    renderTiles();
    await userEvent.click(await screen.findByRole("radio", { name: /DeepSeek V3/ }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/free-models/f1/activate"), expect.objectContaining({ method: "POST" })),
    );
  });
});
