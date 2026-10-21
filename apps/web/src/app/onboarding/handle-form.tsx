"use client";

import { handleSchema, type MeResponse } from "@wanderer/shared";
import { type FormEvent, useId, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

const INVALID_TEXT = "Use 3 to 20 lowercase letters, numbers, or _.";
const TAKEN_TEXT = "This handle is taken.";
const FAILED_TEXT = "The handle was not saved. Try again.";

/** The handle step. It checks the handle with the shared rule before it sends the request. */
export function HandleForm({ suggested, onDone }: { suggested: string; onDone: (me: MeResponse) => void }) {
  const [value, setValue] = useState(suggested);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const messageId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = handleSchema.safeParse(value);
    if (!parsed.success) {
      setError(INVALID_TEXT);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const me = await apiFetch<MeResponse>("/me", {
        method: "PATCH",
        body: JSON.stringify({ handle: parsed.data }),
      });
      onDone(me);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === "handle_taken") {
        setError(TAKEN_TEXT);
      } else if (requestError instanceof ApiError && requestError.status === 400) {
        setError(INVALID_TEXT);
      } else {
        setError(FAILED_TEXT);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="label">
          Your handle
        </label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-subtle">
            @
          </span>
          <input
            id={inputId}
            className="field pl-8"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={40}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
          />
        </div>
        <p id={messageId} className={error ? "m-0 text-[13px] text-error" : "hint m-0"} role={error ? "alert" : undefined}>
          {error ?? "Other people see you by this name. Use 3 to 20 lowercase letters, numbers, or _."}
        </p>
      </div>
      <button type="submit" className="pill pill-accent w-full" disabled={saving}>
        Continue
      </button>
    </form>
  );
}
