import { describe, expect, it } from "vitest";
import { RunPodClient, SceneImageError } from "./runpod-client.js";

const KEY = "rp_test_secret_key";
const PNG = Buffer.from("png-bytes");
const IMAGE_URL = "https://image.runpod.ai/abc/image.png";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch. Each answer is the JSON body, or the bytes, of one call in order. */
function fakeFetch(answers: Array<{ status?: number; json?: unknown; bytes?: Buffer }>) {
  const calls: Call[] = [];
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const answer = answers.shift() ?? { json: { status: "IN_PROGRESS" } };
    const body = answer.bytes ? new Uint8Array(answer.bytes) : JSON.stringify(answer.json ?? {});
    return Promise.resolve(new Response(body, { status: answer.status ?? 200 }));
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

function client(fetchFn: typeof fetch, timeoutMs = 1_000) {
  return new RunPodClient(KEY, { fetch: fetchFn, pollMs: 1, timeoutMs });
}

describe("RunPodClient", () => {
  it("starts a job with /run, reads /status until COMPLETED, and gives the image bytes", async () => {
    const { calls, fetchFn } = fakeFetch([
      { json: { id: "job-1", status: "IN_QUEUE" } },
      { json: { id: "job-1", status: "IN_PROGRESS" } },
      { json: { id: "job-1", status: "COMPLETED", output: { image_url: IMAGE_URL, cost: 0.002 } } },
      { bytes: PNG },
    ]);
    const image = await client(fetchFn).generate({ prompt: "a misty forest", negativePrompt: "nudity" });
    expect(image.equals(PNG)).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/run",
      "GET https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/status/job-1",
      "GET https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/status/job-1",
      `GET ${IMAGE_URL}`,
    ]);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.body).toEqual({
      input: {
        prompt: "a misty forest",
        seed: -1,
        num_inference_steps: 4,
        guidance: 7,
        negative_prompt: "nudity",
        image_format: "png",
        width: 1024,
        height: 1024,
      },
    });
    // The image host gets no key.
    expect(calls[3]!.headers.Authorization).toBeUndefined();
  });

  it("reads the image URL from output.result, the shape that the live endpoint gives", async () => {
    const { calls, fetchFn } = fakeFetch([
      { json: { id: "job-1", status: "IN_QUEUE" } },
      { json: { id: "job-1", status: "COMPLETED", output: { cost: 0.003, result: IMAGE_URL } } },
      { bytes: PNG },
    ]);
    const image = await client(fetchFn).generate({ prompt: "x", negativePrompt: "" });
    expect(image.equals(PNG)).toBe(true);
    expect(calls.at(-1)!.url).toBe(IMAGE_URL);
  });

  it("a FAILED job gives scene_failed", async () => {
    const { fetchFn } = fakeFetch([{ json: { id: "job-1" } }, { json: { id: "job-1", status: "FAILED", error: "oom" } }]);
    await expect(client(fetchFn).generate({ prompt: "x", negativePrompt: "" })).rejects.toMatchObject({
      code: "scene_failed",
    });
  });

  it("a job that passes the time limit gives scene_timeout and is cancelled", async () => {
    const { calls, fetchFn } = fakeFetch([{ json: { id: "job-1" } }]);
    await expect(client(fetchFn, 20).generate({ prompt: "x", negativePrompt: "" })).rejects.toMatchObject({
      code: "scene_timeout",
    });
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      url: "https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/cancel/job-1",
    });
  });

  it("an image URL that is not on an https RunPod host gives scene_failed and is not read", async () => {
    const { calls, fetchFn } = fakeFetch([
      { json: { id: "job-1" } },
      { json: { id: "job-1", status: "COMPLETED", output: { image_url: "http://169.254.169.254/latest" } } },
    ]);
    await expect(client(fetchFn).generate({ prompt: "x", negativePrompt: "" })).rejects.toBeInstanceOf(SceneImageError);
    expect(calls).toHaveLength(2);
  });

  it("an HTTP error from RunPod gives scene_failed, and the message does not hold the key", async () => {
    const { fetchFn } = fakeFetch([{ status: 401, json: { error: `bad key ${KEY}` } }]);
    const error = await client(fetchFn)
      .generate({ prompt: "x", negativePrompt: "" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SceneImageError);
    expect((error as SceneImageError).code).toBe("scene_failed");
    expect((error as Error).message).not.toContain(KEY);
  });
});
