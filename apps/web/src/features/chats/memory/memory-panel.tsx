"use client";

import { AI_ERROR_TEXT, type ChatMemory, isAiErrorCode, MEMORY_MAX, type MemoryDraftResponse } from "@wanderer/shared";
import { useId, useState } from "react";
import { Modal, ModalClose, useCloseModal } from "@/components/ui/modal";
import { energyLowText, useRefreshEnergy } from "@/features/energy";
import { ApiError, apiFetch } from "@/lib/api";

function errorText(error: unknown, fallback: string): string {
  const energyLow = energyLowText(error, "memory");
  if (energyLow) {
    return energyLow;
  }
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

/** The Memory button. It opens a panel where the user reads, edits and saves the memory. `label` is the button text. */
export function MemoryButton({ label = "Memory", ...props }: MemoryProps & { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pill pill-soft pill-sm-phone tap-target" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Modal title="Memory" variant="sheet" onClose={() => setOpen(false)}>
          <MemoryForm {...props} />
        </Modal>
      )}
    </>
  );
}

/** The body of the Memory panel. Save and Cancel close the panel with the close animation. */
function MemoryForm({ chatId, memory, onSaved }: MemoryProps) {
  const close = useCloseModal();
  const boxId = useId();
  const [text, setText] = useState(memory.text);
  // The marker of the last draft. Save sends it only when the text comes from a draft.
  const [draftThrough, setDraftThrough] = useState<number | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshEnergy = useRefreshEnergy();
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
      // A draft that calls the model costs energy, and a failure gives it back.
      refreshEnergy();
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<ChatMemory>(path, { method: "PATCH", body: JSON.stringify(panelBody()) });
      onSaved(result);
      close();
    } catch (caught) {
      setError(errorText(caught, "The memory was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
        <ModalClose>Cancel</ModalClose>
      </div>
    </>
  );
}
