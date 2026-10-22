import "server-only";
import { ApiError } from "./api";

function internalApiUrl(): string {
  // The Next.js server can use a private address of the API. The browser address is the default.
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
}

/** Calls the API from the Next.js server as a visitor: no cookie and no cache. */
export async function serverApiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${internalApiUrl()}${path}`, { cache: "no-store" });
  if (!res.ok) {
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      code = typeof body.error === "string" ? body.error : null;
    } catch {
      // The body is not JSON.
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}
