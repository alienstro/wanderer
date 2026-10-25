"use client";

import { useState } from "react";

/** The list shows this number of models or less, so a list of 2,000 models stays fast. */
const SHOWN_MAX = 100;

/** The model ids of the proxy, with a search box. A click on an id gives it to onPick. */
export function ModelPicker({ models, onPick }: { models: string[]; onPick: (model: string) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const found = needle ? models.filter((model) => model.toLowerCase().includes(needle)) : models;
  const shown = found.slice(0, SHOWN_MAX);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <input
        type="search"
        className="field"
        aria-label="Search models"
        placeholder={`Search ${models.length.toLocaleString("en-US")} models`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <p className="hint m-0">No model matches the search.</p>
      ) : (
        <ul className="m-0 flex max-h-60 list-none flex-col overflow-y-auto p-0">
          {shown.map((model) => (
            <li key={model}>
              <button
                type="button"
                className="w-full rounded-lg px-2.5 py-1.5 text-left break-all transition-colors hover:bg-hover active:bg-(--color-current)"
                onClick={() => onPick(model)}
              >
                {model}
              </button>
            </li>
          ))}
        </ul>
      )}
      {found.length > shown.length && (
        <p className="hint m-0">
          The list shows {SHOWN_MAX} of {found.length.toLocaleString("en-US")} models. Type to find more.
        </p>
      )}
    </div>
  );
}
