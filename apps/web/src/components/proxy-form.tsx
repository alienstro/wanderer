"use client";

import {
  AI_ERROR_TEXT,
  API_KEY_LIMIT,
  apiKeyCreateSchema,
  type ApiKeyView,
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
import { Field } from "@/components/ui/form-field";
import { ModelPicker } from "./model-picker";

/** The select value that shows the fields for a new saved key. */
const NEW_KEY = "new";
/** A stand-in ID for the check of a form that adds a new key. The API gives the real ID. */
const PENDING_KEY_ID = "00000000-0000-4000-8000-000000000000";

interface FormState {
  name: string;
  baseUrl: string;
  appendPath: boolean;
  /** The ID of a saved key, or NEW_KEY. */
  apiKeyId: string;
  newKeyName: string;
  newKey: string;
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
  apiKeyId: "Pick an API key.",
  newKeyName: "Enter a key name of 60 characters or less.",
  newKey: "Enter the API key.",
  model: "Enter the model name.",
  customPrompt: "Use 4,000 characters or less.",
  contextTokens: `Enter a whole number from ${PROXY_CONTEXT_MIN.toLocaleString("en-US")} to ${PROXY_CONTEXT_MAX.toLocaleString("en-US")}.`,
};

/** A new model starts on the first saved key, or on a new key when the user has none. */
function initialState(apiKeys: ApiKeyView[], initial?: ProxyView): FormState {
  return {
    name: initial?.name ?? "",
    baseUrl: initial?.baseUrl ?? "",
    appendPath: initial?.appendPath ?? true,
    apiKeyId: initial?.savedKey.id ?? apiKeys[0]?.id ?? NEW_KEY,
    newKeyName: "",
    newKey: "",
    model: initial?.model ?? "",
    customPrompt: initial?.customPrompt ?? "",
    contextTokens: String(initial?.contextTokens ?? PROXY_CONTEXT_DEFAULT),
  };
}

/** The proxy fields as the API takes them. An empty number field becomes NaN, so the schema rejects it. */
function toBody(state: FormState) {
  const { newKeyName: _name, newKey: _key, ...fields } = state;
  return { ...fields, contextTokens: state.contextTokens.trim() === "" ? NaN : Number(state.contextTokens) };
}

/** The URL that gets the requests, as the API builds it. */
function endpoint(state: FormState): string {
  const base = state.baseUrl.trim().replace(/\/+$/, "");
  return state.appendPath ? `${base}/chat/completions` : base;
}

/** Checks the fields with the shared schemas. A new key also checks its name and its key. */
function validate(state: FormState): FieldErrors {
  const adding = state.apiKeyId === NEW_KEY;
  const body = toBody(state);
  const parsed = proxyCreateSchema.safeParse(adding ? { ...body, apiKeyId: PENDING_KEY_ID } : body);
  const errors: FieldErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const field = issue.path[0] as keyof FormState;
    errors[field] ??= FIELD_MESSAGES[field];
  }
  if (adding) {
    const key = apiKeyCreateSchema.safeParse({ name: state.newKeyName, apiKey: state.newKey });
    for (const issue of key.success ? [] : key.error.issues) {
      const field = issue.path[0] === "name" ? "newKeyName" : "newKey";
      errors[field] ??= FIELD_MESSAGES[field];
    }
  }
  return errors;
}

/** The model list needs a key: the typed new key, or a saved key that the API reads. */
function modelsKeyError(state: FormState): string | undefined {
  return state.apiKeyId === NEW_KEY && !state.newKey.trim() ? FIELD_MESSAGES.newKey : undefined;
}

export interface ProxyFormProps {
  /** The saved keys of the user, for the key select. */
  apiKeys: ApiKeyView[];
  /** The saved proxy for the edit form. A new proxy has no initial value. */
  initial?: ProxyView;
  onSaved: (proxy: ProxyView) => void;
  /** The form saved a new key. The key list loads again. */
  onKeyAdded?: () => void;
  onCancel?: () => void;
}

