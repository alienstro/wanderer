import OpenAI from "openai";
import { Agent, type Dispatcher, fetch as undiciFetch } from "undici";
import { assertProxyUrl, createGuardedLookup } from "./url-guard.js";

/** The decrypted data for one call to a proxy. Keep it only for the call. */
export interface AiTarget {
  /** The full URL of the chat completions endpoint. */
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AiClientFactory {
  create(target: AiTarget): OpenAI;
}

/** The Nest injection token for the AiClientFactory. */
export const AI_CLIENT_FACTORY = Symbol("AI_CLIENT_FACTORY");

/** The URL that the API sends each request to. "Add /chat/completions" adds the path to the proxy URL. */
export function proxyEndpoint(baseUrl: string, appendPath: boolean): string {
  return appendPath ? `${baseUrl}/chat/completions` : baseUrl;
}

/**
 * Makes an OpenAI client that sends every request to the endpoint of the target, whatever path the SDK
 * builds, because the user gives the full endpoint when "Add /chat/completions" is off.
 */
export function createOpenAiClient(
  target: AiTarget,
  transport: { fetch: typeof undiciFetch; dispatcher?: Dispatcher },
): OpenAI {
  const { fetch, dispatcher } = transport;
  return new OpenAI({
    apiKey: target.apiKey,
    baseURL: target.endpoint,
    maxRetries: 0,
    fetch: ((_input: unknown, init?: Parameters<typeof undiciFetch>[1]) =>
      fetch(target.endpoint, { ...init, dispatcher, redirect: "error" })) as unknown as OpenAI["fetch"],
  });
}

/**
 * The real factory. It refuses a blocked URL before the call, and its undici agent checks each DNS answer
 * and connects to the checked address (the SSRF guard). Redirects fail, and the SDK does not retry.
 */
export class GuardedAiClientFactory implements AiClientFactory {
  private readonly agent: Agent;

  constructor(resolve?: Parameters<typeof createGuardedLookup>[0]) {
    this.agent = new Agent({ connect: { lookup: createGuardedLookup(resolve) } });
  }

  create(target: AiTarget): OpenAI {
    assertProxyUrl(target.endpoint);
    return createOpenAiClient(target, { fetch: undiciFetch, dispatcher: this.agent });
  }
}
