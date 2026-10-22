import { request, type APIRequestContext } from "@playwright/test";
import { API_URL, WEB_URL } from "./env.js";
import type { E2EUserWithState } from "./users.js";

export interface CharacterOptions {
  title: string;
  isAdult?: boolean;
  opening?: string;
}

/** An API client with the session of the user. It sends the web Origin, as the browser does. */
export async function apiAs(user: E2EUserWithState): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    storageState: user.storageState,
    extraHTTPHeaders: { Origin: WEB_URL },
  });
}

/** Makes a published, public character through the API and gives its id. */
export async function createCharacter(user: E2EUserWithState, options: CharacterOptions): Promise<string> {
  const api = await apiAs(user);
  try {
    const res = await api.post("/characters", {
      data: {
        title: options.title,
        bio: `The bio of ${options.title}.`,
        personality: "Calm and kind.",
        openings: [options.opening ?? `Hello from ${options.title}.`],
        isAdult: options.isAdult ?? false,
        publish: true,
      },
    });
    if (!res.ok()) {
      throw new Error(`POST /characters gave ${res.status()}: ${await res.text()}`);
    }
    return ((await res.json()) as { id: string }).id;
  } finally {
    await api.dispose();
  }
}
