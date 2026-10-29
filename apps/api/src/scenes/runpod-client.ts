import { setTimeout as sleep } from "node:timers/promises";
import type { SceneModelKey } from "@wanderer/shared";
import { SCENE_MODELS } from "./scene-models.js";

const API_URL = "https://api.runpod.ai/v2";
/** The result URLs of RunPod are on this host or on its subdomains. */
const IMAGE_HOST = "runpod.ai";
const POLL_MS = 1_000;
const TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 15_000;
const FAILED_STATUSES = new Set(["FAILED", "CANCELLED", "TIMED_OUT"]);

export type SceneErrorCode = "scene_failed" | "scene_timeout";

/** The image job failed or passed the time limit. The message never holds the API key. */
export class SceneImageError extends Error {
  constructor(
    readonly code: SceneErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SceneImageError";
  }
}

export interface SceneImageRequest {
  model: SceneModelKey;
  prompt: string;
  negativePrompt: string;
}

/** Makes one image from a text prompt. A test replaces it with a fake. */
export interface SceneImageClient {
  generate(request: SceneImageRequest): Promise<Buffer>;
}

/** The Nest injection token for the SceneImageClient. */
export const SCENE_IMAGE_CLIENT = Symbol("SCENE_IMAGE_CLIENT");

interface RunPodOptions {
  fetch?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

interface JobStatus {
  id?: string;
  status?: string;
  output?: { result?: unknown; image_url?: unknown };
}

/**
 * Calls a RunPod public image endpoint. It starts the job with /run and reads /status, because /runsync can pass
 * the HTTP time limit of a proxy. Only the API server holds the key.
 */
export class RunPodClient implements SceneImageClient {
  private readonly fetch: typeof fetch;
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly apiKey: string,
    options: RunPodOptions = {},
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.pollMs = options.pollMs ?? POLL_MS;
    this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  }

  async generate(request: SceneImageRequest): Promise<Buffer> {
    const deadline = Date.now() + this.timeoutMs;
    const model = SCENE_MODELS[request.model];
    const baseUrl = `${API_URL}/${model.endpointId}`;
    const started = await this.call("POST", `${baseUrl}/run`, { input: model.input(request) });
    const jobId = started.id;
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new SceneImageError("scene_failed", "RunPod gave no job ID");
    }
    let job = started;
    while (job.status !== "COMPLETED") {
      if (job.status && FAILED_STATUSES.has(job.status)) {
        throw new SceneImageError("scene_failed", `The RunPod job ended with ${job.status}`);
      }
      if (Date.now() >= deadline) {
        await this.call("POST", `${baseUrl}/cancel/${jobId}`).catch(() => undefined);
        throw new SceneImageError("scene_timeout", "The RunPod job passed the time limit");
      }
      await sleep(this.pollMs);
      job = await this.call("GET", `${baseUrl}/status/${jobId}`);
    }
    // The live endpoint gives `output.result`. The RunPod docs show `output.image_url`, so both work.
    return this.download(job.output?.result ?? job.output?.image_url);
  }

  private async call(method: "GET" | "POST", url: string, body?: unknown): Promise<JobStatus> {
    const res = await this.fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => {
      throw new SceneImageError("scene_failed", "RunPod is not reachable");
    });
    if (!res.ok) {
      // The body can repeat the request, so the message holds only the status code.
      throw new SceneImageError("scene_failed", `RunPod answered with HTTP ${res.status}`);
    }
    return (await res.json().catch(() => ({}))) as JobStatus;
  }

  /** Reads the image from the result URL. The URL comes from a response, so only an https RunPod host is read. */
  private async download(imageUrl: unknown): Promise<Buffer> {
    let url: URL;
    try {
      url = new URL(String(imageUrl));
    } catch {
      throw new SceneImageError("scene_failed", "RunPod gave no image URL");
    }
    const onRunPod = url.hostname === IMAGE_HOST || url.hostname.endsWith(`.${IMAGE_HOST}`);
    if (url.protocol !== "https:" || !onRunPod) {
      throw new SceneImageError("scene_failed", `RunPod gave an image URL on another host: ${url.hostname}`);
    }
    const res = await this.fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).catch(() => {
      throw new SceneImageError("scene_failed", "The image host is not reachable");
    });
    if (!res.ok) {
      throw new SceneImageError("scene_failed", `The image host answered with HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
