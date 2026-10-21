"use client";

import type { MessageView } from "@wanderer/shared";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";

export interface MessageItemProps {
  message: Pick<MessageView, "role" | "content">;
  /** The name and the image of the speaker. */
  speaker: { name: string; src: string | null };
  /** True for the user's own messages: they get Edit and Delete. */
  editable?: boolean;
  /** True for the last AI reply when no stream runs. */
  canRegenerate?: boolean;
  onSave?: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRegenerate?: () => void;
}

/** One message: a round avatar, the name, and the text. The user's messages are grey bubbles. */
export function MessageItem({ message, speaker, editable, canRegenerate, onSave, onDelete, onRegenerate }: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = message.role === "user";

  async function save() {
    const content = draft.trim();
    if (!content || !onSave) {
      return;
    }
    try {
      await onSave(content);
      setEditing(false);
      setError(null);
    } catch {
      setError("The edit did not save. Try again.");
    }
  }

  async function remove() {
    try {
      await onDelete?.();
    } catch {
      setError("The message did not delete. Try again.");
    }
  }

  return (
    <article className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
      <Avatar name={speaker.name} src={speaker.src} size={36} />
      <div className={`flex min-w-0 max-w-[min(64ch,85%)] flex-col gap-1.5 ${mine ? "items-end" : ""}`}>
        <span className="text-sm font-semibold text-muted">{speaker.name}</span>
        {editing ? (
          <div className="flex w-full flex-col gap-2">
            <textarea
              aria-label="Edit message"
              className="field min-w-[min(48ch,70vw)]"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="pill pill-accent pill-sm" onClick={save}>
                Save
              </button>
              <button
                type="button"
                className="pill pill-ghost pill-sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.content);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`leading-[1.6] [overflow-wrap:anywhere] [&_em]:text-muted ${mine ? "rounded-[18px] bg-[var(--color-current)] px-4 py-2.5" : "text-[#e4e4e7]"}`}
          >
            <Markdown text={message.content} />
          </div>
        )}
        {!editing && (editable || canRegenerate) && (
          <div className="flex gap-1.5">
            {editable && (
              <>
                <button type="button" className="pill pill-ghost pill-sm" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              </>
            )}
            {canRegenerate && (
              <button type="button" className="pill pill-ghost pill-sm" onClick={onRegenerate}>
                Regenerate
              </button>
            )}
          </div>
        )}
        {confirming && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Delete this message">
            <span className="text-sm">Delete this message?</span>
            <button type="button" className="pill pill-danger pill-sm" onClick={remove}>
              Yes, delete
            </button>
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        )}
        {error && <p className="m-0 text-sm text-error">{error}</p>}
      </div>
    </article>
  );
}
