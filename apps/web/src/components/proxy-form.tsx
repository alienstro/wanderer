"use client";

import {
  AI_ERROR_TEXT,
  PROXY_CONTEXT_DEFAULT,
  PROXY_CONTEXT_MAX,
  PROXY_CONTEXT_MIN,
  proxyCreateSchema,
  type ProxyModelsRequest,
  type ProxyModelsResult,
  proxyUrlSchema,
  type ProxyView,
} from "@wanderer/shared";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Field } from "./form-field";
import { ModelPicker } from "./model-picker";

interface FormState {
  name: string;
  baseUrl: string;
  appendPath: boolean;
  apiKey: string;
  model: string;
  customPrompt: string;
  /** The text of the number field. The submit sends it as a number. */
  contextTokens: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const FIELD_MESSAGES: Record<keyof FormState, string> = {
  name: "Enter a name of 60 characters or less.",
  baseUrl: "Enter an https URL.",
  appendPath: "",
  apiKey: "Enter the API key.",
  model: "Enter the model name.",
  customPrompt: "Use 4,000 characters or less.",
  contextTokens: `Enter a whole number from ${PROXY_CONTEXT_MIN.toLocaleString("en-US")} to ${PROXY_CONTEXT_MAX.toLocaleString("en-US")}.`,
};

function initialState(initial?: ProxyView): FormState {
  return {
    name: initial?.name ?? "",
    baseUrl: initial?.baseUrl ?? "",
    appendPath: initial?.appendPath ?? true,
    apiKey: "",
    model: initial?.model ?? "",
    customPrompt: initial?.customPrompt ?? "",
    contextTokens: String(initial?.contextTokens ?? PROXY_CONTEXT_DEFAULT),
  };
}

/** The fields as the API takes them. An empty number field becomes NaN, so the schema rejects it. */
function toBody(state: FormState) {
  return { ...state, contextTokens: state.contextTokens.trim() === "" ? NaN : Number(state.contextTokens) };
}

/** The URL that gets the requests, as the API builds it. */
function endpoint(state: FormState): string {
  const base = state.baseUrl.trim().replace(/\/+$/, "");
  return state.appendPath ? `${base}/chat/completions` : base;
}

/** Checks the fields with the shared schema. On edit, an empty key keeps the saved key. */
function validate(state: FormState, editing: boolean): FieldErrors {
  const body = toBody(state);
  const parsed = proxyCreateSchema.safeParse(editing && !body.apiKey ? { ...body, apiKey: "kept" } : body);
  const errors: FieldErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const field = issue.path[0] as keyof FormState;
    errors[field] ??= FIELD_MESSAGES[field];
  }
  return errors;
}

/**
 * The key error for Load models. A new proxy needs a key. On edit, the API sends the saved key only to the saved
 * URL, so a new URL needs the key again.
 */
function modelsKeyError(state: FormState, initial: ProxyView | undefined, baseUrl: string | undefined): string | undefined {
  if (state.apiKey.trim()) {
    return undefined;
  }
  if (!initial) {
    return FIELD_MESSAGES.apiKey;
  }
  if (baseUrl !== undefined && (baseUrl !== initial.baseUrl || state.appendPath !== initial.appendPath)) {
    return "Enter the API key to use a new proxy URL.";
  }
  return undefined;
}

export interface ProxyFormProps {
  /** The saved proxy for the edit form. A new proxy has no initial value. */
  initial?: ProxyView;
  onSaved: (proxy: ProxyView) => void;
  onCancel?: () => void;
}

/** The form for one proxy: Name, Proxy URL, "Add /chat/completions", API key, Model, Custom prompt, and Context size. */
export function ProxyForm({ initial, onSaved, onCancel }: ProxyFormProps) {
  const [state, setState] = useState(() => initialState(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));

  /** Asks the API for the models of the proxy. On edit, an empty key field makes the API use the saved key. */
  async function loadModels() {
    const url = proxyUrlSchema.safeParse(state.baseUrl);
    const baseUrl = url.success ? undefined : FIELD_MESSAGES.baseUrl;
    const apiKey = modelsKeyError(state, initial, url.data);
    setErrors((current) => ({ ...current, baseUrl, apiKey }));
    setModels(null);
    setModelsError(null);
    if (baseUrl || apiKey) {
      return;
    }
    const body: ProxyModelsRequest = {
      baseUrl: state.baseUrl,
      appendPath: state.appendPath,
      apiKey: state.apiKey,
      ...(initial ? { proxyId: initial.id } : {}),
    };
    setLoadingModels(true);
    try {
      const result = await apiFetch<ProxyModelsResult>("/proxies/models", { method: "POST", body: JSON.stringify(body) });
      if (!result.ok) {
        setModelsError(result.message);
      } else if (result.models.length === 0) {
        setModelsError("The proxy gave no models. Type the model id.");
      } else {
        setModels(result.models);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "blocked_url") {
        setErrors((current) => ({ ...current, baseUrl: AI_ERROR_TEXT.blocked_url }));
      } else if (error instanceof ApiError && error.status === 429) {
        setModelsError("You loaded the models too many times. Try again in one minute.");
      } else {
        setModelsError("The models did not load. Try again.");
      }
    } finally {
      setLoadingModels(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(state, initial !== undefined);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    // On edit, an absent apiKey keeps the saved key. The API never sends the saved key back.
    const { apiKey, ...fields } = toBody(state);
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
          <div className="flex gap-2">
            <input
              id={inputId}
              className="field flex-1"
              value={state.model}
              aria-invalid={errors.model ? true : undefined}
              aria-describedby={describedBy}
              placeholder="deepseek/deepseek-chat"
              onChange={(event) => set({ model: event.target.value })}
            />
            <button type="button" className="pill pill-soft" disabled={loadingModels} onClick={loadModels}>
              {loadingModels ? "Loading…" : "Load models"}
            </button>
          </div>
        )}
      </Field>
      {modelsError && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {modelsError}
        </p>
      )}
      {models && (
        <ModelPicker
          models={models}
          onPick={(model) => {
            set({ model });
            setModels(null);
          }}
        />
      )}

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

      <Field
        name="contextTokens"
        label="Context size"
        error={errors.contextTokens}
        hint="The tokens of chat history that the AI reads. Use the context window of your model or less."
      >
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            className="field"
            type="number"
            inputMode="numeric"
            min={PROXY_CONTEXT_MIN}
            max={PROXY_CONTEXT_MAX}
            step={1_000}
            value={state.contextTokens}
            aria-invalid={errors.contextTokens ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => set({ contextTokens: event.target.value })}
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
