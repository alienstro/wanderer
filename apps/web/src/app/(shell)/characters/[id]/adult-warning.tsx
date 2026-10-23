"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { MeResponse } from "@wanderer/shared";
import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/query-provider";

/** The page for an 18+ character that the viewer cannot see yet. A user can confirm the age here. */
export function AdultWarning({ onConfirmed }: { onConfirmed: () => void }) {
  const { data: me, isPending } = useMe();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(false);
    try {
      const updated = await apiFetch<MeResponse>("/me/adult-confirm", { method: "POST" });
      queryClient.setQueryData(["me"], updated);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
      onConfirmed();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <section className="flex max-w-[520px] flex-col items-start gap-3 panel p-7">
      <h1 className="m-0 text-2xl font-bold">This character is 18+.</h1>
      <p className="m-0 text-muted">This character has adult content. You must be 18 or older to see it.</p>
      {isPending ? null : me ? (
        <button type="button" className="pill pill-accent" disabled={busy} onClick={() => void confirm()}>
          I am 18 or older. Show 18+ content.
        </button>
      ) : (
        <Link href="/login" className="pill pill-accent">
          Log in to continue.
        </Link>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          The setting was not saved. Try again.
        </p>
      )}
    </section>
  );
}
