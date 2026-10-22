const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a UUID. A route checks an ID first, because Postgres rejects a bad UUID with an error, not with no row. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
