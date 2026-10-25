import { type ReactNode, useId } from "react";

/** A form field with its label, its hint, and its error. The children get the IDs for the input. */
export function Field({
  name,
  label,
  required,
  hint,
  error,
  children,
}: {
  name: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div data-field={name} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        {label}
        {required && (
          <span className="text-link" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {children({ inputId, describedBy })}
      {error && (
        <span id={errorId} className="text-[13px] text-error">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="hint">
          {hint}
        </span>
      )}
    </div>
  );
}

/** An on/off switch with its label and hint, as a button with role "switch". */
export function Switch({ name, label, hint, checked, onChange }: { name: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  const hintId = useId();
  return (
    <div data-field={name} className="flex items-start justify-between gap-4 rounded-xl bg-surface px-3.5 py-3">
      <span className="flex flex-col">
        <span className="label">{label}</span>
        <span id={hintId} className="hint">
          {hint}
        </span>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={hintId} className="switch" onClick={() => onChange(!checked)}>
        <span className="track">
          <span className="knob" />
        </span>
      </button>
    </div>
  );
}
