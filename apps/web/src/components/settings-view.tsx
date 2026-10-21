"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { MeResponse, UpdateMeRequest } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Field, Switch } from "./form-field";

const DELETE_WORD = "DELETE";

function handleErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === "handle_taken") {
    return "This handle is taken.";
  }
  if (error instanceof ApiError && error.code === "invalid_handle") {
    return "Use 3 to 20 lowercase letters, numbers, or _.";
  }
  return "The handle was not saved. Try again.";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-surface p-5">
      <h2 className="m-0 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** The account settings: the handle, Show 18+, Reply choices, the models link, and Delete account. */
export function SettingsView({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [handle, setHandle] = useState(me.handle ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSaved, setHandleSaved] = useState(false);
  const [askAge, setAskAge] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  /** Saves a change and puts the new /me answer in the cache, so the sidebar and the chat see it at once. */
  async function save(path: string, method: string, body?: UpdateMeRequest): Promise<void> {
    const updated = await apiFetch<MeResponse>(path, { method, body: body ? JSON.stringify(body) : undefined });
    queryClient.setQueryData(["me"], updated);
  }

  async function saveHandle(event: FormEvent) {
    event.preventDefault();
    setHandleError(null);
    setHandleSaved(false);
    try {
      await save("/me", "PATCH", { handle: handle.trim() });
      setHandleSaved(true);
    } catch (error) {
      setHandleError(handleErrorText(error));
    }
  }

  async function change(path: string, method: string, body?: UpdateMeRequest) {
    setSaveError(false);
    try {
      await save(path, method, body);
      // Discover and For you obey "Show 18+", so they load again.
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    } catch {
      setSaveError(true);
    }
  }

  function toggleAdult(on: boolean) {
    if (on) {
      // The first time, the user confirms the age. The API saves the time and turns the setting on.
      setAskAge(true);
      return;
    }
    void change("/me", "PATCH", { showAdult: false });
  }

  async function confirmAge() {
    setAskAge(false);
    await change("/me/adult-confirm", "POST");
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(false);
    try {
      await apiFetch("/me", { method: "DELETE" });
      queryClient.setQueryData(["me"], null);
      router.replace("/login");
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <Section title="Profile">
        <form className="flex flex-col gap-3" onSubmit={(event) => void saveHandle(event)}>
          <Field name="handle" label="Handle" error={handleError ?? undefined}>
            {({ inputId, describedBy }) => (
              <input
                id={inputId}
                className="field"
                value={handle}
                aria-describedby={describedBy}
                onChange={(event) => setHandle(event.target.value)}
              />
            )}
          </Field>
          <div className="flex items-center gap-3">
            <button type="submit" className="pill pill-accent">
              Save handle
            </button>
            {handleSaved && <span className="text-[13px] text-muted">Saved.</span>}
          </div>
        </form>
      </Section>

      <Section title="Content">
        <Switch
          name="showAdult"
          label="Show 18+"
          hint="Show characters that their creators marked 18+."
          checked={me.showAdult}
          onChange={toggleAdult}
        />
        {askAge && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-field-line p-3.5">
            <p className="m-0 text-muted">18+ characters have adult content. You must be 18 or older to see them.</p>
            <div className="flex gap-2">
              <button type="button" className="pill pill-accent" onClick={() => void confirmAge()}>
                I am 18 or older. Show 18+ content.
              </button>
              <button type="button" className="pill pill-soft" onClick={() => setAskAge(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Chat">
        <Switch
          name="replyChoicesOn"
          label="Reply choices"
          hint="Show four reply choices after each AI reply. You can also change this in each chat."
          checked={me.replyChoicesOn}
          onChange={(on) => void change("/me", "PATCH", { replyChoicesOn: on })}
        />
        <Link href="/settings/models" className="pill pill-soft self-start">
          Manage models
        </Link>
      </Section>

      {saveError && (
        <p role="alert" className="m-0 text-[13px] text-error">
          The setting was not saved. Try again.
        </p>
      )}

      <Section title="Delete account">
        <p className="m-0 text-muted">
          This removes your account, your characters, your chats, your models, and your uploads. You cannot undo it.
          Your reports stay for the admin, without your name.
        </p>
        <Field name="deleteWord" label={`Type ${DELETE_WORD} to confirm`}>
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              value={deleteWord}
              autoComplete="off"
              aria-describedby={describedBy}
              onChange={(event) => setDeleteWord(event.target.value)}
            />
          )}
        </Field>
        <button
          type="button"
          className="pill pill-danger self-start"
          disabled={deleteWord !== DELETE_WORD || deleting}
          onClick={() => void deleteAccount()}
        >
          Delete my account
        </button>
        {deleteError && (
          <p role="alert" className="m-0 text-[13px] text-error">
            The account was not deleted. Try again.
          </p>
        )}
      </Section>
    </div>
  );
}
