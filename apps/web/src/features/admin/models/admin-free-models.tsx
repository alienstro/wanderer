"use client";

import type { AdminFreeModel } from "@wanderer/shared";
import { useState } from "react";
import { adminErrorText, formatUsd, MARKUP_SOURCE_TEXT } from "@/features/admin/admin-energy";
import { AdminSection, PhoneLabel, PRICE_BODY, PRICE_CELL, PRICE_EDIT_CELL, PRICE_EDIT_ROW, PRICE_HEAD, PRICE_ROW, PRICE_TABLE } from "@/features/admin/components/admin-section";
import { apiFetch } from "@/lib/api";
import { FreeModelForm } from "./free-model-form";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const COLUMNS = 7;

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
