"use client";

import {
  COMMENT_REPORT_REASONS,
  REPORT_NOTE_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@wanderer/shared";
import { type FormEvent, useId, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ApiError, apiFetch } from "@/lib/api";

/** A report is about a character or about a comment. */
type ReportTarget = { characterId: string; commentId?: never } | { commentId: string; characterId?: never };

/** The route, the words, and the reasons for each kind of report. */
function targetOf(target: ReportTarget) {
  return target.commentId !== undefined
    ? {
        path: `/comments/${encodeURIComponent(target.commentId)}/report`,
        noun: "comment",
        reasons: COMMENT_REPORT_REASONS as readonly ReportReason[],
      }
    : {
        path: `/characters/${encodeURIComponent(target.characterId)}/report`,
        noun: "character",
        reasons: REPORT_REASONS as readonly ReportReason[],
      };
}

function errorText(error: unknown, noun: string): string {
  if (error instanceof ApiError && error.code === "already_reported") {
    return `You already reported this ${noun}.`;
  }
  if (error instanceof ApiError && error.code === "report_limit") {
    return "You sent too many reports today. Try again tomorrow.";
  }
  return "The report was not sent. Try again.";
}

/**
 * The Report button of a character or of a comment. It opens a dialog with the reasons and an optional note.
 * `className` replaces the style of the button.
 */
export function ReportButton({ className, ...target }: ReportTarget & { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "pill pill-soft self-start"} onClick={() => setOpen(true)}>
        Report
      </button>
      {open && <ReportDialog target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const { path, noun, reasons } = targetOf(target);
  const noteId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ reason, note }),
      });
      setSent(true);
    } catch (caught) {
      setError(errorText(caught, noun));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Report this ${noun}`} closeButton onClose={onClose} className="w-[min(460px,calc(100vw-32px))]">
      {sent ? (
        <p className="m-0 text-muted">Thanks. The admin will look at it.</p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void send(event)}>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="label mb-2">Reason</legend>
            {reasons.map((value) => (
              <label key={value} className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                />
                {REPORT_REASON_LABELS[value]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor={noteId} className="label">
              Note (optional)
            </label>
            <textarea
              id={noteId}
              className="field"
              rows={3}
              maxLength={REPORT_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <span className="hint">
              {note.length} / {REPORT_NOTE_MAX}
            </span>
          </div>
          {error && (
            <p role="alert" className="m-0 text-[13px] text-error">
              {error}
            </p>
          )}
          <button type="submit" className="pill pill-accent self-start" disabled={!reason || busy}>
            Send report
          </button>
        </form>
      )}
    </Modal>
  );
}
