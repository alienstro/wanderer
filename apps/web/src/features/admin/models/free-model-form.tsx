"use client";

import type { AdminFreeModel, ProxyTestResult } from "@wanderer/shared";
import { type FormEvent, useState } from "react";
import { Field } from "@/components/ui/form-field";
import { adminErrorText, optionalNumber } from "@/features/admin/admin-energy";
import { apiFetch } from "@/lib/api";

function TestResult({ result }: { result: ProxyTestResult | "running" }) {
  if (result === "running") {
    return <p className="m-0 text-muted">Testing…</p>;
  }
  return result.ok ? (
    <p className="m-0 text-muted">
      The model answered “{result.reply}” in {result.latencyMs} ms.
    </p>
  ) : (
    <p className="m-0 text-error">{result.message}</p>
  );
}

/** Sends one short call to the model with the server key. A failed call is a result, not an error. */
async function testModel(openrouterId: string): Promise<ProxyTestResult> {
  try {
    return await apiFetch<ProxyTestResult>("/admin/energy/free-models/test", {
      method: "POST",
      body: JSON.stringify({ openrouterId }),
    });
  } catch (error) {
    return { ok: false, error: "provider_error", message: adminErrorText(error, "The test did not run. Try again.") };
  }
}

function NumberField({
  name,
  label,
  hint,
  value,
  step,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  value: string;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <Field name={name} label={label} hint={hint}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          className="field tabular-nums"
          type="number"
          inputMode={step === 1 ? "numeric" : "decimal"}
          min={0}
          step={step}
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

interface FormState {
  openrouterId: string;
  displayName: string;
  sortOrder: string;
  markupPercent: string;
  manualEnergyPrice: string;
  enabled: boolean;
  isDefault: boolean;
}

function initialState(model: AdminFreeModel | undefined): FormState {
  return {
    openrouterId: model?.openrouterId ?? "",
    displayName: model?.displayName ?? "",
    sortOrder: String(model?.sortOrder ?? 0),
    markupPercent: model?.ownMarkupPercent == null ? "" : String(model.ownMarkupPercent),
    manualEnergyPrice: model?.manualEnergyPrice == null ? "" : String(model.manualEnergyPrice),
    enabled: model?.enabled ?? false,
    isDefault: model?.isDefault ?? false,
  };
}

/**
 * The form to add a model, or to edit one. On and Default are in the row of a saved model, so the edit form has the
 * other fields, Test, and Remove. The id of OpenRouter does not change after the add.
 */
export function FreeModelForm({ model, onSaved, onCancel }: { model?: AdminFreeModel; onSaved: () => void; onCancel: () => void }) {
  const [state, setState] = useState(() => initialState(model));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<ProxyTestResult | "running" | null>(null);
  const [removing, setRemoving] = useState(false);
  const set = (change: Partial<FormState>) => setState((current) => ({ ...current, ...change }));
  const title = model ? `Edit ${model.displayName}` : "Add a model";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = {
      displayName: state.displayName.trim(),
      sortOrder: Number(state.sortOrder || 0),
      markupPercent: optionalNumber(state.markupPercent),
      manualEnergyPrice: optionalNumber(state.manualEnergyPrice),
    };
    if ([fields.sortOrder, fields.markupPercent, fields.manualEnergyPrice].some((value) => Number.isNaN(value))) {
      setError("Type a number in each number field, or leave it empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await (model
        ? apiFetch(`/admin/energy/free-models/${model.id}`, { method: "PATCH", body: JSON.stringify(fields) })
        : apiFetch("/admin/energy/free-models", {
            method: "POST",
            body: JSON.stringify({ openrouterId: state.openrouterId.trim(), ...fields, enabled: state.enabled, isDefault: state.isDefault }),
          }));
      onSaved();
    } catch (caught) {
      setError(adminErrorText(caught, "The model did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!model) {
      return;
    }
    try {
      await apiFetch(`/admin/energy/free-models/${model.id}`, { method: "DELETE" });
      onSaved();
    } catch (caught) {
      setError(adminErrorText(caught, "The model did not remove. Try again."));
    }
  }

  const openrouterId = model?.openrouterId ?? state.openrouterId.trim();
  return (
    <form aria-label={title} className="flex flex-col gap-4 p-5" noValidate onSubmit={submit}>
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      {!model && (
        <Field name="openrouterId" label="OpenRouter model ID" required hint="Such as google/gemma-4-31b-it:free. Test sends one short call before you save.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              value={state.openrouterId}
              aria-describedby={describedBy}
              placeholder="google/gemma-4-31b-it:free"
              onChange={(event) => set({ openrouterId: event.target.value })}
            />
          )}
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field name="displayName" label="Name" required hint="Users see this name in Settings.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              value={state.displayName}
              aria-describedby={describedBy}
              placeholder="Gemma"
              onChange={(event) => set({ displayName: event.target.value })}
            />
          )}
        </Field>
        <NumberField
          name="markupPercent"
          label="Own markup (%)"
          hint="Empty follows the text default, else the global markup."
          value={state.markupPercent}
          step={1}
          onChange={(value) => set({ markupPercent: value })}
        />
        <NumberField
          name="manualEnergyPrice"
          label="Manual price (energy)"
          hint="Empty uses the OpenRouter price. A manual price ignores the markup."
          value={state.manualEnergyPrice}
          step={0.01}
          onChange={(value) => set({ manualEnergyPrice: value })}
        />
        <NumberField
          name="sortOrder"
          label="Order"
          hint="Lower numbers show first in Settings."
          value={state.sortOrder}
          step={1}
          onChange={(value) => set({ sortOrder: value })}
        />
      </div>
      {!model && (
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="accent-accent" checked={state.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
            <span>On</span>
          </label>
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="accent-accent" checked={state.isDefault} onChange={(event) => set({ isDefault: event.target.checked })} />
            <span>Default</span>
          </label>
        </div>
      )}
      {test && <TestResult result={test} />}
      {error && (
        <p role="alert" className="m-0 text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="submit" className="pill pill-accent" disabled={saving}>
          Save
        </button>
        <button
          type="button"
          className="pill pill-soft"
          disabled={!openrouterId || test === "running"}
          onClick={async () => {
            setTest("running");
            setTest(await testModel(openrouterId));
          }}
        >
          Test
        </button>
        <button type="button" className="pill pill-ghost" onClick={onCancel}>
          Cancel
        </button>
        {model && !removing && (
          <button type="button" className="pill pill-ghost ml-auto" onClick={() => setRemoving(true)}>
            Remove
          </button>
        )}
      </div>
      {model && removing && (
        <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label={`Remove ${model.displayName}`}>
          <span>Remove {model.displayName}? Users who picked it go back to the default model.</span>
          <button type="button" className="pill pill-danger pill-sm" onClick={remove}>
            Yes, remove {model.displayName}
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={() => setRemoving(false)}>
            Keep it
          </button>
        </div>
      )}
    </form>
  );
}
