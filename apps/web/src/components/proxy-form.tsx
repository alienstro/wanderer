"use client";

import { AI_ERROR_TEXT, proxyCreateSchema, type ProxyView } from "@wanderer/shared";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Field } from "./form-field";

interface FormState {
  name: string;
  baseUrl: string;
  appendPath: boolean;
  apiKey: string;
  model: string;
  customPrompt: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const FIELD_MESSAGES: Record<keyof FormState, string> = {
  name: "Enter a name of 60 characters or less.",
  baseUrl: "Enter an https URL.",
  appendPath: "",
  apiKey: "Enter the API key.",
  model: "Enter the model name.",
  customPrompt: "Use 4,000 characters or less.",
};

function initialState(initial?: ProxyView): FormState {
  return {
    name: initial?.name ?? "",
    baseUrl: initial?.baseUrl ?? "",
    appendPath: initial?.appendPath ?? true,
    apiKey: "",
    model: initial?.model ?? "",
    customPrompt: initial?.customPrompt ?? "",
  };
}

/** The URL that gets the requests, as the API builds it. */
function endpoint(state: FormState): string {
  const base = state.baseUrl.trim().replace(/\/+$/, "");
  return state.appendPath ? `${base}/chat/completions` : base;
}

/** Checks the fields with the shared schema. On edit, an empty key keeps the saved key. */
function validate(state: FormState, editing: boolean): FieldErrors {
  const parsed = proxyCreateSchema.safeParse(editing && !state.apiKey ? { ...state, apiKey: "kept" } : state);
  const errors: FieldErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const field = issue.path[0] as keyof FormState;
    errors[field] ??= FIELD_MESSAGES[field];
  }
  return errors;
}

export interface ProxyFormProps {
  /** The saved proxy for the edit form. A new proxy has no initial value. */
  initial?: ProxyView;
  onSaved: (proxy: ProxyView) => void;
  onCancel?: () => void;
}

/** The form for one proxy: Name, Proxy URL, "Add /chat/completions", API key, Model, and Custom prompt. */
export function ProxyForm({ initial, onSaved, onCancel }: ProxyFormProps) {
  const [state, setState] = useState(() => initialState(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(state, initial !== undefined);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    // On edit, an absent apiKey keeps the saved key. The API never sends the saved key back.
    const { apiKey, ...fields } = state;
    const body = apiKey ? { ...fields, apiKey } : fields;
    setSaving(true);
    try {
      const proxy = await apiFetch<ProxyView>(initial ? `/proxies/${initial.id}` : "/proxies", {
        method: initial ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      onSaved(proxy);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      if (code === "blocked_url") {
        setErrors({ baseUrl: AI_ERROR_TEXT.blocked_url });
      } else if (code === "proxy_limit") {
        setFormError("You have 20 proxies. Delete one to add another.");
      } else {
        setFormError("The proxy did not save. Check the fields and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4 panel p-5" noValidate onSubmit={submit}>
      <h2 className="m-0 text-xl font-bold">{initial ? `Edit ${initial.name}` : "Add a model"}</h2>

      <Field name="name" label="Name" required error={errors.name}>
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            className="field"
            value={state.name}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy}
            placeholder="OpenRouter"
            onChange={(event) => set({ name: event.target.value })}
          />
        )}
      </Field>

      <Field
        name="baseUrl"
        label="Proxy URL"
        required
        error={errors.baseUrl}
        hint={
          <>
            Requests go to <code className="break-all">{endpoint(state)}</code>
          </>
        }
      >
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            className="field"
            type="url"
            inputMode="url"
            value={state.baseUrl}
            aria-invalid={errors.baseUrl ? true : undefined}
            aria-describedby={describedBy}
            placeholder="https://openrouter.ai/api/v1"
            onChange={(event) => set({ baseUrl: event.target.value })}
          />
        )}
      </Field>

      <label className="flex items-center gap-2.5">
        <input type="checkbox" checked={state.appendPath} onChange={(event) => set({ appendPath: event.target.checked })} />
        <span>Add /chat/completions</span>
      </label>

      <Field name="apiKey" label="API key" required={!initial} error={errors.apiKey}>
        {({ inputId, describedBy }) => (
          <div className="flex gap-2">
            <input
              id={inputId}
              className="field flex-1"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={state.apiKey}
              aria-invalid={errors.apiKey ? true : undefined}
              aria-describedby={describedBy}
              placeholder={initial ? `••••${initial.keyLast4} (leave empty to keep)` : "sk-..."}
              onChange={(event) => set({ apiKey: event.target.value })}
            />
            <button type="button" className="pill pill-soft" onClick={() => setShowKey((value) => !value)}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        )}
      </Field>

      <Field name="model" label="Model" required error={errors.model}>
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            className="field"
            value={state.model}
            aria-invalid={errors.model ? true : undefined}
            aria-describedby={describedBy}
            placeholder="deepseek/deepseek-chat"
            onChange={(event) => set({ model: event.target.value })}
          />
        )}
      </Field>

      <Field name="customPrompt" label="Custom prompt" error={errors.customPrompt} hint="Optional. The AI reads it before the character.">
        {({ inputId, describedBy }) => (
          <textarea
            id={inputId}
            className="field"
            rows={3}
            value={state.customPrompt}
            aria-describedby={describedBy}
            onChange={(event) => set({ customPrompt: event.target.value })}
          />
        )}
      </Field>

      {formError && (
        <p role="alert" className="m-0 text-error">
          {formError}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" className="pill pill-accent" disabled={saving}>
          Save
        </button>
        {onCancel && (
          <button type="button" className="pill pill-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
