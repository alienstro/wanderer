"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EnergyView } from "@wanderer/shared";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

/** The key prefix of the energy query. A refresh with this prefix updates the card, the chat and the scene button. */
export const ENERGY_KEY = ["energy"] as const;

/** The API refills at 00:00 UTC. The page asks a little later, so the answer has the new balance. */
const AFTER_REFILL_MS = 1_000;
/** The shortest wait. A clock of the user that is ahead of the server shows the refill in the past. */
const MIN_WAIT_MS = 60_000;
/** The longest wait. A timer delay above about 24.8 days runs at once, so a longer wait makes a request loop. */
const MAX_WAIT_MS = 24 * 60 * 60 * 1_000;

/** The time to the next load: just after the refill, from 1 minute to 1 day. */
function refillWait(nextRefillAt: string): number {
  const wait = Date.parse(nextRefillAt) - Date.now() + AFTER_REFILL_MS;
  return Math.min(Math.max(wait, MIN_WAIT_MS), MAX_WAIT_MS);
}

/**
 * The energy balance of the signed-in user, from GET /energy. The key has the user and the proxy, so a new user or a
 * new model loads the energy again. The query loads again after the refill time and when the user comes back to the tab.
 */
export function useEnergy() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: [...ENERGY_KEY, me?.id ?? null, me?.activeProxy?.id ?? null],
    queryFn: () => apiFetch<EnergyView>("/energy"),
    enabled: Boolean(me),
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data ? refillWait(query.state.data.nextRefillAt) : false),
  });
}

/** Loads the energy again, such as after an action that spends energy. */
export function useRefreshEnergy(): () => void {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: ENERGY_KEY });
}
