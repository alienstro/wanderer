"use client";

import type { MessageView } from "@wanderer/shared";
import { useState } from "react";
import { PencilIcon, RefreshIcon, TrashIcon } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/markdown";

export interface MessageItemProps {
  message: Pick<MessageView, "role" | "content">;
  /** The name of the speaker. Only a screen reader reads it. */
  speaker: { name: string };
  /** True for the user's own messages: they get Edit and Delete. */
  editable?: boolean;
  /** True for the last AI reply when no stream runs. */
  canRegenerate?: boolean;
  onSave?: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRegenerate?: () => void;
  /** True while the AI reply has no text yet: three moving dots show in place of the text. */
  typing?: boolean;
}

/**
 * One message: a round avatar, the name, and the text in a bubble. The AI bubble has an outline, and the
 * user's bubble is solid grey. The corner next to the avatar is less round, so the bubble points to the speaker.
 */
export function MessageItem({ message, speaker, editable, canRegenerate, onSave, onDelete, onRegenerate, typing }: MessageItemProps) {
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
    <article className={`flex ${mine ? "justify-end" : ""}`}>
      {/* Each box fits its text: the user's box up to 78% of the column, an AI reply up to 92%. The edit box takes that width. */}
      <div
        className={`flex min-w-0 flex-col gap-1 ${mine ? "max-w-[78%] items-end max-[760px]:max-w-[88%]" : "max-w-[92%] items-start"} ${editing ? "w-full" : ""}`}
      >
        <span className="sr-only">{speaker.name}</span>
        {editing ? (
          <div className="flex w-full flex-col gap-2">
            <textarea
              aria-label="Edit message"
              className="field w-full"
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
            className={`text-[14.5px] max-[760px]:text-[14px] max-[760px]:leading-[1.55] [overflow-wrap:anywhere] [&_em]:text-muted [&_p+p]:mt-3 ${
              mine ? "rounded-[16px_16px_4px_16px] bg-[#26262b] px-3.5 py-2.5 leading-[1.6]" : "rounded-[16px_16px_16px_4px] bg-white/[0.07] px-[15px] py-[11px] leading-[1.65] text-[#ececef]"
            }`}
          >
            {typing ? (
              // The message list is a live region, so the text below is announced. A second live region here would repeat it.
              <span className="typing">
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span className="sr-only">{speaker.name} is typing</span>
              </span>
            ) : (
              <Markdown text={message.content} />
            )}
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
