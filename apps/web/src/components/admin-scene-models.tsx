"use client";

import type { AdminEnergySettings, AdminSceneModel } from "@wanderer/shared";
import { type FormEvent, useState } from "react";
import { adminErrorText, formatUsd, MARKUP_SOURCE_TEXT, optionalNumber, putSettings } from "@/lib/admin-energy";
import { apiFetch } from "@/lib/api";
import { AdminSection, PhoneLabel, PRICE_BODY, PRICE_CELL, PRICE_EDIT_CELL, PRICE_EDIT_ROW, PRICE_HEAD, PRICE_ROW, PRICE_TABLE } from "./admin-section";
import { Field } from "./form-field";

const COLUMNS = 7;

function putSceneModel(model: AdminSceneModel, fields: { costUsd: number; markupPercent: number | null; enabled: boolean }) {
  return apiFetch(`/admin/energy/scene-models/${model.key}`, { method: "PUT", body: JSON.stringify(fields) });
}

/** The form of one scene image model: its RunPod cost and its own markup. On and Active are in the row. */
function SceneModelForm({ model, onSaved, onCancel }: { model: AdminSceneModel; onSaved: () => void; onCancel: () => void }) {
  const [costUsd, setCostUsd] = useState(String(model.costUsd));
  const [markup, setMarkup] = useState(model.ownMarkupPercent === null ? "" : String(model.ownMarkupPercent));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = `Edit ${model.label}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = { costUsd: Number(costUsd), markupPercent: optionalNumber(markup), enabled: model.enabled };
    if (costUsd.trim() === "" || Number.isNaN(fields.costUsd) || Number.isNaN(fields.markupPercent)) {
      setError("Type a number in each number field. Only the markup can be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await putSceneModel(model, fields);
      onSaved();
    } catch (caught) {
      setError(adminErrorText(caught, "The scene model did not save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-label={title} className="flex flex-col gap-4 p-5" noValidate onSubmit={submit}>
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field name="costUsd" label="Cost of one image (USD)" required hint="From the RunPod docs or the RunPod bill, such as 0.003.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field tabular-nums"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={costUsd}
              aria-describedby={describedBy}
              onChange={(event) => setCostUsd(event.target.value)}
            />
          )}
        </Field>
        <Field name="markupPercent" label="Own markup (%)" hint="Empty follows the image default, else the global markup.">
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field tabular-nums"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={markup}
              aria-describedby={describedBy}
              onChange={(event) => setMarkup(event.target.value)}
            />
          )}
        </Field>
      </div>
      {error && (
        <p role="alert" className="m-0 text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="submit" className="pill pill-accent" disabled={saving}>
          Save
        </button>
        <button type="button" className="pill pill-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SceneModelRow({
  model,
  settings,
  editing,
  onEdit,
  onChanged,
}: {
  model: AdminSceneModel;
  settings: AdminEnergySettings;
  editing: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, failText: string) {
    setError(null);
    try {
      await action();
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
          aria-label={`On: ${model.label}`}
          className="switch"
          onClick={() =>
            run(
              () => putSceneModel(model, { costUsd: model.costUsd, markupPercent: model.ownMarkupPercent, enabled: !model.enabled }),
              "The scene model did not change.",
            )
          }
        >
          <span className="track">
            <span className="knob" />
          </span>
        </button>
      </td>
      <td className={PRICE_CELL.name}>
        <span className={`block font-semibold ${model.enabled ? "text-text" : ""}`}>{model.label}</span>
        <span className="block text-[13px] text-subtle">RunPod</span>
        {error && <span className="mt-1 block max-w-[48ch] text-[13px] text-error">{error}</span>}
      </td>
      <td className={PRICE_CELL.pick}>
        <PhoneLabel>Active</PhoneLabel>
        <input
          type="radio"
          className="accent-accent"
          name="active-scene-model"
          aria-label={`Active: ${model.label}`}
          checked={model.active}
          disabled={!model.enabled}
          onChange={() => run(() => putSettings(settings, { sceneModelKey: model.key }), "The scene model did not change.")}
        />
      </td>
      <td className={PRICE_CELL.cost}>
        <PhoneLabel>Cost</PhoneLabel>
        {formatUsd(model.costUsd)}
      </td>
      <td className={PRICE_CELL.markup}>
        <PhoneLabel>Markup</PhoneLabel>
        <span className="block">{model.markupPercent}%</span>
        <span className={`block text-[12px] ${model.markupSource === "model" ? "text-link" : "text-subtle"}`}>
          {MARKUP_SOURCE_TEXT[model.markupSource]}
        </span>
      </td>
      <td className={PRICE_CELL.price}>
        <PhoneLabel>Price</PhoneLabel>
        <span className={`block font-semibold ${model.enabled ? "text-text" : ""}`}>{model.energyPrice} energy</span>
        <span className="block text-[12px] text-subtle">{formatUsd(model.usdValue)}</span>
      </td>
      <td className={PRICE_CELL.edit}>
        <button type="button" className="pill pill-soft pill-sm" aria-expanded={editing} onClick={onEdit}>
          Edit
        </button>
      </td>
    </tr>
  );
}

/** The RunPod image models that the app supports, as a price table. The radio picks the model of the scene images. */
export function SceneModelsSection({
  models,
  settings,
  onChanged,
}: {
  models: AdminSceneModel[];
  settings: AdminEnergySettings;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <AdminSection
      id="scene-models-title"
      title="Scene image models"
      hint="Each scene image uses the server RunPod key, so it costs energy for each user, also with an own text model. The active model makes the next image."
    >
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
                Active
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Cost of an image
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Markup
              </th>
              <th scope="col" className="py-2.5 pr-4 font-medium">
                Price of an image
              </th>
              <th scope="col" className="py-2.5 pr-4">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className={PRICE_BODY}>
            {models.flatMap((model) => [
              <SceneModelRow
                key={model.key}
                model={model}
                settings={settings}
                editing={editing === model.key}
                onEdit={() => setEditing(editing === model.key ? null : model.key)}
                onChanged={onChanged}
              />,
              editing === model.key && (
                <tr key={`${model.key}-edit`} className={PRICE_EDIT_ROW}>
                  <td colSpan={COLUMNS} className={PRICE_EDIT_CELL}>
                    <SceneModelForm
                      model={model}
                      onSaved={() => {
                        setEditing(null);
                        onChanged();
                      }}
                      onCancel={() => setEditing(null)}
                    />
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
