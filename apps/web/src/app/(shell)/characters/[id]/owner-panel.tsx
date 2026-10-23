"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { CharacterDetail, CharacterInput } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

type Choice = { label: string; hint: string; value: boolean };

function RadioGroup({
  legend,
  name,
  value,
  choices,
  disabled,
  onChange,
}: {
  legend: string;
  name: string;
  value: boolean;
  choices: [Choice, Choice];
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" disabled={disabled}>
      <legend className="pb-2 text-[13px] font-semibold">{legend}</legend>
      {choices.map((choice) => (
        <label key={choice.label} className="flex cursor-pointer items-start gap-2.5">
          <input
            type="radio"
            name={name}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="mt-0.5 size-[18px] accent-accent"
          />
          <span className="flex flex-col">
            <span className="font-medium">{choice.label}</span>
            <span className="hint">{choice.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** The settings that only the creator sees. Each change saves at once with PATCH. */
export function OwnerPanel({ detail, onSaved }: { detail: CharacterDetail; onSaved: (detail: CharacterDetail) => void }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(change: Partial<CharacterInput>) {
    setSaving(true);
    setError(null);
    try {
      const saved = await apiFetch<CharacterDetail>(`/characters/${detail.id}`, { method: "PATCH", body: JSON.stringify(change) });
      onSaved(saved);
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    } catch {
      setError("The change was not saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/characters/${detail.id}`, { method: "DELETE" });
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
      router.push("/my-characters");
    } catch {
      setError("The character was not deleted. Try again.");
      setSaving(false);
    }
  }

  return (
    <aside aria-labelledby="owner-h" className="flex flex-[1_1_280px] flex-col gap-[18px] panel p-5">
      <div className="flex flex-col gap-0.5">
        <h2 id="owner-h" className="m-0 text-base font-bold">
          Character settings
        </h2>
        <span className="hint">Only you see these settings.</span>
      </div>
      <RadioGroup
        legend="Who can find it"
        name="visibility"
        value={detail.isPublic}
        disabled={saving}
        onChange={(isPublic) => void save({ isPublic })}
        choices={[
          { label: "Public", hint: "It shows on Discover and in search.", value: true },
          { label: "Private", hint: "Only you can see it and chat with it.", value: false },
        ]}
      />
      <RadioGroup
        legend="Definition visibility"
        name="definition"
        value={detail.definitionVisible}
        disabled={saving}
        onChange={(definitionVisible) => void save({ definitionVisible })}
        choices={[
          { label: "Visible", hint: "Players can read the personality and scenario.", value: true },
          { label: "Hidden", hint: "Players can chat, but they cannot read it.", value: false },
        ]}
      />
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#26262b] pt-3.5">
        {confirming ? (
          <>
            <span className="flex-[1_1_100%] text-[13px] text-error">Delete {detail.title}? This cannot be undone.</span>
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="pill pill-danger pill-sm" disabled={saving} onClick={() => void remove()}>
              Delete character
            </button>
          </>
        ) : (
          <>
            <Link href={`/characters/${detail.id}/edit`} className="pill pill-soft pill-sm">
              Edit
            </Link>
            <button type="button" className="pill pill-ghost pill-sm text-error" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
