"use client";

import {
  type CharacterDetail,
  type CharacterInput,
  characterInputSchema,
  characterTokenCounts,
  estimateTokens,
  TAGS,
  TAGS_MAX,
  TITLE_MAX,
  type TagSlug,
} from "@wanderer/shared";
import { type ReactNode, useId, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { CharacterCard } from "../character-card";
import { AvatarField } from "./avatar-field";
import { BioToolbar } from "./bio-toolbar";
import { OpeningsEditor } from "./openings-editor";
import { TavernImport } from "./tavern-import";

export type FormState = Omit<CharacterInput, "publish">;
type FieldName = keyof FormState;
type FieldErrors = Partial<Record<FieldName, string>>;

const REQUIRED_MESSAGES: Partial<Record<FieldName, string>> = {
  title: "Write a title.",
  bio: "Write a bio.",
  personality: "Write the personality.",
  openings: "Write the first message.",
};

/** The form values of a saved character, or the empty values for a new character. */
export function initialFormState(detail?: CharacterDetail): FormState {
  return {
    title: detail?.title ?? "",
    chatName: detail?.chatName ?? "",
    bio: detail?.bio ?? "",
    tags: detail?.tags.map((tag) => tag.slug) ?? [],
    isAdult: detail?.isAdult ?? false,
    personality: detail?.definition?.personality ?? "",
    scenario: detail?.definition?.scenario ?? "",
    openings: detail?.openings.length ? detail.openings : [""],
    exampleDialogs: detail?.definition?.exampleDialogs ?? "",
    // The avatar URL is "/files/<id>".
    avatarFileId: detail?.avatarUrl?.split("/").pop() ?? null,
    isPublic: detail?.isPublic ?? true,
    definitionVisible: detail?.definitionVisible ?? true,
  };
}

/** Gives one message for each bad field, from the shared schema. */
function validate(input: CharacterInput): FieldErrors {
  const parsed = characterInputSchema.safeParse(input);
  if (parsed.success) {
    return {};
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as FieldName;
    if (errors[field]) {
      continue;
    }
    if (issue.code === "too_big") {
      errors[field] = `Use ${String(issue.maximum)} ${field === "openings" || field === "tags" ? "items" : "characters"} or less.`;
    } else {
      errors[field] = REQUIRED_MESSAGES[field] ?? "Check this field.";
    }
  }
  return errors;
}

function Field({
  name,
  label,
  required,
  hint,
  error,
  children,
}: {
  name: FieldName | "avatar";
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div data-field={name} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        {label}
        {required && (
          <span className="text-link" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children({ inputId, describedBy })}
      {error && (
        <span id={errorId} className="text-[13px] text-error">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
    </div>
  );
}

function Switch({ name, label, hint, checked, onChange }: { name: FieldName; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  const hintId = useId();
  return (
    <div data-field={name} className="flex items-start justify-between gap-4 rounded-xl bg-surface px-3.5 py-3">
      <span className="flex flex-col">
        <span className="label">{label}</span>
        <span id={hintId} className="hint">
          {hint}
        </span>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={hintId} className="switch" onClick={() => onChange(!checked)}>
        <span className="track">
          <span className="knob" />
        </span>
      </button>
    </div>
  );
}

export interface CharacterFormProps {
  /** The saved character for the edit form. A new character has no initial value. */
  initial?: CharacterDetail;
  onSaved: (detail: CharacterDetail) => void;
  /** The handle on the preview card. */
  creatorHandle?: string;
}

/** The live preview: the Discover card as it looks with the current values. */
function PreviewCard({ state, creatorHandle }: { state: FormState; creatorHandle: string }) {
  return (
    <section aria-label="Preview" className="top-6 flex flex-[0_1_260px] flex-col gap-3 min-[761px]:sticky max-[760px]:flex-[1_1_100%]">
      <h2 className="m-0 text-base font-bold">Preview</h2>
      <CharacterCard
        linked={false}
        card={{
          id: "preview",
          title: state.title.trim() || "Untitled",
          chatName: state.chatName,
          avatarUrl: state.avatarFileId ? `/files/${state.avatarFileId}` : null,
          isAdult: state.isAdult,
          tags: TAGS.filter((tag) => state.tags.includes(tag.slug)),
          chatCount: 0,
          creatorHandle,
        }}
      />
    </section>
  );
}

/** The create and edit form, in the order of spec section 4.4. The same schema checks it here and in the API. */
export function CharacterForm({ initial, onSaved, creatorHandle = "you" }: CharacterFormProps) {
  const [state, setState] = useState<FormState>(() => initialFormState(initial));
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counts = characterTokenCounts(state);

  function set(change: Partial<FormState>) {
    setState((current) => ({ ...current, ...change }));
  }

  function toggleTag(slug: TagSlug) {
    const has = state.tags.includes(slug);
    if (!has && state.tags.length >= TAGS_MAX) {
      return;
    }
    set({ tags: has ? state.tags.filter((tag) => tag !== slug) : [...state.tags, slug] });
  }

  async function save(publish: boolean) {
    const input: CharacterInput = { ...state, publish };
    const found = validate(input);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setSaving(true);
    try {
      const path = initial ? `/characters/${initial.id}` : "/characters";
      const detail = await apiFetch<CharacterDetail>(path, { method: initial ? "PATCH" : "POST", body: JSON.stringify(input) });
      onSaved(detail);
    } catch (error) {
      if (error instanceof ApiError && error.code === "title_taken") {
        setErrors({ title: "You already have a character with this title." });
      } else if (error instanceof ApiError && error.code === "invalid_avatar") {
        setFormError("The avatar is not valid. Upload it again.");
      } else {
        setFormError("The character was not saved. Check the fields and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-9">
      <form className="flex min-w-0 flex-[1_1_520px] flex-col gap-[22px]" onSubmit={(event) => event.preventDefault()} noValidate>
        <div data-field="avatar" className="flex flex-col gap-3">
          <AvatarField value={state.avatarFileId} onChange={(avatarFileId) => set({ avatarFileId })} />
          {/* A card fills only the fields that it has. The other fields keep what the user typed. */}
          <TavernImport onImported={(draft, avatarFileId) => set({ ...draft, avatarFileId })} />
        </div>

        <Field name="title" label="Title" required error={errors.title} hint={`${state.title.length}/${TITLE_MAX}`}>
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              value={state.title}
              maxLength={TITLE_MAX}
              aria-describedby={describedBy}
              aria-invalid={errors.title ? true : undefined}
              placeholder="A unique title for your character"
              onChange={(event) => set({ title: event.target.value })}
            />
          )}
        </Field>

        <Field name="chatName" label="Chat name" error={errors.chatName} hint="Leave this empty to use the title. The AI also uses this name.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              value={state.chatName}
              maxLength={60}
              aria-describedby={describedBy}
              placeholder="The name shown in chat"
              onChange={(event) => set({ chatName: event.target.value })}
            />
          )}
        </Field>

        <Field name="bio" label="Bio" required error={errors.bio} hint={`${estimateTokens(state.bio)} tokens. Select text, then use the buttons to add Markdown.`}>
          {({ inputId, describedBy }) => (
            <div className="rounded-xl border border-field-line bg-surface focus-within:border-accent">
              <BioToolbar textareaRef={bioRef} value={state.bio} onChange={(bio) => set({ bio })} />
              <textarea
                id={inputId}
                ref={bioRef}
                className="field border-0 bg-transparent shadow-none focus:shadow-none"
                rows={5}
                value={state.bio}
                aria-describedby={describedBy}
                placeholder="Who is this character, and what do they want?"
                onChange={(event) => set({ bio: event.target.value })}
              />
            </div>
          )}
        </Field>

        <div data-field="tags" className="flex flex-col gap-2">
          <span className="label" id="tags-label">
            Tags
          </span>
          <div role="group" aria-labelledby="tags-label" className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <button key={tag.slug} type="button" className="chip" aria-pressed={state.tags.includes(tag.slug)} onClick={() => toggleTag(tag.slug)}>
                {tag.label}
              </button>
            ))}
          </div>
          <span className="hint">
            {state.tags.length} of {TAGS_MAX} tags.
          </span>
        </div>

        <Switch name="isAdult" label="18+" hint="Turn this on for adult content. Only users who confirm their age see it." checked={state.isAdult} onChange={(isAdult) => set({ isAdult })} />

        <div className="flex flex-col gap-1 border-t border-line pt-3.5">
          <h2 className="m-0 text-xl font-bold">Definition</h2>
          <p className="m-0 text-muted">The AI reads this part to play your character.</p>
        </div>

        <Field name="personality" label="Personality" required error={errors.personality} hint={`${estimateTokens(state.personality)} tokens`}>
          {({ inputId, describedBy }) => (
            <textarea
              id={inputId}
              className="field"
              rows={4}
              value={state.personality}
              aria-describedby={describedBy}
              placeholder="How do they act, talk, and treat other people?"
              onChange={(event) => set({ personality: event.target.value })}
            />
          )}
        </Field>

        <Field name="scenario" label="Scenario" error={errors.scenario} hint={`${estimateTokens(state.scenario)} tokens`}>
          {({ inputId, describedBy }) => (
            <textarea
              id={inputId}
              className="field"
              rows={3}
              value={state.scenario}
              aria-describedby={describedBy}
              placeholder="Where and when does the story happen?"
              onChange={(event) => set({ scenario: event.target.value })}
            />
          )}
        </Field>

        <div data-field="openings" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="label">
              Initial messages
              <span className="text-link" aria-hidden="true">
                {" "}
                *
              </span>
            </span>
            <span className="hint">{state.openings.length} of 10</span>
          </div>
          <span className="hint">Players pick one of these to start a chat. Put actions in *asterisks*.</span>
          <OpeningsEditor value={state.openings} onChange={(openings) => set({ openings })} />
          {errors.openings && <span className="text-[13px] text-error">{errors.openings}</span>}
        </div>

        <Field name="exampleDialogs" label="Example dialogs" error={errors.exampleDialogs} hint="Use {{char}} and {{user}}.">
          {({ inputId, describedBy }) => (
            <textarea
              id={inputId}
              className="field"
              rows={4}
              value={state.exampleDialogs}
              aria-describedby={describedBy}
              placeholder={"{{user}}: Hi.\n{{char}}: *nods* Hello."}
              onChange={(event) => set({ exampleDialogs: event.target.value })}
            />
          )}
        </Field>

        <Switch name="isPublic" label="Public" hint="It shows on Discover and in search. Off: only you see it." checked={state.isPublic} onChange={(isPublic) => set({ isPublic })} />
        <Switch
          name="definitionVisible"
          label="Definition visible"
          hint="Players can read the personality and scenario."
          checked={state.definitionVisible}
          onChange={(definitionVisible) => set({ definitionVisible })}
        />

        {formError && (
          <p role="alert" className="m-0 text-[13px] text-error">
            {formError}
          </p>
        )}

        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-bg py-3.5">
          <span className="hint flex-auto text-[13px]">
            Total: {counts.total} tokens. Permanent: {counts.permanent} tokens.
          </span>
          <button type="button" className="pill pill-soft" disabled={saving} onClick={() => void save(false)}>
            Save draft
          </button>
          <button type="button" className="pill pill-accent" disabled={saving} onClick={() => void save(true)}>
            Publish
          </button>
        </div>
      </form>
      <PreviewCard state={state} creatorHandle={creatorHandle} />
    </div>
  );
}
