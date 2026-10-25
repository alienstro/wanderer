"use client";

import Link from "next/link";
import { EnergyMeter, EnergyRailLink, useEnergy } from "@/features/energy";
import { useMe } from "@/lib/query-provider";

/**
 * The active model of the user and the energy, with a link to the models settings. A visitor sees nothing. The rail
 * shows only the energy icon.
 */
export function ModelCard() {
  const { data: me } = useMe();
  const { data: energy } = useEnergy();
  if (!me) {
    return null;
  }
  const proxy = me.activeProxy;
  const freeModelName = energy?.model === "free" ? energy.freeModelName : null;
  return (
    <>
      <Link href="/settings/models" className="flex flex-col gap-0.5 rounded-xl bg-surface px-3.5 py-2.5 transition-colors hover:bg-hover active:bg-(--color-current) rail:hidden">
        <span className="text-xs text-subtle">Model</span>
        {proxy ? (
          <>
            <span className="truncate font-semibold">{proxy.name}</span>
            <span className="truncate text-sm text-muted">{proxy.model}</span>
          </>
        ) : freeModelName ? (
          <span className="truncate font-semibold">Free · {freeModelName}</span>
        ) : (
          <span className="font-semibold text-link">Add a model</span>
        )}
        {energy && <EnergyMeter energy={energy} />}
      </Link>
      {energy && <EnergyRailLink energy={energy} />}
    </>
  );
}
