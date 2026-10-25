import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminEnergyView, AdminFreeModel, AdminSceneModel } from "@wanderer/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminModels } from "@/features/admin/models/admin-models";

const gemma: AdminFreeModel = {
  id: "m1",
  openrouterId: "google/gemma-4-31b-it:free",
  displayName: "Gemma",
  enabled: true,
  isDefault: true,
  sortOrder: 0,
  promptPriceUsd: 0.0000002,
  completionPriceUsd: 0.0000004,
  pricesFetchedAt: "2026-10-25T08:00:00.000Z",
  ownMarkupPercent: null,
  markupPercent: 20,
  markupSource: "global",
  manualEnergyPrice: null,
  costUsd: 0.00336,
  energyPrice: 0.41,
  usdValue: 0.0041,
};

const flint: AdminFreeModel = {
  ...gemma,
  id: "m2",
  openrouterId: "recursive/flint-v1.0:free",
  displayName: "Flint",
  enabled: false,
  isDefault: false,
  sortOrder: 1,
  promptPriceUsd: null,
  completionPriceUsd: null,
  costUsd: null,
  energyPrice: null,
  usdValue: null,
};

const flux: AdminSceneModel = {
  key: "flux-schnell",
  label: "Flux Schnell",
  costUsd: 0.003,
  ownMarkupPercent: null,
  markupPercent: 20,
  markupSource: "global",
  enabled: true,
  active: true,
  energyPrice: 0.36,
  usdValue: 0.0036,
};

const zImage: AdminSceneModel = { ...flux, key: "z-image-turbo", label: "Z-Image Turbo", costUsd: 0.005, active: false, energyPrice: 0.6, usdValue: 0.006 };

const view: AdminEnergyView = {
  settings: {
    dailyEnergy: 20,
    choicesPrice: 0,
    memoryPrice: 1,
    sceneModelKey: "flux-schnell",
    globalMarkupPercent: 20,
    textMarkupPercent: null,
    imageMarkupPercent: null,
    freeDailyCap: 950,
    updatedAt: "2026-10-25T08:00:00.000Z",
  },
  freeModels: [gemma, flint],
  sceneModels: [flux, zImage],
};

/** The full settings body that each settings form sends: the saved values with the changes of the form. */
const savedSettings = {
  dailyEnergy: 20,
  choicesPrice: 0,
  memoryPrice: 1,
  sceneModelKey: "flux-schnell",
  globalMarkupPercent: 20,
  textMarkupPercent: null,
  imageMarkupPercent: null,
  freeDailyCap: 950,
};

type Answer = { status?: number; body?: unknown };

