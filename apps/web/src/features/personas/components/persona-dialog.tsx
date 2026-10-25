"use client";

import {
  PERSONA_DESCRIPTION_MAX,
  PERSONA_LIMIT,
  PERSONA_NAME_MAX,
  type Persona,
  type PersonaInput,
  personaInputSchema,
} from "@wanderer/shared";
import { type FormEvent, useState } from "react";
import { Field } from "@/components/ui/form-field";
import { ApiError } from "@/lib/api";
import { createPersona, updatePersona } from "../api";
import { Modal } from "./modal";

const NAME_MESSAGE = `Enter a name of ${PERSONA_NAME_MAX} characters or less.`;
const DESCRIPTION_MESSAGE = `Use ${PERSONA_DESCRIPTION_MAX.toLocaleString("en-US")} characters or less.`;

function failText(error: unknown): string {
  if (error instanceof ApiError && error.code === "persona_limit") {
    return `You can save up to ${PERSONA_LIMIT} personas.`;
  }
  return "The persona did not save. Try again.";
}

/** Adds a persona, or edits the persona that the parent gives. */
export function PersonaDialog({
  persona,
  onSaved,
  onClose,
}: {
  persona?: Persona;
  onSaved: (saved: Persona) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(persona?.name ?? "");
  const [description, setDescription] = useState(persona?.description ?? "");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = personaInputSchema.safeParse({ name, description });
    if (!parsed.success) {
      const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
      setErrors({
        name: fields.has("name") ? NAME_MESSAGE : undefined,
        description: fields.has("description") ? DESCRIPTION_MESSAGE : undefined,
      });
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const input: PersonaInput = parsed.data;
      onSaved(persona ? await updatePersona(persona.id, input) : await createPersona(input));
    } catch (error) {
      setFormError(failText(error));
      setSaving(false);
    }
  }

  return (
    <Modal title={persona ? "Edit persona" : "Add persona"} onClose={onClose}>
      <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void submit(event)}>
        <Field name="name" label="Name" required error={errors.name}>
          {({ inputId, describedBy }) => (
            <input
              id={inputId}
              className="field"
              maxLength={PERSONA_NAME_MAX}
              value={name}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field
          name="description"
          label="Description"
          error={errors.description}
          hint={`${description.length.toLocaleString("en-US")} / ${PERSONA_DESCRIPTION_MAX.toLocaleString("en-US")}`}
        >
          {({ inputId, describedBy }) => (
            <textarea
              id={inputId}
              className="field min-h-32"
              maxLength={PERSONA_DESCRIPTION_MAX}
              placeholder="Your look, your age, your past."
              value={description}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={describedBy}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        {formError && (
          <p role="alert" className="m-0 text-error">
            {formError}
          </p>
        )}
        <div className="flex gap-2.5">
          <button type="submit" className="pill pill-accent pill-sm" disabled={saving}>
            Save
          </button>
          <button type="button" className="pill pill-ghost pill-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
