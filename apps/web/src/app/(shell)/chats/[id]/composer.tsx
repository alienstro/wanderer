"use client";

import type { ReactNode } from "react";

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** True when the user cannot send now, for example with no active proxy. */
  disabled: boolean;
  /** True while a reply streams. Send changes to Stop. */
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Controls in the bar of the text box, such as the "Reply choices" switch. */
  toolbar?: ReactNode;
}

/** The text box of the chat. Enter sends, and Shift+Enter makes a new line. */
export function Composer({ value, onChange, disabled, streaming, onSend, onStop, toolbar }: ComposerProps) {
  const text = value.trim();
  const canSend = !disabled && !streaming && text.length > 0;

  function send() {
    if (canSend) {
      onSend(text);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-field-line bg-surface p-3">
      <textarea
        aria-label="Message"
        className="min-h-[52px] w-full resize-y bg-transparent leading-[1.6] outline-none"
        rows={2}
        value={value}
        placeholder="Write a message. Use *asterisks* for an action."
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">{toolbar}</div>
        {streaming ? (
          <button type="button" className="pill pill-soft" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" className="pill pill-accent" disabled={!canSend} onClick={send}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
