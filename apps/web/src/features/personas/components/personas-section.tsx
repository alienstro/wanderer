"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PERSONA_LIMIT, type Persona } from "@wanderer/shared";
import { useState } from "react";
import { deletePersona, fetchPersonas, makeDefaultPersona, personasKey } from "../api";
import { Modal } from "./modal";
import { PersonaDialog } from "./persona-dialog";

const LIMIT_TEXT = `You can save up to ${PERSONA_LIMIT} personas.`;

function DeleteModal({ persona, onDone, onClose }: { persona: Persona; onDone: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setError(null);
    setDeleting(true);
    try {
      await deletePersona(persona.id);
      onDone();
    } catch {
      setError("The persona did not delete. Try again.");
      setDeleting(false);
    }
  }

  return (
    <Modal title={`Delete ${persona.name}?`} onClose={onClose}>
      <p className="m-0 mb-4 text-muted">Old chats keep this persona.</p>
      {error && (
        <p role="alert" className="m-0 mb-3 text-error">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button type="button" className="pill pill-danger pill-sm" disabled={deleting} onClick={() => void remove()}>
          Delete
        </button>
        <button type="button" className="pill pill-ghost pill-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function PersonaRow({
  persona,
  onMakeDefault,
  onEdit,
  onDelete,
}: {
  persona: Persona;
  onMakeDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li aria-label={persona.name} className="flex flex-wrap items-center justify-between gap-3 panel p-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{persona.name}</span>
        {persona.isDefault && <span className="rounded-full border border-line px-2 text-xs text-muted">Default</span>}
      </div>
      <div className="flex gap-2">
        {!persona.isDefault && (
          <button type="button" className="pill pill-soft pill-sm" onClick={onMakeDefault}>
            Make default
          </button>
        )}
        <button type="button" className="pill pill-soft pill-sm" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="pill pill-ghost pill-sm" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  );
}

/** The Personas part of Settings. A new chat copies the default persona. */
export function PersonasSection() {
  const queryClient = useQueryClient();
  const personas = useQuery({ queryKey: personasKey, queryFn: fetchPersonas });
  const [deleting, setDeleting] = useState<Persona | null>(null);
  // "new" opens the dialog for a new persona. A persona opens it for an edit.
  const [editing, setEditing] = useState<Persona | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = personas.data?.personas ?? [];
  const full = list.length >= PERSONA_LIMIT;

  const reload = () => queryClient.invalidateQueries({ queryKey: personasKey });

  async function makeDefault(persona: Persona) {
    setError(null);
    try {
      queryClient.setQueryData(personasKey, await makeDefaultPersona(persona.id));
    } catch {
      setError("The default did not change. Try again.");
    }
  }

  return (
    <section className="flex flex-col gap-3 panel p-5">
      <h2 className="m-0 text-lg font-bold">
        Personas{" "}
        <span className="font-normal text-muted">
          ({list.length} of {PERSONA_LIMIT})
        </span>
      </h2>
      <p className="m-0 text-muted">A new chat uses your default persona as your name and facts.</p>
      {personas.isError && <p className="m-0 text-error">The personas did not load. Try again.</p>}
      {list.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {list.map((persona) => (
            <PersonaRow
              key={persona.id}
              persona={persona}
              onMakeDefault={() => void makeDefault(persona)}
              onEdit={() => setEditing(persona)}
              onDelete={() => setDeleting(persona)}
            />
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="m-0 text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="pill pill-accent pill-sm"
          disabled={full || personas.isPending}
          onClick={() => setEditing("new")}
        >
          Add persona
        </button>
        {full && <span className="text-sm text-muted">{LIMIT_TEXT}</span>}
      </div>
      {editing && (
        <PersonaDialog
          persona={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      {deleting && (
        <DeleteModal
          persona={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => {
            setDeleting(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}
