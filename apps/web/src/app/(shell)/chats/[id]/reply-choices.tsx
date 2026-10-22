"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChoicesResponse, MeResponse } from "@wanderer/shared";
import { useState } from "react";
import { RefreshIcon } from "@/components/icons";
import { apiFetch } from "@/lib/api";

export interface ReplyChoicesState {
  /** The current set, or null when there is none to show. */
  choices: string[] | null;
  /** True while a set loads. */
  loading: boolean;
  /** Asks for a new set. */
  refresh: () => void;
}

/**
 * The four short replies for the last AI reply. A new AI reply (a new round) asks for a new set.
 * An error gives no set and no message, because the chat still works.
 */
export function useReplyChoices(chatId: string, round: number, visible: boolean): ReplyChoicesState {
  const [nonce, setNonce] = useState(0);
  const enabled = visible && round > 0;
  const query = useQuery({
    queryKey: ["choices", chatId, round, nonce],
    queryFn: () => apiFetch<ChoicesResponse>(`/chats/${chatId}/choices`, { method: "POST" }),
    enabled,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  return {
    choices: enabled && query.data ? query.data.choices : null,
    loading: enabled && query.isLoading,
    refresh: () => setNonce((value) => value + 1),
  };
}

/** Shows the *action* parts of a choice in italic, as the messages do, without the asterisks. */
function ChoiceText({ text }: { text: string }) {
  return text
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((part, index) => (part.length > 2 && part.startsWith("*") && part.endsWith("*") ? <em key={index}>{part.slice(1, -1)}</em> : part));
}

/** The choices above the text box, in two columns. A click sends that reply at once. */
export function ReplyChoices({ state, onPick }: { state: ReplyChoicesState; onPick: (text: string) => void }) {
  if (!state.loading && !state.choices) {
    return null;
  }
  return (
    <div
      className="grid grid-cols-2 gap-2 max-[640px]:grid-cols-1"
      role="group"
      aria-label="Reply choices"
      aria-busy={state.loading}
    >
      {state.choices
        ? state.choices.map((choice) => (
            <button key={choice} type="button" className="choice" onClick={() => onPick(choice)}>
              <ChoiceText text={choice} />
            </button>
          ))
        : [0, 1, 2, 3].map((slot) => <div key={slot} className="choice-placeholder" aria-hidden="true" />)}
    </div>
  );
}

/** The "New choices" button in the bar of the text box. It shows only when a set shows. */
export function NewChoicesButton({ state }: { state: ReplyChoicesState }) {
  if (!state.choices) {
    return null;
  }
  return (
    <button type="button" className="msg-action" onClick={state.refresh}>
      <RefreshIcon />
      New choices
    </button>
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
