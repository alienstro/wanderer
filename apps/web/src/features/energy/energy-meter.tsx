import type { EnergyView } from "@wanderer/shared";
import Link from "next/link";
import { BoltIcon } from "@/components/ui/icons";
import { refillTimeText } from "./energy-text";

/** A user with an own model spends energy only on scene images. */
function energyLabel(energy: EnergyView): string {
  return energy.model === "free" ? "Energy" : "Energy for scenes";
}

/** The part of the bar that the balance fills, from 0% to 100%. An admin can give more than the daily amount. */
function fillPercent(energy: EnergyView): number {
  if (energy.dailyEnergy <= 0) {
    return 0;
  }
  return Math.min(Math.max((energy.balance / energy.dailyEnergy) * 100, 0), 100);
}

/** The energy lines of the model card: the label and "12 / 50", a bar, and the refill time. */
export function EnergyMeter({ energy }: { energy: EnergyView }) {
  const percent = fillPercent(energy);
  return (
    <span className="mt-1.5 flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-xs text-subtle">{energyLabel(energy)}</span>
        <span className="font-semibold">
          {energy.balance} / {energy.dailyEnergy}
        </span>
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-field-line">
        <span
          role="meter"
          aria-label="Energy"
          aria-valuemin={0}
          aria-valuemax={energy.dailyEnergy}
          aria-valuenow={Math.min(energy.balance, energy.dailyEnergy)}
          className="block h-full rounded-full bg-accent"
          style={{ width: `${Math.round(percent)}%` }}
        />
      </span>
      <span className="text-xs text-subtle">Refills at {refillTimeText(energy.nextRefillAt)}</span>
    </span>
  );
}

/** The energy in the rail: an icon and the balance. The label shows the full text on hover and on keyboard focus. */
export function EnergyRailLink({ energy }: { energy: EnergyView }) {
  return (
    <Link href="/settings/models" className="nav hidden flex-col gap-0 rail:flex">
      <BoltIcon />
      <span aria-hidden="true" className="text-[11px] leading-none">
        {energy.balance}
      </span>
      <span className="side-label">
        {energyLabel(energy)} {energy.balance} / {energy.dailyEnergy}. Refills at {refillTimeText(energy.nextRefillAt)}.
      </span>
    </Link>
  );
}
