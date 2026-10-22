"use client";

import type { CharacterInput } from "@wanderer/shared";
import { useId, useState } from "react";
import { ApiError } from "@/lib/api";
import { BAD_IMAGE_MESSAGE, isAllowedImage, uploadImage } from "./image-file";

/** Reads a Tavern PNG card into the form. The API also keeps the PNG image as the avatar. */
export function TavernImport({ onImported }: { onImported: (draft: Partial<CharacterInput>, avatarFileId: string) => void }) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    if (file.type !== "image/png" || !isAllowedImage(file)) {
      setError(BAD_IMAGE_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = await uploadImage<{ draft: Partial<CharacterInput>; avatarFileId: string }>("/characters/import-png", file);
      onImported(result.draft, result.avatarFileId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "no_character_card") {
        setError("This PNG has no character card.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(BAD_IMAGE_MESSAGE);
      } else {
        setError("The import failed. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="pill pill-soft pill-sm relative self-start">
        {busy ? "Importing…" : "Import a Tavern PNG"}
        <input
          id={inputId}
          type="file"
          accept="image/png"
          disabled={busy}
          className="absolute size-px opacity-0"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {error && (
        <span role="alert" className="text-[13px] text-error">
          {error}
        </span>
      )}
    </div>
  );
}
