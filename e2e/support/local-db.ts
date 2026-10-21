import pg from "pg";
import { DATABASE_URL } from "./env.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Stops the run before any write when the database is not on this machine. */
export function assertLocalDatabase(url: string): void {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // The check below stops the run.
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`The e2e tests run only against a local database. DATABASE_URL points to "${host || "nothing"}".`);
  }
}

/** Opens a connection to the e2e database, runs the callback, and closes the connection. */
export async function withDb<T>(callback: (client: pg.Client) => Promise<T>): Promise<T> {
  assertLocalDatabase(DATABASE_URL);
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}