/** The form for one proxy: Name, Proxy URL, "Add /chat/completions", API key, Model, Custom prompt, and Context size. */
export function ProxyForm({ apiKeys, initial, onSaved, onKeyAdded, onCancel }: ProxyFormProps) {
  const [state, setState] = useState(() => initialState(apiKeys, initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));

  /** Asks the API for the models of the proxy, with the typed new key or the picked saved key. */
  async function loadModels() {
    const url = proxyUrlSchema.safeParse(state.baseUrl);
    const baseUrl = url.success ? undefined : FIELD_MESSAGES.baseUrl;
    const newKey = modelsKeyError(state);
    setErrors((current) => ({ ...current, baseUrl, newKey }));
    setModels(null);
    setModelsError(null);
    if (baseUrl || newKey) {
      return;
    }
    const body: ProxyModelsRequest = {
      baseUrl: state.baseUrl,
      appendPath: state.appendPath,
      ...(state.apiKeyId === NEW_KEY ? { apiKey: state.newKey } : { apiKeyId: state.apiKeyId }),
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
    const found = validate(state);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setSaving(true);
    let apiKeyId = state.apiKeyId;
    if (apiKeyId === NEW_KEY) {
      try {
        const created = await apiFetch<ApiKeyView>("/api-keys", {
          method: "POST",
          body: JSON.stringify({ name: state.newKeyName, apiKey: state.newKey }),
        });
        // The key is saved now. A retry after a failed model save uses it and does not add it again.
        apiKeyId = created.id;
        set({ apiKeyId, newKeyName: "", newKey: "" });
        onKeyAdded?.();
      } catch (error) {
        setFormError(
          error instanceof ApiError && error.code === "api_key_limit"
            ? `You can save ${API_KEY_LIMIT} API keys. Delete a key to add a new one.`
            : "The key did not save. Check the fields and try again.",
        );
        setSaving(false);
        return;
      }
    }
    // On edit, an absent apiKeyId keeps the current key.
    const { apiKeyId: _picked, ...fields } = toBody(state);
    const body = initial && apiKeyId === initial.savedKey.id ? fields : { ...fields, apiKeyId };
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

      <Field name="apiKeyId" label="API key" required error={errors.apiKeyId}>
        {({ inputId, describedBy }) => (
          <select
            id={inputId}
            className="field"
            value={state.apiKeyId}
            aria-invalid={errors.apiKeyId ? true : undefined}
            aria-describedby={describedBy}
            onChange={(event) => set({ apiKeyId: event.target.value })}
          >
            {apiKeys.map((apiKey) => (
              <option key={apiKey.id} value={apiKey.id}>
                {apiKey.name} (••••{apiKey.keyLast4})
              </option>
            ))}
            <option value={NEW_KEY}>Add a new key</option>
          </select>
        )}
      </Field>

      {state.apiKeyId === NEW_KEY && (
        <>
          <Field name="newKeyName" label="Key name" required error={errors.newKeyName}>
            {({ inputId, describedBy }) => (
              <input
                id={inputId}
                className="field"
                value={state.newKeyName}
                aria-invalid={errors.newKeyName ? true : undefined}
                aria-describedby={describedBy}
                placeholder="OpenRouter"
                onChange={(event) => set({ newKeyName: event.target.value })}
              />
            )}
          </Field>
          <Field
            name="newKey"
            label="New API key"
            required
            error={errors.newKey}
            hint="Wanderer saves the key to your API keys, so other models can use it."
          >
            {({ inputId, describedBy }) => (
              <div className="flex gap-2">
                <input
                  id={inputId}
                  className="field flex-1"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={state.newKey}
                  aria-invalid={errors.newKey ? true : undefined}
                  aria-describedby={describedBy}
                  placeholder="sk-..."
                  onChange={(event) => set({ newKey: event.target.value })}
                />
                <button type="button" className="pill pill-soft" onClick={() => setShowKey((value) => !value)}>
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            )}
          </Field>
        </>
      )}

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
