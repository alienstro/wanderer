"use client";

import type { ProxyTestResult, ProxyView } from "@wanderer/shared";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

function TestResult({ result }: { result: ProxyTestResult | "running" }) {
  if (result === "running") {
    return <p className="m-0 text-muted">Testing…</p>;
  }
  return result.ok ? (
    <p className="m-0 text-muted">
      The proxy answered “{result.reply}” in {result.latencyMs} ms.
    </p>
  ) : (
    <p className="m-0 text-error">{result.message}</p>
  );
}

function ProxyRow({ proxy, onEdit, onChanged }: { proxy: ProxyView; onEdit: () => void; onChanged: () => void }) {
  const [test, setTest] = useState<ProxyTestResult | "running" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, failText: string) {
    setError(null);
    try {
      await action();
      onChanged();
    } catch {
      setError(failText);
    }
  }

  async function runTest() {
    setTest("running");
    try {
      setTest(await apiFetch<ProxyTestResult>(`/proxies/${proxy.id}/test`, { method: "POST" }));
    } catch {
      setTest({ ok: false, error: "provider_error", message: "The test did not run. Try again." });
    }
  }

  return (
    <li className="flex flex-col gap-2.5 panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-semibold">
            {proxy.name}
            {proxy.isActive && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">Active</span>}
          </span>
          <span className="truncate text-sm text-muted">
            {proxy.model} · {proxy.savedKey.name} ••••{proxy.savedKey.keyLast4}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {!proxy.isActive && (
            <button
              type="button"
              className="pill pill-accent pill-sm"
              onClick={() => run(() => apiFetch(`/proxies/${proxy.id}/activate`, { method: "POST" }), "The proxy did not change.")}
            >
              Use
            </button>
          )}
          <button type="button" className="pill pill-soft pill-sm" onClick={runTest}>
            Test
          </button>
          <button type="button" className="pill pill-soft pill-sm" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label={`Delete ${proxy.name}`}>
          <span>Delete {proxy.name}? You cannot undo this.</span>
          <button
            type="button"
            className="pill pill-danger pill-sm"
            onClick={() => run(() => apiFetch(`/proxies/${proxy.id}`, { method: "DELETE" }), "The proxy did not delete.")}
          >
            Yes, delete
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      )}
      {test && <TestResult result={test} />}
      {error && <p className="m-0 text-error">{error}</p>}
    </li>
  );
}

/** The saved proxies of the user, with Use, Test, Edit, and Delete. */
export function ProxyList({
  proxies,
  onEdit,
  onChanged,
}: {
  proxies: ProxyView[];
  onEdit: (proxy: ProxyView) => void;
  onChanged: () => void;
}) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {proxies.map((proxy) => (
        <ProxyRow key={proxy.id} proxy={proxy} onEdit={() => onEdit(proxy)} onChanged={onChanged} />
      ))}
    </ul>
  );
}
