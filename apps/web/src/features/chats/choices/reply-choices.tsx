"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChoicesResponse, MeResponse } from "@wanderer/shared";
import { useState } from "react";
import { RefreshIcon } from "@/components/ui/icons";
import { useRefreshEnergy } from "@/features/energy";
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
  const refreshEnergy = useRefreshEnergy();
  const enabled = visible && round > 0;
  const query = useQuery({
    queryKey: ["choices", chatId, round, nonce],
    queryFn: async () => {
      try {
        return await apiFetch<ChoicesResponse>(`/chats/${chatId}/choices`, { method: "POST" });
      } finally {
        // A set of choices on a free model costs energy, and a failure gives it back.
        refreshEnergy();
      }
    },
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
      className="flex flex-col gap-1.5"
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
        : [0, 1, 2, 3].map((slot) => (
            <div key={slot} className="choice-placeholder" aria-hidden="true">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          ))}
      {state.loading && (
        <span role="status" className="sr-only">
          Loading reply choices
        </span>
      )}
    </div>
  );
}

/** The "New choices" button in the bar of the text box. It shows only when a set shows. */
export function NewChoicesButton({ state }: { state: ReplyChoicesState }) {
  if (!state.choices) {
    return null;
  }
  return (
    <button type="button" className="composer-tool" title="New choices" onClick={state.refresh}>
      <RefreshIcon />
      <span className="sr-only">New choices</span>
    </button>
  );
}

/** A light bulb with a bolt, the icon of the Reply choices switch. */
function BulbIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
      <path d="m12.5 7-2 3h3l-2 3" />
    </svg>
  );
}

/** The "Reply choices" switch on the left of the text box: a light bulb that is blue when the choices are on. The setting stays for the user. */
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Reply choices"
      title={on ? "Reply choices are on" : "Reply choices are off"}
      className="composer-tool"
      onClick={toggle}
    >
      <BulbIcon />
    </button>
  );
}
