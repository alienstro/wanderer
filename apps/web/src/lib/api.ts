/** An answer from the API with a status that is not 2xx. code is the "error" value of the body, when it has one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(code ? `API error ${status}: ${code}` : `API error ${status}`);
    this.name = "ApiError";
  }
}

function apiUrl(): string {
  // Next.js puts the value of NEXT_PUBLIC_API_URL into the browser code at build time.
  return process.env.NEXT_PUBLIC_API_URL ?? "";
}

/** Gives the full address of an API file path such as `/files/<id>`. */
export function fileSrc(path: string): string {
  return `${apiUrl()}${path}`;
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // The body is not JSON.
  }
  return null;
}

/** Sends a request to the API with the session cookie. It throws ApiError for a status that is not 2xx. */
export async function apiResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // A string body is JSON. The browser sets the Content-Type of FormData itself, with the multipart boundary.
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiUrl()}${path}`, { ...init, headers, credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status, await errorCode(res));
  }
  return res;
}

/** Calls the API from the browser with the session cookie, and reads the JSON answer. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiResponse(path, init);
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}
