import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { EnergyView } from "@wanderer/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEnergy, useRefreshEnergy } from "./use-energy";

const me = { id: "u1", name: "Tian", activeProxy: null };

function energy(nextRefillAt: string): EnergyView {
  return {
    balance: 12,
    dailyEnergy: 50,
    nextRefillAt,
    model: "free",
    freeModelName: "Gemma",
    prices: { reply: 2, choices: 0.5, memory: 1, scene: 5 },
  };
}

/** Answers /me with the user (or a 401), and /energy with the view. */
function stubApi(view: EnergyView, user: typeof me | null = me) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/me")) {
      return user ? Response.json(user) : Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return url.endsWith("/energy") ? Response.json(view) : Response.json({ error: "not_found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const energyCalls = (fetchMock: ReturnType<typeof stubApi>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/energy")).length;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useEnergy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("a signed-in user gets the energy view of GET /energy", async () => {
    const view = energy("2099-01-01T00:00:00.000Z");
    stubApi(view);
    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(view));
  });

  it("a visitor sends no /energy request", async () => {
    const fetchMock = stubApi(energy("2099-01-01T00:00:00.000Z"), null);
    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(energyCalls(fetchMock)).toBe(0);
    expect(result.current.data).toBeUndefined();
  });

  it("after the refill time, the hook loads the energy again with no reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubApi(energy(new Date(Date.now() + 60_000).toISOString()));
    const { result } = renderHook(() => useEnergy(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(energyCalls(fetchMock)).toBe(1);
    await act(() => vi.advanceTimersByTimeAsync(62_000));
    expect(energyCalls(fetchMock)).toBe(2);
  });

  it("a refill time in the past or far away makes no request loop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const refillAt of [new Date(Date.now() - 60_000).toISOString(), "2099-01-01T00:00:00.000Z"]) {
      const fetchMock = stubApi(energy(refillAt));
      const { result, unmount } = renderHook(() => useEnergy(), { wrapper });
      await waitFor(() => expect(result.current.data).toBeDefined());
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(energyCalls(fetchMock)).toBe(1);
      unmount();
    }
  });

  it("a refresh loads the energy again", async () => {
    const fetchMock = stubApi(energy("2099-01-01T00:00:00.000Z"));
    const { result } = renderHook(() => ({ energy: useEnergy(), refresh: useRefreshEnergy() }), { wrapper });
    await waitFor(() => expect(result.current.energy.data).toBeDefined());
    act(() => result.current.refresh());
    await waitFor(() => expect(energyCalls(fetchMock)).toBe(2));
  });
});
