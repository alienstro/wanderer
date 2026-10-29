"use client";

import type { ReactNode } from "react";

export interface ComposerProps {
  /** The name of the character, for the fiction notice under the text box. */
  characterName: string;
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
export function Composer({ characterName, value, onChange, disabled, streaming, onSend, onStop, toolbar }: ComposerProps) {
  const text = value.trim();
  const canSend = !disabled && !streaming && text.length > 0;

  function send() {
    if (canSend) {
      onSend(text);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-2 rounded-[22px] bg-surface-2 p-2 max-[760px]:gap-1.5">
        <textarea
          aria-label="Message"
          className="min-h-[52px] w-full resize-y rounded-[16px] bg-[#2a2a2f] px-3.5 py-2.5 text-[14px] leading-[1.6] outline-none max-[760px]:min-h-[44px] max-[760px]:text-base max-[760px]:leading-[1.4]"
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
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{toolbar}</div>
          {streaming ? (
            <button type="button" className="pill pill-soft pill-sm-phone tap-target" onClick={onStop}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="grid size-[38px] flex-none cursor-pointer place-items-center rounded-full border-0 bg-accent text-black hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canSend}
              onClick={send}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              <span className="sr-only">Send</span>
            </button>
          )}
        </div>
      </div>
      <p className="m-0 text-center text-[11.5px] text-subtle">
        {characterName} is an AI character, not a real person. Treat everything they say as fiction.
      </p>
    </div>
  );
}
