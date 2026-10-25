"use client";

import type { AdminEnergySettings, AdminFreeModel, AdminSceneModel, EnergySettingsInput } from "@wanderer/shared";
import { type FormEvent, useId, useState } from "react";
import { adminErrorText, optionalNumber, putSettings } from "@/features/admin/admin-energy";
import { Field } from "@/components/ui/form-field";

type Message = { error: boolean; text: string } | null;

/** Saves the settings with the changes of one form. It gives the message to show under the form. */
async function saveSettings(settings: AdminEnergySettings, changes: Partial<EnergySettingsInput>): Promise<Message> {
  try {
    await putSettings(settings, changes);
    return { error: false, text: "Saved. The next action uses the new values." };
  } catch (error) {
    return { error: true, text: adminErrorText(error, "The settings did not save. Try again.") };
  }
}

function FormMessage({ message }: { message: Message }) {
  if (!message) {
    return null;
  }
  return (
    <p role={message.error ? "alert" : "status"} className={`m-0 ${message.error ? "text-error" : "text-muted"}`}>
      {message.text}
    </p>
  );
}

/** One group default of the markup panel, joined to the global markup by a line. */
function GroupMarkup({
  label,
  value,
  globalValue,
  following,
  total,
  onChange,
}: {
  label: string;
  value: string;
  globalValue: string;
  following: number;
  total: number;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const statusId = useId();
  const empty = value.trim() === "";
  return (
    <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1 before:absolute before:top-1/2 before:-left-6 before:h-px before:w-4 before:bg-field-line">
      <label htmlFor={inputId} className="label w-28">
        {label}
      </label>
      <span className="flex items-center gap-1.5">
        <input
          id={inputId}
          className="field w-20 text-right tabular-nums"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          aria-describedby={statusId}
          placeholder={globalValue}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-muted">%</span>
      </span>
      <span id={statusId} className="flex flex-col text-[13px]">
        <span className={empty ? "text-muted" : "text-link"}>{empty ? `Uses the global ${globalValue || 0}%` : "Replaces the global markup"}</span>
        <span className="text-subtle">
          {following} of {total} models follow it
        </span>
      </span>
    </div>
  );
}

/**
 * The markup of all prices. A model markup wins over the default of its group, and an empty group default uses the
 * global markup. The panel shows this order as a line from the global markup to each group.
 */
export function MarkupPanel({
  settings,
  freeModels,
  sceneModels,
  onSaved,
}: {
  settings: AdminEnergySettings;
  freeModels: AdminFreeModel[];
  sceneModels: AdminSceneModel[];
  onSaved: () => void;
}) {
  const globalId = useId();
  const [globalValue, setGlobalValue] = useState(String(settings.globalMarkupPercent));
  const [text, setText] = useState(settings.textMarkupPercent === null ? "" : String(settings.textMarkupPercent));
  const [image, setImage] = useState(settings.imageMarkupPercent === null ? "" : String(settings.imageMarkupPercent));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const changes = {
      globalMarkupPercent: Number(globalValue),
      textMarkupPercent: optionalNumber(text),
      imageMarkupPercent: optionalNumber(image),
    };
    if (globalValue.trim() === "" || Object.values(changes).some((value) => Number.isNaN(value))) {
      setMessage({ error: true, text: "Type a whole number. Only a group default can be empty." });
      return;
    }
    setSaving(true);
    const result = await saveSettings(settings, changes);
    setSaving(false);
    setMessage(result);
    if (!result?.error) {
      onSaved();
    }
  }

  return (
    <form aria-label="Markup" className="panel flex flex-col gap-6 p-6 max-[760px]:p-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base">Markup</h2>
        <p className="m-0 max-w-[64ch] text-[13px] text-muted">
          Each price is the cost of the model plus a markup. A model with its own markup uses it. Else it uses the default of its group, and an empty group uses the global markup.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
        <div className="flex flex-col gap-1">
          <label htmlFor={globalId} className="label">
            Global markup
          </label>
          <span className="flex items-baseline gap-1">
            <input
              id={globalId}
              className="w-[3.2ch] border-0 border-b-2 border-accent bg-transparent p-0 text-right text-[44px] leading-none font-semibold tabular-nums text-text outline-offset-4 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={globalValue}
              onChange={(event) => setGlobalValue(event.target.value)}
            />
            <span className="text-[28px] font-semibold text-muted">%</span>
          </span>
        </div>
        <div className="flex flex-col gap-4 border-l border-field-line pl-6">
          <GroupMarkup
            label="Text models"
            value={text}
            globalValue={globalValue}
            following={freeModels.filter((model) => model.markupSource !== "model" && model.manualEnergyPrice === null).length}
            total={freeModels.length}
            onChange={setText}
          />
          <GroupMarkup
            label="Scene images"
            value={image}
            globalValue={globalValue}
            following={sceneModels.filter((model) => model.markupSource !== "model").length}
            total={sceneModels.length}
            onChange={setImage}
          />
        </div>
      </div>
      <FormMessage message={message} />
      <div>
        <button type="submit" className="pill pill-accent" disabled={saving}>
          Save markups
        </button>
      </div>
    </form>
  );
}

