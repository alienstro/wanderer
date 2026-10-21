"use client";

import { useId, useState } from "react";
import { ApiError, fileSrc } from "@/lib/api";
import { BAD_IMAGE_MESSAGE, isAllowedImage, uploadImage } from "./image-file";

/** The round avatar picker. It checks the type and the size first, so a bad file sends no request. */
export function AvatarField({ value, onChange }: { value: string | null; onChange: (fileId: string | null) => void }) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    if (!isAllowedImage(file)) {
      setError(BAD_IMAGE_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadImage<{ id: string; url: string }>("/files", file);
      onChange(uploaded.id);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 400 ? BAD_IMAGE_MESSAGE : "The upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-[18px]">
      <label
        htmlFor={inputId}
        className="relative flex size-24 flex-none cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-[#3a3a42] bg-surface text-muted"
      >
        {value ? (
          <img src={fileSrc(`/files/${value}`)} alt="Your avatar" className="size-full object-cover" />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        )}
        <span className="sr-only">Choose an avatar image</span>
        <input
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          className="absolute size-px opacity-0"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      <div className="flex flex-col gap-1">
        <span className="label">
          Avatar <span className="font-normal text-subtle">(optional)</span>
        </span>
        <span className="hint">{busy ? "Uploading…" : "PNG, JPG, or WebP, 5 MB or less. The API keeps a 600×800 copy."}</span>
        {error && (
          <span role="alert" className="text-[13px] text-error">
            {error}
          </span>
        )}
        {value && (
          <button type="button" className="pill pill-ghost pill-sm self-start" onClick={() => onChange(null)}>
            Remove the avatar
          </button>
        )}
      </div>
    </div>
  );
}
