"use client";

import {
  bioPreview,
  type CharacterDetail,
  type CharacterInput,
  characterInputSchema,
  CHAT_NAME_MAX,
  characterTokenCounts,
  estimateTokens,
  OPENINGS_MAX,
  TAGS,
  TAGS_MAX,
  TITLE_MAX,
  type TagSlug,
} from "@wanderer/shared";
import { type ReactNode, useRef, useState } from "react";
import { ApiError, apiFetch, fileSrc } from "@/lib/api";
import { CharacterCard } from "@/features/characters/card/character-card";
import { Field, Switch } from "@/components/ui/form-field";
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

export interface CharacterFormProps {
  /** The saved character for the edit form. A new character has no initial value. */
  initial?: CharacterDetail;
  onSaved: (detail: CharacterDetail) => void;
  /** The handle on the preview card. */
  creatorHandle?: string;
  /** The title of the page. It shows under the preview card. */
  header?: ReactNode;
}

/** The live preview at the top of the page: the Discover card as it looks with the current values, on a blurred banner. */
function PreviewCard({ state, creatorHandle }: { state: FormState; creatorHandle: string }) {
  const avatarUrl = state.avatarFileId ? `/files/${state.avatarFileId}` : null;
  return (
    <section aria-label="Preview" className="flex w-full flex-col items-center">
      <div aria-hidden="true" className="relative h-[180px] w-full overflow-hidden rounded-[20px] bg-surface">
        {avatarUrl && (
          <img
            src={fileSrc(avatarUrl)}
            alt=""
            className="absolute -top-[60%] -left-[10%] h-[220%] w-[120%] object-cover blur-[30px] brightness-[0.65] saturate-[1.3]"
          />
        )}
      </div>
      <div className="relative z-[1] -mt-[132px] w-[156px] rounded-[14px] shadow-[0_0_0_4px_#000,0_18px_40px_rgba(0,0,0,0.5)]">
        <CharacterCard
          linked={false}
          card={{
            id: "preview",
            title: state.title.trim() || "Untitled",
            chatName: state.chatName,
            avatarUrl,
            isAdult: state.isAdult,
            tags: TAGS.filter((tag) => state.tags.includes(tag.slug)),
            chatCount: 0,
            likeCount: 0,
            creatorHandle,
            bioPreview: bioPreview(state.bio),
          }}
        />
      </div>
    </section>
  );
}

/** One box of the form, with a centered title and a short line under it. */
function Box({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3.5 rounded-[20px] bg-[#0d0d0f] p-5 max-[760px]:p-4">
      <div className="text-center">
        <h2 id={id} className="m-0 text-[15px] font-bold">
          {title}
        </h2>
        <p className="m-0 text-xs text-subtle">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** The create and edit form, in the order of spec section 4.4. The same schema checks it here and in the API. */
export function CharacterForm({ initial, onSaved, creatorHandle = "you", header }: CharacterFormProps) {
  const [state, setState] = useState<FormState>(() => initialFormState(initial));
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const counts = characterTokenCounts(state);
  const isLive = initial !== undefined && initial.status !== "draft";

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
      // The buttons are at the top, so the focus goes to the first field with an error, in the order of the page.
      const selector = Object.keys(found).map((name) => `[data-field="${name}"]`).join(",");
      const first = formRef.current?.querySelector<HTMLElement>(selector);
      first?.scrollIntoView?.({ block: "center" });
      first?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
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
    <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-3.5">
      <PreviewCard state={state} creatorHandle={creatorHandle} />
      {header && <div className="flex flex-col items-center gap-0.5 text-center">{header}</div>}
      <form ref={formRef} className="mt-3.5 flex w-full flex-col gap-3.5" onSubmit={(event) => event.preventDefault()} noValidate>
        {formError && (
          <p role="alert" className="m-0 text-center text-[13px] text-error">
            {formError}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="hint basis-full text-center text-[13px]">
            Total: {counts.total} tokens. Permanent: {counts.permanent} tokens.
          </span>
          {/* A saved character that is not a draft keeps its status on "Save". Only "Move to drafts" takes it off Discover. */}
          <button type="button" className="pill pill-soft" disabled={saving} onClick={() => void save(false)}>
            {isLive ? "Move to drafts" : "Save draft"}
          </button>
          <button type="button" className="pill pill-light" disabled={saving} onClick={() => void save(true)}>
            {isLive ? "Save" : "Publish"}
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-3.5 max-[760px]:grid-cols-1">
          <Box id="basics-h" title="Basics" hint="The picture, the name, the bio and the tags on the card.">
            <div data-field="avatar" className="flex flex-col gap-3">
              <AvatarField value={state.avatarFileId} onChange={(avatarFileId) => set({ avatarFileId })} />
              {/* A card fills only the fields that it has. The other fields keep what the user typed. A JSON card keeps the avatar. */}
              <TavernImport onImported={(draft, avatarFileId) => set(avatarFileId ? { ...draft, avatarFileId } : draft)} />
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
                  maxLength={CHAT_NAME_MAX}
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
          </Box>

          <Box id="definition-h" title="Definition" hint="The AI reads this part to play your character.">

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

          </Box>

          <Box id="openings-h" title="Openings and dialogs" hint="The first message of each new chat, and examples of how the character talks.">
            <div data-field="openings" className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="label">
                  Initial messages
                  <span className="text-link" aria-hidden="true">
                    {" "}
                    *
                  </span>
                </span>
                <span className="hint">
                  {state.openings.length} of {OPENINGS_MAX}
                </span>
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
          </Box>

          <Box id="visibility-h" title="Who can see it" hint="You can change these after you save.">
            <Switch name="isPublic" label="Public" hint="It shows on Discover and in search. Off: only you see it." checked={state.isPublic} onChange={(isPublic) => set({ isPublic })} />
            <Switch
              name="definitionVisible"
              label="Definition visible"
              hint="Players can read the personality and scenario."
              checked={state.definitionVisible}
              onChange={(definitionVisible) => set({ definitionVisible })}
            />
          </Box>
        </div>

      </form>
    </div>
  );
}
