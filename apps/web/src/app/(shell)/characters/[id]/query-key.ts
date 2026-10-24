/** The query key of the character page. The viewer is in the key, because the answer depends on the session. */
export function characterQueryKey(id: string, viewer: string | null) {
  return ["character", id, viewer] as const;
}
