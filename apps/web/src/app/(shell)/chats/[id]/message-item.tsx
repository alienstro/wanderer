"use client";

import type { MessageView } from "@wanderer/shared";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { PencilIcon, RefreshIcon, TrashIcon } from "@/components/icons";
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

/**
 * One message: a round avatar, the name, and the text in a bubble. The AI bubble has an outline, and the
 * user's bubble is solid grey. The corner next to the avatar is less round, so the bubble points to the speaker.
 */
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
      <div className={`flex min-w-0 max-w-[min(62ch,85%)] flex-col gap-1.5 ${mine ? "items-end" : ""}`}>
        <span className="text-[13px] font-semibold text-muted">{speaker.name}</span>
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
            className={`px-4 text-[15px] leading-[1.65] [overflow-wrap:anywhere] [&_em]:text-muted [&_p+p]:mt-3 ${
              mine ? "rounded-[20px_6px_20px_20px] bg-[#26262b] py-2.5" : "rounded-[6px_20px_20px_20px] border border-line bg-surface py-3 text-[#ececee]"
            }`}
          >
            <Markdown text={message.content} />
          </div>
        )}
        {!editing && (editable || canRegenerate) && (
          // The negative margin lines the first icon up with the edge of the bubble.
          <div className={`flex gap-0.5 ${mine ? "-mr-2.5" : "-ml-2.5"}`}>
            {editable && (
              <>
                <button type="button" className="msg-action" onClick={() => setEditing(true)}>
                  <PencilIcon />
                  Edit
                </button>
                <button type="button" className="msg-action" onClick={() => setConfirming(true)}>
                  <TrashIcon />
                  Delete
                </button>
              </>
            )}
            {canRegenerate && (
              <button type="button" className="msg-action" onClick={onRegenerate}>
                <RefreshIcon />
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
