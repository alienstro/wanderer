import type { Persona, PersonaInput, PersonaListResponse } from "@wanderer/shared";
import { apiFetch } from "@/lib/api";

/** The query key of the personas list. A change to the list loads it again with this key. */
export const personasKey = ["personas"] as const;

export function fetchPersonas(): Promise<PersonaListResponse> {
  return apiFetch<PersonaListResponse>("/personas");
}

export function createPersona(input: PersonaInput): Promise<Persona> {
  return apiFetch<Persona>("/personas", { method: "POST", body: JSON.stringify(input) });
}

export function updatePersona(id: string, input: PersonaInput): Promise<Persona> {
  return apiFetch<Persona>(`/personas/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function makeDefaultPersona(id: string): Promise<PersonaListResponse> {
  return apiFetch<PersonaListResponse>(`/personas/${id}/default`, { method: "POST" });
}

export function deletePersona(id: string): Promise<void> {
  return apiFetch<void>(`/personas/${id}`, { method: "DELETE" });
}
