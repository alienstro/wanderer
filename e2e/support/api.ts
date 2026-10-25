import { request, type APIRequestContext } from "@playwright/test";
import { API_URL, WEB_URL } from "./env.js";
import type { storageState } from "./users.js";

export interface CharacterOptions {
  title: string;
  isAdult?: boolean;
  opening?: string;
}

/** A storage state file of an E2E_USERS user, or the state of a user that a test makes. */
export interface WithStorageState {
  storageState: string | ReturnType<typeof storageState>;
}

/** An API client with the session of the user. It sends the web Origin, as the browser does. */
export async function apiAs(user: WithStorageState): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    storageState: user.storageState,
    extraHTTPHeaders: { Origin: WEB_URL },
  });
}

/** Sends a POST and gives the JSON body. A status that is not 2xx stops the test with the body. */
export async function postJson<T>(api: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await api.post(path, { data });
  if (!res.ok()) {
    throw new Error(`POST ${path} gave ${res.status()}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** Makes a published, public character through the API and gives its id. */
export async function createCharacter(user: WithStorageState, options: CharacterOptions): Promise<string> {
  const api = await apiAs(user);
  try {
    const character = await postJson<{ id: string }>(api, "/characters", {
      title: options.title,
      bio: `The bio of ${options.title}.`,
      personality: "Calm and kind.",
      openings: [options.opening ?? `Hello from ${options.title}.`],
      isAdult: options.isAdult ?? false,
      publish: true,
    });
    return character.id;
  } finally {
    await api.dispose();
  }
}
