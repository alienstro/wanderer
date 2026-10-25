"use client";

import Link from "next/link";
import { useMe } from "@/lib/query-provider";

/** The active model of the user, with a link to the models settings. A visitor and the rail show nothing. */
export function ModelCard() {
  const { data: me } = useMe();
  if (!me) {
    return null;
  }
  const proxy = me.activeProxy;
  return (
    <Link href="/settings/models" className="flex flex-col gap-0.5 rounded-xl bg-surface px-3.5 py-2.5 hover:bg-hover rail:hidden">
      <span className="text-xs text-subtle">Model</span>
      {proxy ? (
        <>
          <span className="truncate font-semibold">{proxy.name}</span>
          <span className="truncate text-sm text-muted">{proxy.model}</span>
        </>
      ) : (
        <span className="font-semibold text-link">Add a model</span>
      )}
    </Link>
  );
}
