"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProxyView } from "@wanderer/shared";
import { useState } from "react";
import { ProxyForm } from "@/components/proxy-form";
import { ProxyList } from "@/components/proxy-list";
import { apiFetch } from "@/lib/api";
import { useRequireLogin } from "@/lib/use-require-login";

/** The models settings: the user's OpenAI-compatible proxies and the active proxy. */
export default function ModelsPage() {
  const me = useRequireLogin();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProxyView | "new" | null>(null);
  const list = useQuery({
    queryKey: ["proxies"],
    queryFn: () => apiFetch<ProxyView[]>("/proxies"),
    enabled: me !== undefined,
  });

  // A change applies at once: the list and the sidebar model card load again.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["proxies"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="flex flex-col gap-6 px-7 pt-7 pb-20 max-[760px]:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="page-title">Models</h1>
          <p className="m-0 max-w-[64ch] text-muted">
            Add an OpenAI-compatible proxy with your own API key. Wanderer keeps the key encrypted and never shows it
            again.
          </p>
        </div>
        {editing === null && (
          <button type="button" className="pill pill-accent" onClick={() => setEditing("new")}>
            Add a model
          </button>
        )}
      </div>
      {editing !== null && (
        <ProxyForm
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {list.isError && <p className="m-0 text-error">Your models did not load. Reload the page.</p>}
      {list.data && list.data.length === 0 && editing === null && (
        <div className="flex flex-col items-center gap-2.5 panel px-6 py-14 text-center">
          <p className="m-0 text-[17px] font-semibold">You have no models yet.</p>
          <p className="m-0 text-muted">Add a proxy to start chatting.</p>
        </div>
      )}
      {list.data && list.data.length > 0 && <ProxyList proxies={list.data} onEdit={setEditing} onChanged={refresh} />}
    </div>
  );
}
