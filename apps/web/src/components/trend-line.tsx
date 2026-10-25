"use client";

import { type KeyboardEvent, type PointerEvent, useState } from "react";

const WIDTH = 100;
const HEIGHT = 36;
const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 25" for the day 2026-10-25. */
function dayLabel(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

interface TrendLineProps {
  /** The name of the number, such as "New users". */
  label: string;
  /** One date for each value, such as 2026-10-25, the oldest first. */
  days: string[];
  values: number[];
  /** The color class of the last day, such as "text-link". The line before it stays grey. */
  accent: string;
}

/**
 * A small line of one number for each day. A pointer or the arrow keys show the number of one day.
 * Screen readers get all the days in the label.
 */
export function TrendLine({ label, days, values, accent }: TrendLineProps) {
  const [active, setActive] = useState<number | null>(null);
  if (values.length === 0) {
    return null;
  }
  const last = values.length - 1;
  const max = Math.max(...values, 1);
  const x = (index: number) => (last === 0 ? WIDTH : (index * WIDTH) / last);
  const y = (value: number) => HEIGHT - 2 - (value / max) * (HEIGHT - 4);
  // One day has one point, so the line goes across the full width at that height.
  const points =
    last === 0
      ? `0,${y(values[0] ?? 0)} ${WIDTH},${y(values[0] ?? 0)}`
      : values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const names = days.map((day, index) => `${dayLabel(day)}: ${values[index] ?? 0}`);
  const shown = active ?? last;

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) {
      setActive(Math.round(((event.clientX - box.left) / box.width) * last));
    }
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step !== 0) {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, shown + step)));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg
          role="img"
          aria-label={`${label} each day: ${names.join(", ")}`}
          tabIndex={0}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="block h-9 w-full cursor-crosshair overflow-visible rounded-[4px] outline-offset-4 focus-visible:outline-2 focus-visible:outline-focus"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="text-[#4a4a54]"
          />
        </svg>
        {/* The marks are HTML, so the stretched viewBox does not stretch them. */}
        {active !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-[#3a3a42]"
            style={{ left: `${x(shown)}%` }}
          />
        )}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-surface ${active === null ? accent : "text-text"}`}
          style={{ left: `${x(shown)}%`, top: `${(y(values[shown] ?? 0) / HEIGHT) * 100}%` }}
        />
      </div>
      <div aria-hidden={active === null} className="flex justify-between gap-2 text-[11px] text-subtle tabular-nums">
        {active === null ? (
          <>
            <span>{dayLabel(days[0] ?? "")}</span>
            {last > 0 && <span>{dayLabel(days[last] ?? "")}</span>}
          </>
        ) : (
          <span className="font-medium text-text">{names[active]}</span>
        )}
      </div>
    </div>
  );
}
