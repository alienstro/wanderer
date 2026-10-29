export interface TabBarItem<Id extends string> {
  id: Id;
  label: string;
  /** A count after the label, such as the number of chats. */
  count?: number;
}

/**
 * The tabs of a profile page in the v2 design: centered labels over a line, with a short slanted accent bar under the
 * picked tab. Each tab controls the panel with the id `${idPrefix}-${id}`, and has the id `${idPrefix}-${id}-tab`.
 */
export function TabBar<Id extends string>({
  label,
  idPrefix,
  tabs,
  current,
  onPick,
}: {
  label: string;
  idPrefix: string;
  tabs: TabBarItem<Id>[];
  current: Id;
  onPick: (id: Id) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="mt-8 flex w-full justify-center gap-8 border-b border-surface-2">
      {tabs.map((item) => {
        const on = item.id === current;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}-${item.id}-tab`}
            aria-selected={on}
            aria-controls={`${idPrefix}-${item.id}`}
            onClick={() => onPick(item.id)}
            className={`relative inline-flex h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 ${on ? "text-[15px] font-bold text-white" : "text-sm font-medium text-subtle"}`}
          >
            {item.label}
            {item.count !== undefined && <span className="text-xs font-medium text-subtle">{item.count}</span>}
            <span
              aria-hidden="true"
              className={`absolute bottom-1.5 left-1/2 -ml-[11px] h-[3px] w-[22px] -skew-x-[20deg] rounded-sm ${on ? "bg-accent" : "bg-transparent"}`}
            />
          </button>
        );
      })}
    </div>
  );
}
