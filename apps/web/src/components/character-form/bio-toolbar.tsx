"use client";

import type { RefObject } from "react";

type Wrap = { label: string; text: string; className: string; before: string; after: string };

const BUTTONS: Wrap[] = [
  { label: "Bold", text: "B", className: "font-bold", before: "**", after: "**" },
  { label: "Italic", text: "I", className: "italic", before: "*", after: "*" },
  { label: "Underline", text: "U", className: "underline", before: "<u>", after: "</u>" },
  { label: "Link", text: "Link", className: "text-xs", before: "[", after: "](https://)" },
];

/** B, I, U, and Link buttons. Each one puts Markdown around the selected text of the textarea. */
export function BioToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}) {
  function wrap(button: Wrap) {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    onChange(`${value.slice(0, start)}${button.before}${selected}${button.after}${value.slice(end)}`);
    // Select the same text again inside the new marks, after React writes the new value.
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + button.before.length, end + button.before.length);
    });
  }

  return (
    <div role="toolbar" aria-label="Formatting" className="flex gap-0.5 border-b border-line p-1.5">
      {BUTTONS.map((button) => (
        <button
          key={button.label}
          type="button"
          aria-label={button.label}
          className={`icon-btn size-8 rounded-lg ${button.className}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => wrap(button)}
        >
          {button.text}
        </button>
      ))}
    </div>
  );
}
