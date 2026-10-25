"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKeyView, ProxyView } from "@wanderer/shared";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useRequireLogin } from "@/lib/use-require-login";
import { ApiKeysSection } from "./api-keys-section";
import { ProxyForm } from "./proxy-form";
import { ProxyList } from "./proxy-list";

/** The models settings: the saved API keys, the user's OpenAI-compatible proxies, and the active proxy. */
export function ModelsView() {
  const me = useRequireLogin();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProxyView | "new" | null>(null);
  const list = useQuery({
    queryKey: ["proxies"],
    queryFn: () => apiFetch<ProxyView[]>("/proxies"),
    enabled: me !== undefined,
  });
  const apiKeys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiFetch<ApiKeyView[]>("/api-keys"),
    enabled: me !== undefined,
  });

  // A change applies at once: the keys, the models, and the sidebar model card load again.
  // A key change also changes the models, which show the key name, and a model change changes the key counts.
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    void queryClient.invalidateQueries({ queryKey: ["proxies"] });
    void queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <div className="flex flex-col gap-8 px-7 pt-7 pb-20 max-[760px]:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Models</h1>
        <p className="m-0 max-w-[64ch] text-muted">
          Save your API keys one time, then add an OpenAI-compatible proxy that uses one. Wanderer keeps each key
          encrypted and never shows it again.
        </p>
      </div>
      {apiKeys.isError && <p className="m-0 text-error">Your API keys did not load. Reload the page.</p>}
      {apiKeys.data && <ApiKeysSection apiKeys={apiKeys.data} onChanged={refresh} />}
      {/* Each section has its own heading and its own Add button, so the keys and the models do not look like one list. */}
      <section className="flex flex-col gap-3" aria-labelledby="models-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="models-title" className="m-0 text-xl font-bold">
            Your models
          </h2>
          {editing === null && (
            <button type="button" className="pill pill-accent" onClick={() => setEditing("new")}>
              Add a model
            </button>
          )}
        </div>
        {editing !== null && apiKeys.data && (
          <ProxyForm
            key={editing === "new" ? "new" : editing.id}
            apiKeys={apiKeys.data}
            initial={editing === "new" ? undefined : editing}
            onKeyAdded={refresh}
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
      </section>
    </div>
  );
}
