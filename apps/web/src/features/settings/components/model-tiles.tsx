"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FreeModelView, ProxyView } from "@wanderer/shared";
import Link from "next/link";
import { useId, useState } from "react";
import { ENERGY_KEY } from "@/features/energy";
import { apiFetch } from "@/lib/api";

interface Tile {
  id: string;
  name: string;
  hint: string;
  side: string;
  active: boolean;
  /** The API path that makes this model the active one. */
  activatePath: string;
}

/**
 * The Model box of Settings, as in the v2 design: one tile for each free model and each own model, and a dashed tile
 * that opens the models page. A pick makes that model write the next reply. The tiles are real radio buttons, so the
 * arrow keys move between them.
 */
export function ModelTiles() {
  const name = useId();
  const queryClient = useQueryClient();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const free = useQuery({ queryKey: ["free-models"], queryFn: () => apiFetch<FreeModelView[]>("/free-models") });
  const own = useQuery({ queryKey: ["proxies"], queryFn: () => apiFetch<ProxyView[]>("/proxies") });

  const tiles: Tile[] = [
    ...(own.data ?? []).map((proxy) => ({
      id: `proxy-${proxy.id}`,
      name: proxy.name,
      hint: proxy.model,
      side: `Key ends in ${proxy.savedKey.keyLast4}`,
      active: proxy.isActive,
      activatePath: `/proxies/${encodeURIComponent(proxy.id)}/activate`,
    })),
    ...(free.data ?? []).map((model) => ({
      id: `free-${model.id}`,
      name: model.displayName,
      hint: "Free model. No API key needed.",
      side: `${model.energyPrice} energy for each reply`,
      // An own active model writes the replies, so no free model is active then.
      active: model.isActive && !(own.data ?? []).some((proxy) => proxy.isActive),
      activatePath: `/free-models/${encodeURIComponent(model.id)}/activate`,
    })),
  ];

  async function pick(tile: Tile) {
    setBusy(true);
    setError(false);
    try {
      await apiFetch(tile.activatePath, { method: "POST" });
      // The sidebar model card, the energy and both lists show the new model.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["free-models"] }),
        queryClient.invalidateQueries({ queryKey: ["proxies"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ENERGY_KEY }),
      ]);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Model" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
        {tiles.map((tile) => (
          <label
            key={tile.id}
            className={`flex cursor-pointer flex-col gap-2.5 rounded-[14px] border-[1.5px] bg-surface p-3.5 hover:border-[#3a3a42] has-focus-visible:outline-2 has-focus-visible:outline-focus ${tile.active ? "border-accent" : "border-line"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{tile.name}</span>
              <input
                type="radio"
                name={name}
                checked={tile.active}
                disabled={busy}
                onChange={() => void pick(tile)}
                className="size-[18px] flex-none accent-accent"
              />
            </span>
            <span className="text-xs break-all text-subtle">{tile.hint}</span>
            <span className="text-xs font-semibold text-[#c4c4cc]">{tile.side}</span>
          </label>
        ))}
        <Link
          href="/settings/models"
          className="flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-field-line font-semibold text-[#c4c4cc] no-underline hover:border-[#3a3a42]"
        >
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-surface-2 text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          Add a model
        </Link>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          The model did not change. Try again.
        </p>
      )}
    </div>
  );
}
