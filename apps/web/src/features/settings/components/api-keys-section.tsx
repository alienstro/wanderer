"use client";

import { API_KEY_LIMIT, apiKeyCreateSchema, type ApiKeyInUse, type ApiKeyView } from "@wanderer/shared";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Field } from "@/components/ui/form-field";

const NAME_MESSAGE = "Enter a name of 60 characters or less.";
const KEY_MESSAGE = "Enter the API key.";

interface KeyErrors {
  name?: string;
  apiKey?: string;
}

/** Checks a name and a key with the shared schema. An undefined value is not in the form and is not checked. */
function validate(name: string | undefined, apiKey: string | undefined): KeyErrors {
  const parsed = apiKeyCreateSchema.safeParse({ name: name ?? "kept", apiKey: apiKey ?? "kept" });
  const errors: KeyErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    if (issue.path[0] === "name") {
      errors.name = NAME_MESSAGE;
    } else if (issue.path[0] === "apiKey") {
      errors.apiKey = KEY_MESSAGE;
    }
  }
  return errors;
}

function failText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) {
    return fallback;
  }
  if (error.code === "api_key_limit") {
    return `You can save ${API_KEY_LIMIT} API keys. Delete a key to add a new one.`;
  }
  if (error.code === "api_key_in_use") {
    const { models } = error.body as ApiKeyInUse;
    return `Change these models first: ${models.join(", ")}.`;
  }
  return fallback;
}

function KeyInput({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field name="apiKey" label={label} required error={error}>
      {({ inputId, describedBy }) => (
        <div className="flex gap-2">
          <input
            id={inputId}
            className="field flex-1"
            type={show ? "text" : "password"}
            autoComplete="off"
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            placeholder="sk-..."
            onChange={(event) => onChange(event.target.value)}
          />
          <button type="button" className="pill pill-soft" onClick={() => setShow((current) => !current)}>
            {show ? "Hide" : "Show"}
          </button>
        </div>
      )}
    </Field>
  );
}

function NameInput({ value, error, onChange }: { value: string; error?: string; onChange: (value: string) => void }) {
  return (
    <Field name="name" label="Name" required error={error}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          className="field"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder="OpenRouter"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * A small form for a key. It shows a name field, a key field, or both.
 * The submit checks and sends only the shown fields.
 */
function KeyForm({
  label,
  initialName,
  showName,
  showKey,
  keyLabel,
  send,
  onDone,
  onCancel,
}: {
  label: string;
  initialName?: string;
  showName: boolean;
  showKey: boolean;
  keyLabel: string;
  send: (body: { name?: string; apiKey?: string }) => Promise<unknown>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [apiKey, setApiKey] = useState("");
  const [errors, setErrors] = useState<KeyErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { name: showName ? name : undefined, apiKey: showKey ? apiKey : undefined };
    const found = validate(body.name, body.apiKey);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      return;
    }
    setSaving(true);
    try {
      await send(body);
      onDone();
    } catch (error) {
      setFormError(failText(error, "The key did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" aria-label={label} noValidate onSubmit={submit}>
      {showName && <NameInput value={name} error={errors.name} onChange={setName} />}
      {showKey && <KeyInput label={keyLabel} value={apiKey} error={errors.apiKey} onChange={setApiKey} />}
      {formError && (
        <p role="alert" className="m-0 text-error">
          {formError}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" className="pill pill-accent pill-sm" disabled={saving}>
          Save
        </button>
        <button type="button" className="pill pill-ghost pill-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function usedBy(count: number): string {
  if (count === 0) {
    return "Not used";
  }
  return count === 1 ? "Used by 1 model" : `Used by ${count} models`;
}

function KeyRow({ apiKey, onChanged }: { apiKey: ApiKeyView; onChanged: () => void }) {
  const [mode, setMode] = useState<"rename" | "replace" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const patch = (body: object) =>
    apiFetch<ApiKeyView>(`/api-keys/${apiKey.id}`, { method: "PATCH", body: JSON.stringify(body) });
  const done = () => {
    setMode(null);
    onChanged();
  };

  async function remove() {
    setError(null);
    try {
      await apiFetch(`/api-keys/${apiKey.id}`, { method: "DELETE" });
      done();
    } catch (failure) {
      setError(failText(failure, "The key did not delete. Try again."));
    }
  }

  return (
    <li className="flex flex-col gap-2.5 panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">{apiKey.name}</span>
          <span className="truncate text-sm text-muted">
            ••••{apiKey.keyLast4} · {usedBy(apiKey.modelCount)}
          </span>
        </div>
        {mode === null && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="pill pill-soft pill-sm" onClick={() => setMode("rename")}>
              Rename
            </button>
            <button type="button" className="pill pill-soft pill-sm" onClick={() => setMode("replace")}>
              Replace
            </button>
            <button type="button" className="pill pill-ghost pill-sm" onClick={() => setMode("delete")}>
              Delete
            </button>
          </div>
        )}
      </div>
      {(mode === "rename" || mode === "replace") && (
        <KeyForm
          label={mode === "rename" ? `Rename ${apiKey.name}` : `Replace the key of ${apiKey.name}`}
          initialName={apiKey.name}
          showName={mode === "rename"}
          showKey={mode === "replace"}
          keyLabel="New API key"
          send={(body) => patch(mode === "rename" ? { name: body.name } : { apiKey: body.apiKey })}
          onDone={done}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === "delete" && (
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label={`Delete ${apiKey.name}`}>
          <span>Delete {apiKey.name}? You cannot undo this.</span>
          <button type="button" className="pill pill-danger pill-sm" onClick={remove}>
            Yes, delete
          </button>
          <button
            type="button"
            className="pill pill-ghost pill-sm"
            onClick={() => {
              setMode(null);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="m-0 text-error">{error}</p>}
    </li>
  );
}

/** The saved API keys of the user, with Add, Rename, Replace, and Delete. No answer has the key, only its last 4. */
export function ApiKeysSection({ apiKeys, onChanged }: { apiKeys: ApiKeyView[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="api-keys-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="api-keys-title" className="m-0 text-xl font-bold">
          API keys
        </h2>
        {!adding && (
          <button type="button" className="pill pill-soft" onClick={() => setAdding(true)}>
            Add a key
          </button>
        )}
      </div>
      {adding && (
        <div className="panel p-4">
          <KeyForm
            label="Add a key"
            showName
            showKey
            keyLabel="API key"
            send={(body) => apiFetch<ApiKeyView>("/api-keys", { method: "POST", body: JSON.stringify(body) })}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {apiKeys.length === 0 && !adding && <p className="m-0 text-muted">You have no saved keys yet.</p>}
      {apiKeys.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {apiKeys.map((apiKey) => (
            <KeyRow key={apiKey.id} apiKey={apiKey} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
