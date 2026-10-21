"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChoicesResponse, MeResponse } from "@wanderer/shared";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Four short replies above the text box. A new AI reply (a new round) asks for a new set. A click sends
 * that reply at once. An error hides the choices with no message, because the chat still works.
 */
export function ReplyChoices({
  chatId,
  round,
  visible,
  onPick,
}: {
  chatId: string;
  /** Goes up by one after each AI reply that came in full. 0 means no reply in this visit yet. */
  round: number;
  visible: boolean;
  onPick: (text: string) => void;
}) {
  const [nonce, setNonce] = useState(0);
  const query = useQuery({
    queryKey: ["choices", chatId, round, nonce],
    queryFn: () => apiFetch<ChoicesResponse>(`/chats/${chatId}/choices`, { method: "POST" }),
    enabled: visible && round > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!visible || round === 0 || !query.data) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Reply choices">
      {query.data.choices.map((choice) => (
        <button key={choice} type="button" className="pill pill-soft pill-sm max-w-full text-left whitespace-normal" onClick={() => onPick(choice)}>
          {choice}
        </button>
      ))}
      <button type="button" className="pill pill-ghost pill-sm" onClick={() => setNonce((value) => value + 1)}>
        New choices
      </button>
    </div>
  );
}

/** The "Reply choices" switch in the bar of the text box. The setting stays for the user. */
export function ReplyChoicesSwitch({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const on = me.replyChoicesOn;

  async function toggle() {
    const next = !on;
    // The switch changes at once. A failed save puts the old value back.
    queryClient.setQueryData<MeResponse>(["me"], (current) => current && { ...current, replyChoicesOn: next });
    try {
      queryClient.setQueryData(["me"], await apiFetch<MeResponse>("/me", { method: "PATCH", body: JSON.stringify({ replyChoicesOn: next }) }));
    } catch {
      queryClient.setQueryData<MeResponse>(["me"], (current) => current && { ...current, replyChoicesOn: on });
    }
  }

  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <button type="button" role="switch" aria-checked={on} aria-label="Reply choices" className="switch" onClick={toggle}>
        <span className="track">
          <span className="knob" />
        </span>
      </button>
      Reply choices
    </span>
  );
}
