import type { ReactNode } from "react";

/** One part of an admin page: a heading, a short help text, the actions of the part, and its content. */
export function AdminSection({
  id,
  title,
  hint,
  actions,
  children,
}: {
  id: string;
  title: string;
  hint: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="m-0 text-base">
            {title}
          </h2>
          <p className="m-0 max-w-[64ch] text-[13px] text-muted">{hint}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/*
 * The price tables of the admin pages. On a wide screen they are normal tables. On a phone, each row is a block of
 * two lines: the switch, the name and Edit, then the radio and the three numbers, each with its own small label.
 */
export const PRICE_TABLE = "w-full min-w-[760px] border-collapse text-left max-[760px]:block max-[760px]:min-w-0";
export const PRICE_HEAD = "max-[760px]:hidden";
export const PRICE_BODY = "max-[760px]:block";
export const PRICE_ROW =
  "border-t border-line align-top max-[760px]:grid max-[760px]:grid-cols-[3.5rem_1fr_1fr_1fr] max-[760px]:gap-3 max-[760px]:p-4 max-[760px]:[grid-template-areas:'on_name_name_edit''pick_cost_markup_price']";
export const PRICE_EDIT_ROW = "appear bg-surface-2 max-[760px]:block";
export const PRICE_EDIT_CELL = "max-[760px]:block";
export const PRICE_CELL = {
  on: "py-3.5 pr-2 pl-4 max-[760px]:p-0 max-[760px]:[grid-area:on]",
  name: "max-w-[320px] py-3.5 pr-4 max-[760px]:max-w-none max-[760px]:min-w-0 max-[760px]:p-0 max-[760px]:[grid-area:name]",
  pick: "py-3.5 pr-4 text-center max-[760px]:p-0 max-[760px]:text-left max-[760px]:[grid-area:pick]",
  cost: "py-3.5 pr-4 tabular-nums max-[760px]:p-0 max-[760px]:[grid-area:cost]",
  markup: "py-3.5 pr-4 tabular-nums max-[760px]:p-0 max-[760px]:[grid-area:markup]",
  price: "py-3.5 pr-4 tabular-nums max-[760px]:p-0 max-[760px]:[grid-area:price]",
  edit: "py-3 pr-4 text-right max-[760px]:p-0 max-[760px]:[grid-area:edit]",
} as const;

/** The column name of a cell, shown only on a phone, where the table has no header row. */
export function PhoneLabel({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="hidden text-[11px] text-subtle max-[760px]:block">
      {children}
    </span>
  );
}
