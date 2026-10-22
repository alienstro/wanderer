"use client";

import { OPENINGS_MAX } from "@wanderer/shared";
import { useId, useState } from "react";
import { Markdown } from "../markdown";

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** The first messages of a character: one tab for each message, 1 to 10 tabs. */
export function OpeningsEditor({
  value,
  onChange,
  describedBy,
}: {
  value: string[];
  onChange: (openings: string[]) => void;
  describedBy?: string;
}) {
  const [current, setCurrent] = useState(0);
  const [preview, setPreview] = useState(false);
  const textId = useId();
  const index = Math.min(current, value.length - 1);

  function update(next: string[], nextIndex: number) {
    onChange(next);
    setCurrent(nextIndex);
  }

  function move(to: number) {
    const next = [...value];
    [next[index], next[to]] = [next[to] ?? "", next[index] ?? ""];
    update(next, to);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Initial messages" className="flex flex-wrap items-center gap-1.5">
        {value.map((_, i) => (
          <button key={i} type="button" className="chip" aria-pressed={i === index} onClick={() => setCurrent(i)}>
            Message {i + 1}
          </button>
        ))}
        <button
          type="button"
          className="chip gap-1.5"
          aria-label="Add a message"
          disabled={value.length >= OPENINGS_MAX}
          onClick={() => update([...value, ""], value.length)}
        >
          <svg {...ICON}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      </div>
      <div className="rounded-xl border border-field-line bg-surface">
        <div className="flex flex-wrap items-center gap-1 border-b border-line p-1.5">
          <button type="button" className="seg" aria-pressed={!preview} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" className="seg" aria-pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </button>
          <span className="flex-auto" />
          <button type="button" className="icon-btn size-[30px]" aria-label="Move left" disabled={index === 0} onClick={() => move(index - 1)}>
            <svg {...ICON}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn size-[30px]"
            aria-label="Move right"
            disabled={index === value.length - 1}
            onClick={() => move(index + 1)}
          >
            <svg {...ICON}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn size-[30px]"
            aria-label="Delete this message"
            disabled={value.length <= 1}
            onClick={() => update(value.filter((_, i) => i !== index), Math.max(0, index - 1))}
          >
            <svg {...ICON}>
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </div>
        {preview ? (
          <div className="min-h-[116px] px-3.5 pt-3 pb-4 text-[15px] leading-[1.65]">
            <Markdown text={value[index] ?? ""} />
          </div>
        ) : (
          <>
            <label htmlFor={textId} className="sr-only">
              Message {index + 1} text
            </label>
            <textarea
              id={textId}
              className="field border-0 bg-transparent shadow-none focus:shadow-none"
              rows={5}
              value={value[index] ?? ""}
              aria-describedby={describedBy}
              placeholder={'*She looks up from the bar.* "Welcome, traveler. What brings you here?"'}
              onChange={(event) => onChange(value.map((text, i) => (i === index ? event.target.value : text)))}
            />
          </>
        )}
      </div>
    </div>
  );
}