const LIMIT_FIELDS = [
  { name: "dailyEnergy", label: "Daily energy", hint: "Each user gets this balance again at 00:00 UTC.", step: 0.01 },
  { name: "choicesPrice", label: "Reply choices price (energy)", hint: "For one set of four choices on a free model.", step: 0.01 },
  { name: "memoryPrice", label: "Memory draft price (energy)", hint: "For one memory draft on a free model.", step: 0.01 },
  {
    name: "freeDailyCap",
    label: "Daily cap of free model calls",
    hint: "For all users together. Keep it a little below the OpenRouter limit of the server key.",
    step: 1,
  },
] as const;

type LimitName = (typeof LIMIT_FIELDS)[number]["name"];

/** The daily energy of each user, the prices of the actions that are not replies, and the daily cap. */
export function LimitsForm({ settings, onSaved }: { settings: AdminEnergySettings; onSaved: () => void }) {
  const [values, setValues] = useState<Record<LimitName, string>>(
    () => Object.fromEntries(LIMIT_FIELDS.map(({ name }) => [name, String(settings[name])])) as Record<LimitName, string>,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const changes = Object.fromEntries(LIMIT_FIELDS.map(({ name }) => [name, Number(values[name])])) as Record<LimitName, number>;
    if (LIMIT_FIELDS.some(({ name }) => values[name].trim() === "" || Number.isNaN(changes[name]))) {
      setMessage({ error: true, text: "Type a number in each field." });
      return;
    }
    setSaving(true);
    const result = await saveSettings(settings, changes);
    setSaving(false);
    setMessage(result);
    if (!result?.error) {
      onSaved();
    }
  }

  return (
    <section aria-labelledby="energy-limits-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="energy-limits-title" className="m-0 text-base">
          Energy and limits
        </h2>
        <p className="m-0 max-w-[64ch] text-[13px] text-muted">1 energy has a value of $0.01. Each energy value can have 2 decimal places.</p>
      </div>
      <form aria-label="Energy and limits" className="panel flex flex-col gap-4 p-5" noValidate onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LIMIT_FIELDS.map(({ name, label, hint, step }) => (
            <Field key={name} name={name} label={label} hint={hint}>
              {({ inputId, describedBy }) => (
                <input
                  id={inputId}
                  className="field tabular-nums"
                  type="number"
                  inputMode={step === 1 ? "numeric" : "decimal"}
                  min={0}
                  step={step}
                  value={values[name]}
                  aria-describedby={describedBy}
                  onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>
        <FormMessage message={message} />
        <div>
          <button type="submit" className="pill pill-accent" disabled={saving}>
            Save limits
          </button>
        </div>
      </form>
    </section>
  );
}
