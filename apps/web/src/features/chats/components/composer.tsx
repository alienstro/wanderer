"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/** The text box grows with the text up to this height, then it scrolls. About 5 lines. */
const BOX_MAX_HEIGHT = 140;

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
  /** A round control on the left of the text box, such as the "Reply choices" switch. */
  leading?: ReactNode;
  /** Icon buttons on the right of the text box, before Send, such as "Generate scene". */
  toolbar?: ReactNode;
}

/**
 * The message bar of the chat: one compact row with the leading control, the text box, the tools and Send.
 * Enter sends, and Shift+Enter makes a new line. The text box starts with one line and grows with the text.
 */
export function Composer({ characterName, value, onChange, disabled, streaming, onSend, onStop, leading, toolbar }: ComposerProps) {
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const text = value.trim();
  const canSend = !disabled && !streaming && text.length > 0;

  // The height follows the text, so a sent message gives the box its one line back.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) {
      box.style.height = "auto";
      box.style.height = `${Math.min(box.scrollHeight, BOX_MAX_HEIGHT)}px`;
    }
  }, [value]);

  function send() {
    if (canSend) {
      onSend(text);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1.5 rounded-[26px] bg-surface-2 p-1.5 max-[760px]:gap-1">
        {leading && <div className="flex flex-none items-center self-stretch">{leading}</div>}
        <textarea
          ref={boxRef}
          aria-label="Message"
          className="min-h-11 min-w-0 flex-1 resize-none rounded-[20px] bg-[#2a2a2f] px-4 py-[11px] text-[14px] leading-[1.55] outline-none max-[760px]:text-base max-[760px]:leading-[1.4]"
          rows={1}
          value={value}
          placeholder="Write a message"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="flex flex-none items-center gap-0.5 self-stretch">
          {toolbar}
          {streaming ? (
            <button type="button" className="composer-send tap-target" onClick={onStop}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="sr-only">Stop</span>
            </button>
          ) : (
            <button type="button" className="composer-send tap-target" disabled={!canSend} onClick={send}>
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