/** Answers GET /admin/energy with the view. A test sets the answer of each write by "METHOD path". */
function stubApi(answers: Record<string, Answer> = {}, listStatus = 200) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { pathname } = new URL(url, "http://test");
    const method = init?.method ?? "GET";
    if (method === "GET" && pathname.endsWith("/admin/energy")) {
      return listStatus === 200 ? Response.json(view) : Response.json({ error: "forbidden" }, { status: listStatus });
    }
    const answer = answers[`${method} ${pathname}`] ?? {};
    if (answer.status === 204) {
      return new Response(null, { status: 204 });
    }
    return Response.json(answer.body ?? {}, { status: answer.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function writes(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? "GET") !== "GET")
    .map(([url, init]) => ({
      call: `${init?.method} ${new URL(url, "http://test").pathname}`,
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AdminModels />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.findByRole("row", { name: new RegExp(name) });

describe("AdminModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a user who is not an admin sees a short message", async () => {
    stubApi({}, 403);
    renderView();
    expect(await screen.findByText("This page is for the admin.")).toBeTruthy();
  });

  it("the markup panel shows the global markup, and an empty group default says that it uses the global markup", async () => {
    stubApi();
    renderView();
    const panel = await screen.findByRole("form", { name: "Markup" });
    expect((within(panel).getByLabelText(/Global markup/) as HTMLInputElement).value).toBe("20");
    expect((within(panel).getByLabelText(/Text models/) as HTMLInputElement).value).toBe("");
    expect(within(panel).getAllByText("Uses the global 20%")).toHaveLength(2);
  });

  it("Save markups sends the global markup and each group default, with an empty group as null", async () => {
    const fetchMock = stubApi({ "PUT /admin/energy/settings": { body: view } });
    renderView();
    const panel = await screen.findByRole("form", { name: "Markup" });
    await userEvent.clear(within(panel).getByLabelText(/Global markup/));
    await userEvent.type(within(panel).getByLabelText(/Global markup/), "25");
    await userEvent.type(within(panel).getByLabelText(/Text models/), "0");
    await userEvent.click(within(panel).getByRole("button", { name: "Save markups" }));
    expect(writes(fetchMock)).toEqual([
      { call: "PUT /admin/energy/settings", body: { ...savedSettings, globalMarkupPercent: 25, textMarkupPercent: 0 } },
    ]);
  });

  it("the free model table shows the id, the cost, the markup with its source, the price and the state", async () => {
    stubApi();
    renderView();
    const first = await row("Gemma");
    expect(within(first).getByText("google/gemma-4-31b-it:free")).toBeTruthy();
    expect(within(first).getByText("$0.00336")).toBeTruthy();
    expect(within(first).getByText("20%")).toBeTruthy();
    expect(within(first).getByText("global")).toBeTruthy();
    expect(within(first).getByText("0.41 energy")).toBeTruthy();
    expect(within(first).getByText("$0.0041")).toBeTruthy();
    expect(within(first).getByRole("switch", { name: "On: Gemma" }).getAttribute("aria-checked")).toBe("true");
    expect((within(first).getByRole("radio", { name: "Default: Gemma" }) as HTMLInputElement).checked).toBe(true);
    const second = await row("Flint");
    expect(within(second).getByText("No price")).toBeTruthy();
    expect(within(second).getByRole("switch", { name: "On: Flint" }).getAttribute("aria-checked")).toBe("false");
  });

  it("the switch and the default radio send their changes, and a model with no price explains why it stays off", async () => {
    const fetchMock = stubApi({
      "PATCH /admin/energy/free-models/m1": { body: gemma },
      "PATCH /admin/energy/free-models/m2": { status: 400, body: { error: "price_required" } },
    });
    renderView();
    await userEvent.click(within(await row("Gemma")).getByRole("switch", { name: "On: Gemma" }));
    await userEvent.click(within(await row("Flint")).getByRole("radio", { name: "Default: Flint" }));
    await userEvent.click(within(await row("Flint")).getByRole("switch", { name: "On: Flint" }));
    expect(writes(fetchMock)).toEqual([
      { call: "PATCH /admin/energy/free-models/m1", body: { enabled: false } },
      { call: "PATCH /admin/energy/free-models/m2", body: { isDefault: true } },
      { call: "PATCH /admin/energy/free-models/m2", body: { enabled: true } },
    ]);
    expect(await screen.findAllByText(/has no OpenRouter price/)).not.toHaveLength(0);
  });

  it("Add a model sends the id and the name, and an empty markup or price as null", async () => {
    const fetchMock = stubApi({ "POST /admin/energy/free-models": { status: 201, body: gemma } });
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Add a model" }));
    const form = screen.getByRole("form", { name: "Add a model" });
    await userEvent.type(within(form).getByLabelText(/OpenRouter model ID/), "meta/llama:free");
    await userEvent.type(within(form).getByLabelText(/Name/), "Llama");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(writes(fetchMock)).toEqual([
      {
        call: "POST /admin/energy/free-models",
        body: {
          openrouterId: "meta/llama:free",
          displayName: "Llama",
          enabled: false,
          isDefault: false,
          sortOrder: 0,
          markupPercent: null,
          manualEnergyPrice: null,
        },
      },
    ]);
  });

  it("Edit saves an own markup and a manual price", async () => {
    const fetchMock = stubApi({ "PATCH /admin/energy/free-models/m1": { body: gemma } });
    renderView();
    await userEvent.click(within(await row("Gemma")).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit Gemma" });
    await userEvent.type(within(form).getByLabelText(/Own markup/), "100");
    await userEvent.type(within(form).getByLabelText(/Manual price/), "0.5");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(writes(fetchMock)).toEqual([
      {
        call: "PATCH /admin/energy/free-models/m1",
        body: { displayName: "Gemma", sortOrder: 0, markupPercent: 100, manualEnergyPrice: 0.5 },
      },
    ]);
  });

  it("the edit panel tests the model, and removes it after a second click", async () => {
    const fetchMock = stubApi({
      "POST /admin/energy/free-models/test": { body: { ok: true, reply: "OK", latencyMs: 420 } },
      "DELETE /admin/energy/free-models/m2": { status: 204 },
    });
    renderView();
    await userEvent.click(within(await row("Flint")).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit Flint" });
    await userEvent.click(within(form).getByRole("button", { name: "Test" }));
    expect(await within(form).findByText(/answered “OK” in 420 ms/)).toBeTruthy();
    await userEvent.click(within(form).getByRole("button", { name: "Remove" }));
    expect(writes(fetchMock).map((write) => write.call)).toEqual(["POST /admin/energy/free-models/test"]);
    await userEvent.click(within(form).getByRole("button", { name: "Yes, remove Flint" }));
    expect(writes(fetchMock).at(-1)).toEqual({ call: "DELETE /admin/energy/free-models/m2", body: undefined });
  });

  it("a failed Refresh prices says that each model keeps its last price", async () => {
    stubApi({ "POST /admin/energy/prices/refresh": { status: 502, body: { error: "price_refresh_failed" } } });
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Refresh prices" }));
    expect(await screen.findByText(/Each model keeps its last price/)).toBeTruthy();
  });

  it("the scene table picks the active model, and the active model cannot turn off", async () => {
    const fetchMock = stubApi({
      "PUT /admin/energy/settings": { body: view },
      "PUT /admin/energy/scene-models/flux-schnell": { status: 409, body: { error: "scene_model_active" } },
    });
    renderView();
    const first = await row("Flux Schnell");
    expect(within(first).getByText("0.36 energy")).toBeTruthy();
    await userEvent.click(within(await row("Z-Image Turbo")).getByRole("radio", { name: "Active: Z-Image Turbo" }));
    await userEvent.click(within(first).getByRole("switch", { name: "On: Flux Schnell" }));
    expect(writes(fetchMock)).toEqual([
      { call: "PUT /admin/energy/settings", body: { ...savedSettings, sceneModelKey: "z-image-turbo" } },
      { call: "PUT /admin/energy/scene-models/flux-schnell", body: { costUsd: 0.003, markupPercent: null, enabled: false } },
    ]);
    expect(await screen.findByText(/active scene model cannot turn off/)).toBeTruthy();
  });

  it("Edit on a scene model saves its cost and its own markup", async () => {
    const fetchMock = stubApi({ "PUT /admin/energy/scene-models/z-image-turbo": { body: zImage } });
    renderView();
    await userEvent.click(within(await row("Z-Image Turbo")).getByRole("button", { name: "Edit" }));
    const form = screen.getByRole("form", { name: "Edit Z-Image Turbo" });
    await userEvent.clear(within(form).getByLabelText(/Cost of one image/));
    await userEvent.type(within(form).getByLabelText(/Cost of one image/), "0.004");
    await userEvent.type(within(form).getByLabelText(/Own markup/), "50");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(writes(fetchMock)).toEqual([
      { call: "PUT /admin/energy/scene-models/z-image-turbo", body: { costUsd: 0.004, markupPercent: 50, enabled: true } },
    ]);
  });

  it("the energy and limits form saves the daily energy, the action prices and the cap", async () => {
    const fetchMock = stubApi({ "PUT /admin/energy/settings": { body: view } });
    renderView();
    const form = await screen.findByRole("form", { name: "Energy and limits" });
    await userEvent.clear(within(form).getByLabelText(/Daily energy/));
    await userEvent.type(within(form).getByLabelText(/Daily energy/), "25.5");
    await userEvent.click(within(form).getByRole("button", { name: "Save limits" }));
    expect(writes(fetchMock)).toEqual([{ call: "PUT /admin/energy/settings", body: { ...savedSettings, dailyEnergy: 25.5 } }]);
  });
});
