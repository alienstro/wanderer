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

/** One box of Settings. `className` changes the box, such as the full width and the red ground of Delete account. */
function Section({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col gap-3 panel p-5 ${className}`}>
      <h2 className="m-0 text-center text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** The account settings: the handle, Show 18+, Reply choices and their instructions, the models link, and Delete account. */
export function SettingsView({ me }: { me: MeResponse }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [handle, setHandle] = useState(me.handle ?? "");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [handleSaved, setHandleSaved] = useState(false);
  const [choicesPrompt, setChoicesPrompt] = useState(me.replyChoicesPrompt);
  const [choicesPromptError, setChoicesPromptError] = useState(false);
  const [choicesPromptSaved, setChoicesPromptSaved] = useState(false);
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-3.5 max-[760px]:grid-cols-1">
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
            <button type="submit" className="pill pill-light">
              Save handle
            </button>
            {handleSaved && <span className="text-[13px] text-muted">Saved.</span>}
          </div>
        </form>
      </Section>

      <PersonasSection />

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
              <button type="button" className="pill pill-light" onClick={() => void confirmAge()}>
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
            <button type="submit" className="pill pill-light">
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

      <Section title="Delete account" className="col-span-full bg-[#120a0c]">
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
