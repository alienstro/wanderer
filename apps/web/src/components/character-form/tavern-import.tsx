"use client";

import { CARD_JSON_MAX_BYTES, type CharacterInput } from "@wanderer/shared";
import { useId, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { BAD_IMAGE_MESSAGE, isAllowedImage, uploadImage } from "./image-file";

type ImportResult = { draft: Partial<CharacterInput>; avatarFileId?: string };

const BAD_FILE_MESSAGE = "Use a PNG or JSON character card.";
const TOO_LARGE_MESSAGE = "Use a card file of 2 MB or less.";

function isJsonFile(file: File): boolean {
  return file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
}

/** Sends the text of a JSON card file. It gives null when the text is not valid JSON. */
async function importJson(file: File): Promise<ImportResult | null> {
  const text = await file.text();
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  return apiFetch<ImportResult>("/characters/import-json", { method: "POST", body: text });
}

/**
 * Reads a Tavern character card from a PNG or a JSON file into the form.
 * For a PNG, the API also keeps the image as the avatar. A JSON card has no avatar.
 */
export function TavernImport({ onImported }: { onImported: (draft: Partial<CharacterInput>, avatarFileId?: string) => void }) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(null);
    const json = isJsonFile(file);
    if (json && file.size > CARD_JSON_MAX_BYTES) {
      setError(TOO_LARGE_MESSAGE);
      return;
    }
    if (!json && (file.type !== "image/png" || !isAllowedImage(file))) {
      setError(file.type === "image/png" ? BAD_IMAGE_MESSAGE : BAD_FILE_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const result = json ? await importJson(file) : await uploadImage<ImportResult>("/characters/import-png", file);
      if (!result) {
        setError("This file is not valid JSON.");
        return;
      }
      onImported(result.draft, result.avatarFileId);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "no_character_card") {
        setError("This file has no character card.");
      } else if (caught instanceof ApiError && caught.status === 413) {
        setError(json ? TOO_LARGE_MESSAGE : BAD_IMAGE_MESSAGE);
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(json ? BAD_FILE_MESSAGE : BAD_IMAGE_MESSAGE);
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
        {busy ? "Importing…" : "Import a character card"}
        <input
          id={inputId}
          type="file"
          accept="image/png,.png,application/json,.json"
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
