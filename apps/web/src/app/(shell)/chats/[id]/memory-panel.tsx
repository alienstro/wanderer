"use client";

import { AI_ERROR_TEXT, type ChatMemory, isAiErrorCode, MEMORY_MAX, type MemoryDraftResponse } from "@wanderer/shared";
import { useId, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && isAiErrorCode(error.code)) {
    return AI_ERROR_TEXT[error.code];
  }
  return fallback;
}

interface MemoryProps {
  chatId: string;
  memory: ChatMemory;
  /** Gets the saved memory, so the page can update its copy of the chat. */
  onSaved: (memory: ChatMemory) => void;
}

/** The Memory button of the chat header. It opens a panel where the user reads, edits and saves the memory. */
export function MemoryButton(props: MemoryProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pill pill-soft pill-sm-phone tap-target ml-auto" onClick={() => setOpen(true)}>
        Memory
      </button>
      {open && <MemoryPanel {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function MemoryPanel({ chatId, memory, onSaved, onClose }: MemoryProps & { onClose: () => void }) {
  const titleId = useId();
  const boxId = useId();
  const [text, setText] = useState(memory.text);
  // The marker of the last draft. Save sends it only when the text comes from a draft.
  const [draftThrough, setDraftThrough] = useState<number | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = text.length > MEMORY_MAX;
  const path = `/chats/${encodeURIComponent(chatId)}/memory`;

  /** The text, and the draft marker only when the text comes from a draft. */
  function panelBody() {
    return draftThrough === undefined ? { memory: text } : { memory: text, throughPosition: draftThrough };
  }

  async function summarize() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // The body keeps the unsaved text and the draft marker, so the draft does not lose them.
      const draft = await apiFetch<MemoryDraftResponse>(`${path}/summarize`, {
        method: "POST",
        body: JSON.stringify(panelBody()),
      });
      const through = draftThrough === undefined ? memory.throughPosition : draftThrough;
      if (draft.memory === text && draft.throughPosition === through) {
        setNote("No new messages to summarize.");
        return;
      }
      setText(draft.memory);
      setDraftThrough(draft.throughPosition);
      setNote("Draft, not saved");
    } catch (caught) {
      setError(errorText(caught, "The summary did not work. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<ChatMemory>(path, { method: "PATCH", body: JSON.stringify(panelBody()) });
      onSaved(result);
      onClose();
    } catch (caught) {
      setError(errorText(caught, "The memory was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60 max-[760px]:items-end" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-[460px] flex-col gap-4 panel p-5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] max-[760px]:h-auto max-[760px]:max-h-[85dvh] max-[760px]:max-w-none"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <h2 id={titleId} className="m-0 text-lg font-bold">
          Memory
        </h2>
        <p className="m-0 text-sm text-muted">
          The character keeps these facts after old messages leave the chat history. Summarize writes a draft from
          the old messages. Nothing changes until you save.
        </p>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <label htmlFor={boxId} className="label">
            Memory text
          </label>
          <textarea
            id={boxId}
            className="field min-h-[200px] flex-1"
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          {over ? (
            <span role="alert" className="hint text-error">
              {text.length} / {MEMORY_MAX}. Make the text shorter.
            </span>
          ) : (
            <span className="hint">
              {text.length} / {MEMORY_MAX}
            </span>
          )}
        </div>
        {note && <p className="m-0 text-[13px] text-muted">{note}</p>}
        {error && (
          <p role="alert" className="m-0 text-[13px] text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="pill pill-soft" onClick={() => void summarize()} disabled={busy}>
            Summarize
          </button>
          <button type="button" className="pill pill-accent" onClick={() => void save()} disabled={busy || over}>
            Save
          </button>
          <button type="button" className="pill pill-soft" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
