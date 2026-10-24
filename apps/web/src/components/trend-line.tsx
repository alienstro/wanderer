const WIDTH = 100;
const HEIGHT = 32;

/** A small line of one number for each day. The card shows the total in text, so screen readers skip the line. */
export function TrendLine({ values, className = "" }: { values: number[]; className?: string }) {
  if (values.length === 0) {
    return null;
  }
  const max = Math.max(...values, 1);
  const y = (value: number) => HEIGHT - 1 - (value / max) * (HEIGHT - 2);
  // One day has one point, so the line goes across the full width at that height.
  const line =
    values.length === 1
      ? `0,${y(values[0] ?? 0)} ${WIDTH},${y(values[0] ?? 0)}`
      : values.map((value, index) => `${(index * WIDTH) / (values.length - 1)},${y(value)}`).join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`h-8 w-full overflow-visible ${className}`}
    >
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
