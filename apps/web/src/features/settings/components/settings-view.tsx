"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type MeResponse, REPLY_CHOICES_PROMPT_MAX, type UpdateMeRequest } from "@wanderer/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Field, Switch } from "@/components/ui/form-field";
import { PersonasSection } from "@/features/personas";

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
    <section className="flex flex-col gap-3 panel p-5">
      <h2 className="m-0 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** The account settings: the handle, Reply choices and their instructions, the models link, and Delete account. */
export function SettingsView({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [handle, setHandle] = useState(me.handle ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSaved, setHandleSaved] = useState(false);
  const [choicesPrompt, setChoicesPrompt] = useState(me.replyChoicesPrompt);
  const [choicesPromptError, setChoicesPromptError] = useState(false);
  const [choicesPromptSaved, setChoicesPromptSaved] = useState(false);
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

  async function saveChoicesPrompt(event: FormEvent) {
    event.preventDefault();
    setChoicesPromptError(false);
    setChoicesPromptSaved(false);
    try {
      await save("/me", "PATCH", { replyChoicesPrompt: choicesPrompt.trim() });
      setChoicesPromptSaved(true);
    } catch {
      setChoicesPromptError(true);
    }
  }

  async function change(path: string, method: string, body?: UpdateMeRequest) {
    setSaveError(false);
    try {
      await save(path, method, body);
    } catch {
      setSaveError(true);
    }
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

      <PersonasSection />

      <Section title="Chat">
        <Switch
          name="replyChoicesOn"
          label="Reply choices"
          hint="Show four reply choices after each AI reply. You can also change this in each chat."
          checked={me.replyChoicesOn}
          onChange={(on) => void change("/me", "PATCH", { replyChoicesOn: on })}
        />
        <form className="flex flex-col gap-3" onSubmit={(event) => void saveChoicesPrompt(event)}>
          <Field
            name="replyChoicesPrompt"
            label="Reply choices instructions"
            error={choicesPromptError ? "The instructions were not saved. Try again." : undefined}
            hint={`${choicesPrompt.length}/${REPLY_CHOICES_PROMPT_MAX}`}
          >
            {({ inputId, describedBy }) => (
              <textarea
                id={inputId}
                className="field"
                rows={3}
                maxLength={REPLY_CHOICES_PROMPT_MAX}
                value={choicesPrompt}
                aria-describedby={describedBy}
                placeholder="For example: Write each choice as an action in *asterisks*."
                onChange={(event) => setChoicesPrompt(event.target.value)}
              />
            )}
          </Field>
          <div className="flex items-center gap-3">
            <button type="submit" className="pill pill-accent">
              Save instructions
            </button>
            {choicesPromptSaved && <span className="text-[13px] text-muted">Saved.</span>}
          </div>
        </form>
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
