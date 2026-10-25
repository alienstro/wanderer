"use client";

import type { AdminFreeModel, ProxyTestResult } from "@wanderer/shared";
import { type FormEvent, useState } from "react";
import { adminErrorText, formatUsd, MARKUP_SOURCE_TEXT, optionalNumber } from "@/lib/admin-energy";
import { apiFetch } from "@/lib/api";
import { AdminSection, PhoneLabel, PRICE_BODY, PRICE_CELL, PRICE_EDIT_CELL, PRICE_EDIT_ROW, PRICE_HEAD, PRICE_ROW, PRICE_TABLE } from "./admin-section";
import { Field } from "@/components/ui/form-field";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const COLUMNS = 7;

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
function FreeModelForm({ model, onSaved, onCancel }: { model?: AdminFreeModel; onSaved: () => void; onCancel: () => void }) {
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

function FreeModelRow({
  model,
  editing,
  onEdit,
  onChanged,
}: {
  model: AdminFreeModel;
  editing: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function patch(fields: Partial<AdminFreeModel>, failText: string) {
    setError(null);
    try {
      await apiFetch(`/admin/energy/free-models/${model.id}`, { method: "PATCH", body: JSON.stringify(fields) });
      onChanged();
    } catch (caught) {
      setError(adminErrorText(caught, failText));
    }
  }

  return (
    <tr className={`${PRICE_ROW} ${model.enabled ? "" : "text-muted"}`}>
      <td className={PRICE_CELL.on}>
        <button
          type="button"
          role="switch"
          aria-checked={model.enabled}
          aria-label={`On: ${model.displayName}`}
          className="switch"
          onClick={() => patch({ enabled: !model.enabled }, "The model did not change.")}
        >
          <span className="track">
            <span className="knob" />
          </span>
        </button>
      </td>
      <td className={PRICE_CELL.name}>
        <span className={`block font-semibold ${model.enabled ? "text-text" : ""}`}>{model.displayName}</span>
        <span className="block truncate text-[13px] text-subtle">{model.openrouterId}</span>
        {error && <span className="mt-1 block text-[13px] text-error">{error}</span>}
      </td>
      <td className={PRICE_CELL.pick}>
        <PhoneLabel>Default</PhoneLabel>
        <input
          type="radio"
          className="accent-accent"
          name="default-free-model"
          aria-label={`Default: ${model.displayName}`}
          checked={model.isDefault}
          onChange={() => patch({ isDefault: true }, "The default did not change.")}
        />
      </td>
      <td className={PRICE_CELL.cost}>
        <PhoneLabel>Cost</PhoneLabel>
        {model.costUsd === null ? <span className="block">—</span> : <span className="block">{formatUsd(model.costUsd)}</span>}
        <span className="block text-[12px] text-subtle">
          {model.costUsd === null
            ? "No paid version"
            : model.pricesFetchedAt
              ? `Read ${dateFormat.format(new Date(model.pricesFetchedAt))}`
              : "Not read yet"}
        </span>
      </td>
      <td className={PRICE_CELL.markup}>
        <PhoneLabel>Markup</PhoneLabel>
        {model.manualEnergyPrice !== null ? (
          <>
            <span className="block">—</span>
            <span className="block text-[12px] text-subtle">manual price</span>
          </>
        ) : (
          <>
            <span className="block">{model.markupPercent}%</span>
            <span className={`block text-[12px] ${model.markupSource === "model" ? "text-link" : "text-subtle"}`}>
              {MARKUP_SOURCE_TEXT[model.markupSource]}
            </span>
          </>
        )}
      </td>
      <td className={PRICE_CELL.price}>
        <PhoneLabel>Price</PhoneLabel>
        {model.energyPrice === null || model.usdValue === null ? (
          <span className="block text-gold">No price</span>
        ) : (
          <>
            <span className={`block font-semibold ${model.enabled ? "text-text" : ""}`}>{model.energyPrice} energy</span>
            <span className="block text-[12px] text-subtle">{formatUsd(model.usdValue)}</span>
          </>
        )}
      </td>
      <td className={PRICE_CELL.edit}>
        <button type="button" className="pill pill-soft pill-sm" aria-expanded={editing} onClick={onEdit}>
          Edit
        </button>
      </td>
    </tr>
  );
}

/** The free text models as a price table, with Add a model and Refresh prices. */
export function FreeModelsSection({ models, onChanged }: { models: AdminFreeModel[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const saved = () => {
    setEditing(null);
    onChanged();
  };

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await apiFetch("/admin/energy/prices/refresh", { method: "POST" });
      onChanged();
    } catch (error) {
      setRefreshError(adminErrorText(error, "The prices did not load. Try again."));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AdminSection
      id="free-models-title"
      title="Free text models"
      hint="Users with no model of their own chat on these OpenRouter models with the server key. The cost of a reply comes from the paid version of the model. The app reads the prices one time each day."
      actions={
        <>
          <button type="button" className="pill pill-soft" disabled={refreshing} onClick={refresh}>
            {refreshing ? "Loading…" : "Refresh prices"}
          </button>
          <button type="button" className="pill pill-accent" onClick={() => setEditing("new")}>
            Add a model
          </button>
        </>
      }
    >
      {refreshError && (
        <p role="alert" className="m-0 text-error">
          {refreshError}
        </p>
      )}
      {editing === "new" && (
        <div className="panel">
          <FreeModelForm onSaved={saved} onCancel={() => setEditing(null)} />
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className={PRICE_TABLE}>
          <thead className={PRICE_HEAD}>
            <tr className="text-[12px] text-subtle">
              <th scope="col" className="py-2.5 pr-2 pl-4 font-medium">
                On
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Model
              </th>
              <th scope="col" className="py-2.5 pr-4 text-center font-medium">
                Default
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Cost of a reply
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Markup
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Price of a reply
              </th>
              <th scope="col" className="py-2.5 pr-4">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className={PRICE_BODY}>
            {models.length === 0 && (
              <tr className="border-t border-line">
                <td colSpan={COLUMNS} className="px-4 py-6 text-muted">
                  No free models yet. Add a model, so users can chat with no API key.
                </td>
              </tr>
            )}
            {models.flatMap((model) => [
              <FreeModelRow
                key={model.id}
                model={model}
                editing={editing === model.id}
                onEdit={() => setEditing(editing === model.id ? null : model.id)}
                onChanged={onChanged}
              />,
              editing === model.id && (
                <tr key={`${model.id}-edit`} className={PRICE_EDIT_ROW}>
                  <td colSpan={COLUMNS} className={PRICE_EDIT_CELL}>
                    <FreeModelForm model={model} onSaved={saved} onCancel={() => setEditing(null)} />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </AdminSection>
  );
}
